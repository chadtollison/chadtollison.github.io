"""Find and redact personal data in text.

    >>> from piiguard import redact
    >>> redact("Hi, I'm Sarah Johnson. Call 662-634-1142.")
    "Hi, I'm [PERSON]. Call [PHONE]."

A fine-tuned DistilBERT model (ChadTollison/pii-distilbert-v3) finds the
items, and checksum and format rules double-check them: card numbers must
pass Luhn, IBANs their bank checksum, SSNs the SSA format. The rules also
catch 10-digit US phone numbers with a real area code, valid IBANs and
well-known API key formats even when the model misses them.

The model (about 260 MB) downloads from Hugging Face on first use and is
cached, so later runs work offline.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

__all__ = ["Entity", "find", "find_many", "redact", "redact_many", "tokenize", "restore", "fake_for", "MODEL_ID",
           "redact_json", "redact_csv", "redact_dataframe", "Guard"]
__version__ = "0.3.0"

MODEL_ID = "ChadTollison/pii-distilbert-v3"
MODES = ("label", "mask", "fake", "token")
SURE = 0.95     # model confidence that overrides a failed format/checksum check
# Long text is read in windows of this many tokens. The model learned on short
# texts, and on long documents it finds much more when it reads them in short
# pieces (finance set: 0.65 F1 with 512-token windows, 0.76 with 128).
WINDOW = int(os.environ.get("PIIGUARD_WINDOW") or os.environ.get("CHAD_PII_WINDOW") or "128")

_pipeline = None
_pipeline_id = None


@dataclass
class Entity:
    type: str
    text: str
    start: int
    end: int
    score: float
    rule: Optional[str] = None      # why a rule found or confirmed it, if one did

    def as_dict(self) -> dict:
        return {"type": self.type, "text": self.text, "start": self.start, "end": self.end,
                "score": round(self.score, 4), "rule": self.rule}


# ---------------------------------------------------------------- checks
AREA_CODES = frozenset((Path(__file__).parent / "area_codes.txt").read_text().split())
PHONE_RE = re.compile(r"(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b")
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")
API_KEY_RE = re.compile(
    r"\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}"
    r"|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35})")
CARD_RE = re.compile(r"\b[2-6]\d{3}(?:[ -]?\d){9,15}\b")
SSN_RE = re.compile(r"\b\d{3}([- ])\d{2}\1\d{4}\b")
SSN_BARE_RE = re.compile(r"(?i)(?:ssn|social security(?: number| no\.?)?)\W{0,12}(\d{9})\b")
DOB_RE = re.compile(r"(?i)\b(?:born(?: on)?|d\.?o\.?b\.?|date of birth|birth ?date|birthday|fecha de nacimiento|nacid[oa] el)\W{0,4}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}|\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,? \d{4}|\d{1,2} de [a-záéíóú]+ de \d{4})")
IPV6_RE = re.compile(r"(?<![\w:])(?=[0-9A-Fa-f:]*:[0-9A-Fa-f]*:)[0-9A-Fa-f:]{2,39}(?![\w:])")


def ip_ok(s: str) -> bool:
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


SHAPES = {
    "EMAIL": re.compile(r"[\w.%+-]+@[\w.-]+\.[^\W\d_]{2,}"),
    "PHONE": PHONE_RE,
    "SSN": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "CREDIT_CARD": re.compile(r"\b\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}\b"),
    "IP_ADDRESS": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "IBAN": IBAN_RE,
    "API_KEY": API_KEY_RE,
}


def luhn_ok(s: str) -> bool:
    digits = [int(c) for c in s if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2:
            d *= 2
            d -= 9 if d > 9 else 0
        total += d
    return total % 10 == 0


def iban_ok(s: str) -> bool:
    v = re.sub(r"\s+", "", s).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", v):
        return False
    return int("".join(str(int(c, 36)) for c in v[4:] + v[:4])) % 97 == 1


def ssn_ok(s: str) -> bool:
    m = re.fullmatch(r"(\d{3})[- ]?(\d{2})[- ]?(\d{4})", s.strip())
    return bool(m) and m[1] not in ("000", "666") and m[1][0] != "9" and m[2] != "00" and m[3] != "0000"


def us_phone_ok(s: str) -> bool:
    d = re.sub(r"\D", "", s)
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    return len(d) == 10 and d[:3] in AREA_CODES and d[3] in "23456789"


def _valid(e: Entity) -> bool:
    t, s = e.type, e.text
    if t == "CREDIT_CARD":
        return luhn_ok(s)
    if t == "SSN":
        return ssn_ok(s)
    if t == "IBAN":
        return iban_ok(s)
    if t == "PHONE":
        return len(re.sub(r"\D", "", s)) >= 7
    if t == "EMAIL":
        return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", s))
    if t == "IP_ADDRESS":
        parts = s.split(".")
        return len(parts) == 4 and all(p.isdigit() and int(p) <= 255 for p in parts)
    return True


# ---------------------------------------------------------------- model
def _get_pipeline(model: str):
    global _pipeline, _pipeline_id
    if _pipeline is None or _pipeline_id != model:
        from transformers import AutoTokenizer, pipeline
        tok = AutoTokenizer.from_pretrained(model, model_input_names=["input_ids", "attention_mask"])
        tok.model_max_length = min(tok.model_max_length, WINDOW)
        _pipeline = pipeline("token-classification", model=model, tokenizer=tok,
                             aggregation_strategy="max", stride=WINDOW // 4)
        _pipeline_id = model
    return _pipeline


def _model_entities(text: str, model: str, items=None) -> List[Entity]:
    out = []
    for item in (items if items is not None else _get_pipeline(model)(text)):
        s, e = item["start"], item["end"]
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e > s:
            out.append(Entity(item["entity_group"], text[s:e], s, e, float(item["score"])))
    # Join a name split into pieces ("José" + "Álvarez").
    joined: List[Entity] = []
    for ent in out:
        prev = joined[-1] if joined else None
        if prev and prev.type == ent.type and text[prev.end:ent.start] in ("", " "):
            prev.end, prev.text = ent.end, text[prev.start:ent.end]
            prev.score = min(prev.score, ent.score)
        else:
            joined.append(ent)
    return joined


def _grow(ents: List[Entity], text: str) -> None:
    """Grow a partly-found item to the full email, phone, card... it is part of."""
    for e in ents:
        rx = SHAPES.get(e.type)
        if not rx:
            continue
        for m in rx.finditer(text):
            if m.start() < e.end and m.end() > e.start:
                e.start, e.end = min(e.start, m.start()), max(e.end, m.end())
                e.text = text[e.start:e.end]
                break
        if e.type in ("SSN", "PHONE"):
            digits = re.sub(r"\D", "", e.text)
            if re.fullmatch(r"\d{3}-\d{2}-\d{4}", e.text.strip()):
                e.type = "SSN"
            elif 10 <= len(digits) <= 11:
                e.type = "PHONE"


def _rules(ents: List[Entity], text: str) -> List[Entity]:
    checks = [("PHONE", PHONE_RE, us_phone_ok, "real US/Canada area code"),
              ("IBAN", IBAN_RE, iban_ok, "IBAN checksum"),
              ("API_KEY", API_KEY_RE, lambda s: True, "known API key format"),
              ("CREDIT_CARD", CARD_RE, luhn_ok, "card number with valid Luhn checksum"),
              ("SSN", SSN_RE, ssn_ok, "valid SSN format"),
              ("SSN", SSN_BARE_RE, ssn_ok, "9 digits right after 'SSN'"),
              ("EMAIL", SHAPES["EMAIL"], lambda s: True, "email address format"),
              ("IP_ADDRESS", SHAPES["IP_ADDRESS"], ip_ok, "valid IP address"),
              ("IP_ADDRESS", IPV6_RE, ip_ok, "valid IPv6 address"),
              ("DATE_OF_BIRTH", DOB_RE, lambda s: True, "a date right after 'born' or 'DOB'")]
    for typ, rx, ok, why in checks:
        for m in rx.finditer(text):
            g = 1 if rx in (SSN_BARE_RE, DOB_RE) else 0
            ms, me = m.start(g), m.end(g)
            if not ok(m.group(g)):
                continue
            hits = [e for e in ents if e.start < me and e.end > ms]
            if not hits:
                ents.append(Entity(typ, m.group(g), ms, me, 1.0, why))
            for e in hits:
                # Phone, card and SSN rules only relabel the model's find when
                # its own label fails its check (e.g. "card number" that fails Luhn).
                if typ in ("PHONE", "CREDIT_CARD", "SSN", "EMAIL", "IP_ADDRESS") and e.type != typ and _valid(e):
                    continue
                e.type, e.rule, e.score = typ, why, 1.0
                e.start, e.end = min(e.start, ms), max(e.end, me)
                e.text = text[e.start:e.end]
    ents.sort(key=lambda e: (e.start, -e.end))
    kept: List[Entity] = []
    for e in ents:
        if kept and e.start < kept[-1].end:
            k = kept[-1]
            if e.end > k.end:
                k.end, k.text = e.end, text[k.start:e.end]
            continue
        kept.append(e)
    return kept


def find(text: str, min_score: float = 0.5, model: str = MODEL_ID) -> List[Entity]:
    """Return the personal data found in `text`, in order.

    Items the rules found or confirmed are always returned. Others need a model
    confidence of at least `min_score`, and must pass their type's check
    (Luhn for cards, checksum for IBANs, format for SSNs...) unless the model
    is at least 95% sure.
    """
    if not text.strip():
        return []
    return _finish(text, _model_entities(text, model), min_score)


def _finish(text: str, ents: List[Entity], min_score: float) -> List[Entity]:
    _grow(ents, text)
    ents = _rules(ents, text)
    # A failed check (Luhn, SSN format ...) drops an item unless the model is
    # very sure: for a redactor, hiding a mistyped card number beats leaking it.
    return [e for e in ents if e.rule or (e.score >= min_score and (e.score >= SURE or _valid(e)))]


def find_many(texts: List[str], min_score: float = 0.5, model: str = MODEL_ID, batch_size: int = 16) -> List[List[Entity]]:
    """find() for many texts at once. Batched, so much faster than a loop."""
    texts = list(texts)
    todo = [i for i, t in enumerate(texts) if t and t.strip()]
    out: List[List[Entity]] = [[] for _ in texts]
    if todo:
        results = _get_pipeline(model)([texts[i] for i in todo], batch_size=batch_size)
        for i, items in zip(todo, results):
            out[i] = _finish(texts[i], _model_entities(texts[i], model, items), min_score)
    return out


# ---------------------------------------------------------------- redaction
_FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Rowan", "Drew", "Skyler"]
_LAST = ["Rivera", "Brooks", "Hayes", "Bennett", "Foster", "Reed", "Parker", "Ellis", "Price", "Shaw", "Lane", "Cole"]
_CARDS = ["4111 1111 1111 1111", "5500 0000 0000 0004", "3782 822463 10005", "6011 1111 1111 1117"]
_STREETS = ["Example Street", "Sample Avenue", "Placeholder Road", "Fictional Lane", "Demo Drive"]
_IBANS = ["GB82 WEST 1234 5698 7654 32", "DE89 3704 0044 0532 0130 00", "FR14 2004 1010 0505 0001 3M02 606"]


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest()[:12], 16)


def fake_for(e: Entity) -> str:
    """A realistic but harmless stand-in. The same input always gets the same fake."""
    h = _h(e.type + "|" + e.text)
    first, last = _FIRST[h % 12], _LAST[(h >> 8) % 12]
    same = lambda x: re.sub(r"\s", "", x) == re.sub(r"\s", "", e.text)
    if e.type == "PERSON":
        return f"{first} {last}" if " " in e.text.strip() else first
    if e.type == "EMAIL":
        return f"{first}.{last}@example.com".lower()
    if e.type == "PHONE":
        return f"(202) 555-01{h % 100:02d}"                        # 555-0100..0199 are reserved for fiction
    if e.type == "SSN":
        return f"9{h % 100:02d}-{(h >> 7) % 90 + 10}-{(h >> 3) % 9000 + 1000}"   # SSNs never start with 9
    if e.type == "CREDIT_CARD":
        c = [x for x in _CARDS if not same(x)]
        return c[h % len(c)]
    if e.type == "IP_ADDRESS":
        return f"203.0.113.{h % 254 + 1}"                          # documentation-only range
    if e.type == "IBAN":
        c = [x for x in _IBANS if not same(x)]
        return c[h % len(c)]
    if e.type == "PASSPORT":
        return f"X{h % 10**8:08d}"
    if e.type == "DRIVER_LICENSE":
        return f"D{h % 10**7:07d}"
    if e.type == "API_KEY":
        return f"sk_example_{h:016x}"[:27]
    if e.type == "ADDRESS":
        return f"{h % 900 + 100} {_STREETS[h % len(_STREETS)]}"
    if e.type == "ID_NUMBER":
        return f"ID-{h % 10**8:08d}"
    if e.type == "DATE_OF_BIRTH":
        return f"01/01/{1950 + h % 50}"
    if e.type == "USERNAME":
        return f"user{h % 10**5:05d}"
    if e.type == "PASSWORD":
        return "********"
    return f"[{e.type}]"


def _apply(text: str, ents: List[Entity], mode: str, key: Optional[Dict[str, str]] = None) -> Tuple[str, Dict[str, str]]:
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    key = {} if key is None else key          # token -> real value; reused across calls when given
    tokens: Dict[Tuple[str, str], str] = {}
    counts: Dict[str, int] = {}
    for tok, val in key.items():
        m = re.fullmatch(r"<([A-Z_]+)_(\d+)>", tok)
        if m:
            tokens[(m[1], val)] = tok
            counts[m[1]] = max(counts.get(m[1], 0), int(m[2]))
    out, pos = [], 0
    for e in ents:
        if mode == "label":
            rep = f"[{e.type}]"
        elif mode == "mask":
            rep = "█" * len(e.text)
        elif mode == "fake":
            rep = fake_for(e)
        else:
            if (e.type, e.text) not in tokens:
                counts[e.type] = counts.get(e.type, 0) + 1
                tokens[(e.type, e.text)] = f"<{e.type}_{counts[e.type]}>"
                key[tokens[(e.type, e.text)]] = e.text
            rep = tokens[(e.type, e.text)]
        out += [text[pos:e.start], rep]
        pos = e.end
    out.append(text[pos:])
    return "".join(out), key


def redact(text: str, mode: str = "label", min_score: float = 0.5, model: str = MODEL_ID) -> str:
    """Return `text` with personal data replaced.

    mode="label" -> [PHONE]   mode="mask" -> ████   mode="fake" -> (202) 555-0142
    mode="token" -> <PHONE_1> (use tokenize() to also get the key back)
    """
    return _apply(text, find(text, min_score, model), mode)[0]


def redact_many(texts: List[str], mode: str = "label", min_score: float = 0.5, model: str = MODEL_ID) -> List[str]:
    """redact() for many texts at once (batched)."""
    texts = list(texts)
    return [_apply(t, ents, mode)[0] for t, ents in zip(texts, find_many(texts, min_score, model))]


def tokenize(text: str, min_score: float = 0.5, model: str = MODEL_ID,
             key: Optional[Dict[str, str]] = None) -> Tuple[str, Dict[str, str]]:
    """Replace personal data with tokens like <PERSON_1>. Returns (text, key).

    Keep the key somewhere safe; restore(text, key) puts the real values back.
    The same value always gets the same token. Pass the key from an earlier
    call to keep tokens consistent across several texts (e.g. a chat).
    """
    return _apply(text, find(text, min_score, model), "token", key)


def restore(text: str, key: Dict[str, str]) -> str:
    """Put real values back into tokenized text."""
    return re.sub(r"<[A-Z_]+_\d+>", lambda m: key.get(m.group(), m.group()), text)


from .structured import redact_csv, redact_dataframe, redact_json  # noqa: E402
from .guard import Guard  # noqa: E402
