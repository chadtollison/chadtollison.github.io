"""Find and redact personal data in text.

    >>> from scrubpii import redact
    >>> redact("Hi, I'm Sarah Johnson. Call 662-634-1142.")
    "Hi, I'm [PERSON]. Call [PHONE]."

A fine-tuned DistilBERT model (ChadTollison/pii-distilbert-v5) finds the
items, and checksum and format rules double-check them: card numbers must
pass Luhn, IBANs their bank checksum, SSNs the SSA format. The rules also
catch 10-digit US phone numbers with a real area code, valid IBANs and
well-known API key formats even when the model misses them.

The 8-bit model (about 66 MB) runs with ONNX Runtime, so PyTorch is not
needed. It downloads from Hugging Face on first use and is cached, so later
runs start fast and work offline.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

__all__ = ["Entity", "find", "find_many", "redact", "redact_many", "tokenize", "restore", "fake_for", "MODEL_ID",
           "redact_json", "redact_csv", "redact_dataframe", "Guard",
           "add_rule", "add_words", "allow", "teach", "understand", "clear_rules", "load_rules", "rules", "audit", "audit_markdown",
           "ScrubFilter", "scrub_logs"]
__version__ = "0.7.1"

# The model to use: a Hugging Face repo or a local folder. SCRUBPII_MODEL overrides it.
MODEL_ID = os.environ.get("SCRUBPII_MODEL") or "ChadTollison/pii-distilbert-v5"
MODES = ("label", "mask", "fake", "token")
SURE = 0.95     # model confidence that overrides a failed format/checksum check
# Long text is read in windows of this many tokens. The model learned on short
# texts, and on long documents it finds much more when it reads them in short
# pieces (finance set: 0.65 F1 with 512-token windows, 0.76 with 128).
WINDOW = int(os.environ.get("SCRUBPII_WINDOW") or os.environ.get("CHAD_PII_WINDOW") or "128")

_pipelines: Dict[Tuple[str, str], object] = {}


@dataclass
class Entity:
    type: str
    text: str
    start: int
    end: int
    score: float
    rule: Optional[str] = None      # why a rule found or confirmed it, if one did
    source: str = "model"           # "model", "rule", "model+rule" or "custom"
    reason: str = ""                # one line on why it was flagged

    @property
    def confidence(self) -> str:
        """'high', 'medium' or 'low': an easy-to-read band for score."""
        return "high" if self.score >= 0.9 else "medium" if self.score >= 0.7 else "low"

    def as_dict(self) -> dict:
        return {"type": self.type, "text": self.text, "start": self.start, "end": self.end,
                "score": round(self.score, 4), "confidence": self.confidence, "source": self.source,
                "rule": self.rule, "reason": self.reason}


# ---------------------------------------------------------------- checks
AREA_CODES = frozenset((Path(__file__).parent / "area_codes.txt").read_text().split())
PHONE_RE = re.compile(r"(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b")
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")
API_KEY_RE = re.compile(
    r"\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{32,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}"
    r"|(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|glpat-[A-Za-z0-9_-]{20,}"
    r"|npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{30,}|shp(?:at|ss|ca)_[a-fA-F0-9]{32}|xox[abprs]-[A-Za-z0-9-]{20,}"
    r"|AIza[0-9A-Za-z_-]{35}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"
    r"|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})")
# Secrets written as key=value or "key": "value" (passwords, tokens, client secrets).
SECRET_KV_RE = re.compile(
    r"(?i)\b(?:pass(?:word|wd|phrase)?|pwd|secret|client_?secret|api_?key|apikey|access_?key|secret_?key|access_?token"
    r"|auth_?token|refresh_?token|private_?key|token)[\"']?\s*[:=]\s*[\"']?"
    r"(?P<v>(?![\[<{*•]|\$\{|null\b|none\b|true\b|false\b|undefined\b|redacted\b|xxx)[^\s\"',;&<>]{4,})")
BEARER_RE = re.compile(r"\b(?:Bearer|Basic|Token)\s+(?P<v>[A-Za-z0-9._~+/-]{16,}=*)")
URL_PASS_RE = re.compile(r"(?i)\b[a-z][a-z0-9+.-]{1,20}://[^\s:@/]{1,64}:(?P<v>[^\s@/]{3,128})@")
PEM_RE = re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z]+ )*PRIVATE KEY-----")
# Key hints in logs and JSON: user=jalvarez, "name": "Priya Raman".
USER_KV_RE = re.compile(r"\b(?:user(?:_?name)?|login|uid|owner|assignee|author|handle)[\"']?\s*[:=]\s*[\"']?"
                        r"(?P<v>[A-Za-z][A-Za-z0-9._-]{2,31})(?![A-Za-z0-9._-]*@)(?=[\"'\s,;&)}\]]|$)")
_UP, _LO = r"[A-ZÀ-ÖØ-Þ]", r"[^\W\d_'’-]"
_WORD = _UP + r"(?:[^\W\d_]|['’-])+"
NAME_KV_RE = re.compile(
    r"\b(?:(?:full|first|last|given|family|display|customer|contact|patient|employee)_?name)[\"']?\s*[:=]\s*[\"']?"
    r"(?P<v>" + _WORD + r"(?: " + _WORD + r"){0,3})(?=[\"'\s,;&)}\]]|$)"
    r"|\bname[\"']?\s*[:=]\s*[\"']?(?P<v2>" + _WORD + r"(?: " + _WORD + r"){1,3})(?=[\"'\s,;&)}\]]|$)")
PROFILE_RE = re.compile(r"(?i)(?:https?://)?(?:www\.)?(?:linkedin\.com/in|facebook\.com|instagram\.com|twitter\.com|x\.com"
                        r"|tiktok\.com/@|threads\.net/@)/?[A-Za-z0-9_.-]{1,60}[A-Za-z0-9_-]")
MAC_RE = re.compile(r"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b")
CARD_RE = re.compile(r"\b[2-6]\d{3}(?:[ -]?\d){9,15}\b")
SSN_RE = re.compile(r"(?<![\w.])\d{3}([-. ])\d{2}\1\d{4}(?!\w|\.\d)")
SSN_BARE_RE = re.compile(r"(?i)(?:ssn|social security(?: number| no\.?)?)\W{0,12}(\d{9})\b")
DOB_RE = re.compile(r"(?i)\b(?:born(?: on)?|d\.?o\.?b\.?|date of birth|birth ?date|birthday|fecha de nacimiento|nacid[oa] el)\W{0,4}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}|\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,? \d{4}|\d{1,2} de [a-záéíóú]+ de \d{4})")
IPV6_RE = re.compile(r"(?<![\w:])(?=[0-9A-Fa-f:]*:[0-9A-Fa-f]*:)[0-9A-Fa-f:]{2,39}(?![\w:])")


# US health identifiers, each checked the way the issuer checks it.
NPI_RE = re.compile(r"(?i)\bNPI(?:\s*(?:number|no\.?|#))?\W{0,6}(\d{10})\b")
MBI_RE = re.compile(r"(?i)(?<![A-Z0-9])[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d-?[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d-?"
                    r"[AC-HJKMNP-RT-Y]{2}\d{2}(?![A-Z0-9])")
DEA_RE = re.compile(r"(?<![A-Za-z0-9])[ABCDEFGHJKLMPRSTUX][A-Z9]\d{7}(?![A-Za-z0-9])")


def npi_ok(s: str) -> bool:
    """National Provider Identifier: Luhn over '80840' + the 10 digits."""
    return len(s) == 10 and luhn_ok("80840" + s)


def dea_ok(s: str) -> bool:
    """DEA registration number: (d1+d3+d5) + 2*(d2+d4+d6) ends in d7."""
    d = [int(c) for c in s[2:]]
    return len(d) == 7 and (d[0] + d[2] + d[4] + 2 * (d[1] + d[3] + d[5])) % 10 == d[6]


_NOT_USERS = {"id", "null", "none", "anonymous", "guest", "system", "root", "admin", "unknown", "true", "false"}


def secret_ok(s: str) -> bool:
    """A real-looking secret value, not code ("input.value", "getToken()") or a number."""
    if re.fullmatch(r"\d{1,6}", s) or re.search(r"[()]|^\$", s):
        return False
    if re.match(r"(?i)(?:process|os|env|config|settings|self|this|input|req|request|args|params|form)\.", s):
        return False
    return not re.fullmatch(r"[A-Za-z_]\w*\.[A-Za-z_][\w.]*", s)


def ip_ok(s: str) -> bool:
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


SHAPES = {
    "PASSWORD": re.compile(r"[^\s,;]+(?<![.!?])"),   # the whole password, symbols included
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
    m = re.fullmatch(r"(\d{3})[-. ]?(\d{2})[-. ]?(\d{4})", s.strip())
    return bool(m) and m[1] not in ("000", "666") and m[1][0] != "9" and m[2] != "00" and m[3] != "0000"


# Phone numbers whose area code isn't real still deserve hiding when the text
# says they're phone numbers ("Call us at 1-800-123-4567") or when they're
# written the way only phone numbers are written: "(123) 456-7890".
PHONE_WORDS_RE = re.compile(r"(?i)(?:phone|tel\b|tel\.|telephone|call|contact|mobile|cell|fax|text me|whatsapp|"
                            r"reach (?:me|us)|hotline|helpline|toll[- ]free|teléfono|telefono|móvil|movil|llam|"
                            r"téléphone|telefon|handy)")
FORMATTED_PHONE_RE = re.compile(r"(?<![\w+-])(?:\+?1[ .-])?\(\d{3}\) ?\d{3}[ .-]\d{4}\b"
                                r"|(?<![\w+-])\+?1-\d{3}-\d{3}-\d{4}\b")
INTL_PHONE_RE = re.compile(r"(?<![\w+])(?:\[\+\d{1,3}\]|\+\d{1,3})(?:[ .-]?\(?\d{1,5}\)?){1,5}(?![\w-])")


def phone_context(text: str, start: int, window: int = 40) -> bool:
    return bool(PHONE_WORDS_RE.search(text[max(0, start - window):start]))


def intl_phone_ok(s: str) -> bool:
    return 8 <= len(re.sub(r"\D", "", s)) <= 15


def us_phone_ok(s: str) -> bool:
    d = re.sub(r"\D", "", s)
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    if d in ("2147483647", "4294967295"):       # the largest 32-bit numbers, everywhere in code
        return False
    return len(d) == 10 and d[:3] in AREA_CODES and d[3] in "23456789"


CHECK_NAMES = {"CREDIT_CARD": "Luhn checksum", "SSN": "SSN format", "IBAN": "IBAN checksum",
               "PHONE": "phone length", "EMAIL": "email format", "IP_ADDRESS": "IP address format"}


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


# ---------------------------------------------------------------- your own rules
@dataclass
class Rule:
    type: str
    pattern: "re.Pattern"
    group: int = 0
    check: Optional[Callable[[str], bool]] = None
    context: Tuple[str, ...] = ()
    window: int = 40
    why: str = ""
    explain: str = ""               # how a plain-English rule was understood
    near: bool = False              # context word must come right before (at most 2 short words between)

    def as_dict(self) -> dict:
        d = {"type": self.type, "pattern": self.pattern.pattern, "group": self.group,
             "context": list(self.context), "why": self.why, "check": bool(self.check)}
        if self.explain:
            d["explain"] = self.explain
        return d


_custom: List[Rule] = []
_allowed: List["re.Pattern"] = []


def _type_name(t: str) -> str:
    name = re.sub(r"[^A-Z_]+", "_", str(t).upper()).strip("_")
    if not name:
        raise ValueError(f"type name {t!r} needs letters, e.g. 'EMPLOYEE_ID'")
    return name


def add_rule(type: str, pattern=None, *, group: int = 0, check: Optional[Callable[[str], bool]] = None,
             context: Iterable[str] = (), window: int = 40, why: str = "", ignore_case: bool = False) -> Rule:
    r"""Teach scrubpii a pattern of your own, no retraining needed.

        >>> add_rule("EMPLOYEE_ID", r"\bEMP-\d{6}\b")
        >>> redact("Ask EMP-004211 to sign")
        'Ask [EMPLOYEE_ID] to sign'

    group:   redact only this regex group (e.g. the number after a label).
    check:   a function that gets the matched text and returns True to keep it.
    context: words of which at least one must appear within `window`
             characters before the match (case-insensitive), e.g. ["member", "acct"].
    Your rules win over the model where they overlap. Rules apply to every
    find/redact call in this process; clear_rules() removes them.

    Or just say it in English: add_rule("redact any ###-#####-##-RC as an RC code").
    """
    if pattern is None:
        return teach(type)
    rx = pattern if isinstance(pattern, re.Pattern) else re.compile(pattern, re.I if ignore_case else 0)
    if group > rx.groups:
        raise ValueError(f"pattern has {rx.groups} group(s), so group={group} does not exist")
    r = Rule(_type_name(type), rx, group, check, tuple(c.lower() for c in context), window,
             why or f"your rule {_type_name(type)}")
    _custom.append(r)
    return r


def understand(sentence: str) -> str:
    """How scrubpii reads a plain-English rule, without adding it."""
    from ._english import parse
    return parse(sentence).explain


def teach(*sentences: str) -> Optional[Rule]:
    r"""Add rules written in plain English. No regex, no AI model, works offline.

        >>> teach("redact any ###-#####-##-RC as an RC code")
        >>> redact("Ref 123-45678-90-RC is late")
        'Ref [RC_CODE] is late'

    In a shape, # is a digit, @ a letter, ? a letter or digit, * any letters or
    digits; everything else is matched as written, in any case. More examples:

        teach("hide codes like AB-1234 as order number")        # an example works too
        teach('redact 8 digit numbers after "member" as member id')
        teach("redact anything starting with EMP- as employee id")
        teach("redact Globex, Initech and Umbrella as client")
        teach("never redact support@acme.com")
        teach("never redact emails at acme.com")

    Raises ValueError with a hint when it can't read a rule. understand(rule)
    shows how a rule is read; the returned Rule's .explain says it too.
    """
    from ._english import parse
    last = None
    for sentence in sentences:
        p = parse(sentence)
        why = f'your rule: "{sentence.strip()}"'
        if p.action == "allow":
            if p.words:
                allow(*p.words)
            else:
                allow(pattern=p.pattern)
            continue
        if p.words:
            last = add_words(p.type, p.words, why=why)
            last.context, last.explain, last.near = tuple(p.context), p.explain, True
        else:
            last = add_rule(p.type, re.compile(p.pattern, re.I), context=p.context, why=why)
            last.explain, last.near = p.explain, True
    return last


def add_words(type: str, words: Iterable[str], *, ignore_case: bool = True, why: str = "") -> Rule:
    """Always redact these exact words or phrases (client names, project code names ...)."""
    words = sorted({w.strip() for w in words if w and w.strip()}, key=len, reverse=True)
    if not words:
        raise ValueError("give at least one word")
    rx = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, words)) + r")(?!\w)", re.I if ignore_case else 0)
    return add_rule(type, rx, why=why or f"on your {_type_name(type)} list")


def allow(*values: str, pattern: Optional[str] = None) -> None:
    r"""Never redact these values (your company's support line, a public office address ...).

    allow("support@acme.com", "1-800-555-0100") or allow(pattern=r"@acme\.com$").
    An item is kept visible when its whole text matches.
    """
    for v in values:
        _allowed.append(re.compile(re.escape(v.strip()), re.I))
    if pattern:
        _allowed.append(re.compile(pattern, re.I))


def clear_rules() -> None:
    """Remove every rule and allowed value added with add_rule/add_words/allow."""
    _custom.clear()
    _allowed.clear()


def rules() -> List[dict]:
    """The rules you have added, as dicts."""
    return [r.as_dict() for r in _custom] + [{"allow": a.pattern} for a in _allowed]


def load_rules(path: str) -> int:
    """Load rules from a JSON file. Returns how many were added.

        {"rules": [{"type": "EMPLOYEE_ID", "pattern": "\\bEMP-\\d{6}\\b"},
                   {"type": "MEMBER_ID", "pattern": "\\b\\d{8}\\b", "context": ["member"]}],
         "words": {"CLIENT": ["Globex", "Initech"]},
         "allow": ["support@acme.com"],
         "say": ["redact any ###-#####-##-RC as an RC code"]}
    """
    import json
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    n = 0
    for r in cfg.get("rules", []):
        add_rule(r["type"], r["pattern"], group=int(r.get("group", 0)), context=r.get("context", ()),
                 window=int(r.get("window", 40)), why=r.get("why", ""), ignore_case=bool(r.get("ignore_case")))
        n += 1
    for sentence in cfg.get("say", []):
        teach(sentence)
        n += 1
    for typ, words in (cfg.get("words") or {}).items():
        add_words(typ, words)
        n += 1
    allowed = cfg.get("allow", [])
    allow(*[a for a in allowed if isinstance(a, str)])
    for a in allowed:
        if isinstance(a, dict) and a.get("pattern"):
            allow(pattern=a["pattern"])
    return n + len(allowed)


def _context_ok(r: Rule, low: str, start: int) -> bool:
    before = low[max(0, start - r.window):start]
    if not r.near:
        return any(c in before for c in r.context)
    return any(re.search(re.escape(c) + r"[\s:#.\-]*(?:[a-z.]{1,6}[\s:#.\-]+){0,2}$", before) for c in r.context)


def _custom_entities(text: str) -> List[Entity]:
    out = []
    low = text.lower()
    for r in _custom:
        for m in r.pattern.finditer(text):
            s, e = m.span(r.group)
            if s < 0 or e <= s:
                continue
            if r.context and not _context_ok(r, low, s):
                continue
            if r.check and not r.check(m.group(r.group)):
                continue
            out.append(Entity(r.type, text[s:e], s, e, 1.0, r.why, "custom", r.why))
    return out


def _is_allowed(e: Entity) -> bool:
    return any(a.fullmatch(e.text.strip()) for a in _allowed)


# ---------------------------------------------------------------- model
def _backend() -> str:
    """'onnx' (default: small and fast) or 'torch' (pip install scrubpii[torch])."""
    choice = os.environ.get("SCRUBPII_BACKEND", "").lower()
    if choice in ("onnx", "torch"):
        return choice
    try:
        import onnxruntime  # noqa: F401
        return "onnx"
    except ImportError:
        return "torch"


def _get_pipeline(model: str):
    """Load the model once, on first use (importing scrubpii stays instant)."""
    key = (_backend(), model)
    if key not in _pipelines:
        if key[0] == "onnx":
            from ._onnx import OnnxTagger
            _pipelines[key] = OnnxTagger(model, window=WINDOW, stride=WINDOW // 4)
        else:
            from transformers import AutoTokenizer, pipeline
            tok = AutoTokenizer.from_pretrained(model, model_input_names=["input_ids", "attention_mask"])
            tok.model_max_length = min(tok.model_max_length, WINDOW)
            _pipelines[key] = pipeline("token-classification", model=model, tokenizer=tok,
                                       aggregation_strategy="max", stride=WINDOW // 4)
    return _pipelines[key]


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
              ("PHONE", FORMATTED_PHONE_RE, lambda s: True, "written like a phone number"),
              ("PHONE", INTL_PHONE_RE, intl_phone_ok, "international phone number (+country code)"),
              ("PHONE", PHONE_RE, "context", "phone-shaped number after 'phone', 'call' or 'contact'"),
              ("IBAN", IBAN_RE, iban_ok, "IBAN checksum"),
              ("API_KEY", API_KEY_RE, lambda s: True, "known API key format"),
              ("PRIVATE_KEY", PEM_RE, lambda s: True, "a private key block"),
              ("PASSWORD", SECRET_KV_RE, secret_ok, "a value after 'password', 'secret' or 'token'"),
              ("API_KEY", BEARER_RE, lambda s: bool(re.search(r"\d", s) and re.search(r"[A-Za-z]", s)), "a bearer token"),
              ("PASSWORD", URL_PASS_RE, lambda s: True, "a password inside a link"),
              ("CREDIT_CARD", CARD_RE, luhn_ok, "card number with valid Luhn checksum"),
              ("SSN", SSN_RE, ssn_ok, "valid SSN format"),
              ("SSN", SSN_BARE_RE, ssn_ok, "9 digits right after 'SSN'"),
              ("EMAIL", SHAPES["EMAIL"], "email", "email address format"),
              ("IP_ADDRESS", SHAPES["IP_ADDRESS"], "ipv4", "valid IP address"),
              ("IP_ADDRESS", IPV6_RE, ip_ok, "valid IPv6 address"),
              ("MAC_ADDRESS", MAC_RE, lambda s: True, "MAC address format"),
              ("PROFILE_URL", PROFILE_RE, lambda s: not re.search(r"(?i)/(?:home|login|share|intent|search|explore|hashtag)/?$", s),
               "a social media profile link"),
              ("DATE_OF_BIRTH", DOB_RE, lambda s: True, "a date right after 'born' or 'DOB'"),
              ("ID_NUMBER", NPI_RE, npi_ok, "NPI (provider number) with a valid check digit"),
              ("ID_NUMBER", MBI_RE, lambda s: True, "Medicare Beneficiary Identifier format"),
              ("ID_NUMBER", DEA_RE, dea_ok, "DEA registration number with a valid check digit"),
              ("USERNAME", USER_KV_RE, lambda s: s.lower() not in _NOT_USERS, "a value after 'user='"),
              ("PERSON", NAME_KV_RE, lambda s: s not in ("Null", "None", "Unknown", "Test", "Default"), "a value after 'name='")]
    soft = (USER_KV_RE, NAME_KV_RE)          # key hints never override what the model or a stronger rule found
    exact = (URL_PASS_RE,)                   # only the password, not the whole link the model may have marked
    for typ, rx, ok, why in checks:
        for m in rx.finditer(text):
            g = 1 if rx in (SSN_BARE_RE, DOB_RE, NPI_RE) else 0
            if "v" in rx.groupindex:
                g = "v" if m.group("v") is not None else "v2"
            ms, me = m.start(g), m.end(g)
            if ok == "context":
                if not phone_context(text, ms):
                    continue
            elif ok == "email":
                if re.search(r"://[^\s@/]*$", text[max(0, ms - 80):ms]):    # user:password@host is not an email
                    continue
            elif ok == "ipv4":
                if not ip_ok(m.group(g)) or re.search(r"(?i)\b(?:v|ver|version)\.?\s?$", text[max(0, ms - 9):ms]) \
                        or text[me:me + 2][:1] == "." and text[me + 1:me + 2].isdigit():
                    continue
            elif not ok(m.group(g)):
                continue
            hits = [e for e in ents if e.start < me and e.end > ms]
            if not hits:
                ents.append(Entity(typ, m.group(g), ms, me, 1.0, why, "rule"))
                continue
            if rx in soft:
                continue
            for e in hits:
                if e.source == "rule":     # an earlier, more specific rule already settled this one
                    continue
                # Phone, card and SSN rules only relabel the model's find when
                # its own label fails its check (e.g. "card number" that fails Luhn).
                if typ in ("PHONE", "CREDIT_CARD", "SSN", "EMAIL", "IP_ADDRESS") and e.type != typ and _valid(e):
                    continue
                if e.source == "custom":
                    continue
                e.type, e.rule, e.score = typ, why, 1.0
                e.source = "model+rule" if e.source == "model" else e.source
                if rx in exact:
                    e.start, e.end = ms, me
                else:
                    e.start, e.end = min(e.start, ms), max(e.end, me)
                e.text = text[e.start:e.end]
    # Names the model missed but the text gives away: "Sarah Johnson" next to
    # sarah.johnson@..., and every other mention of a name already found.
    def add_name(a: int, b: int, why: str) -> None:
        if not any(e.start < b and e.end > a for e in ents):
            ents.append(Entity("PERSON", text[a:b], a, b, 1.0, why, "rule"))
    for e in [e for e in ents if e.type == "EMAIL"]:
        parts = [p for p in re.split(r"[._-]+", e.text.split("@")[0]) if re.fullmatch(r"[^\W\d_]{2,}", p)]
        if not 2 <= len(parts) <= 3:
            continue
        for m in re.finditer(r"(?<![^\W\d_])" + r"\s+".join(map(re.escape, parts)) + r"(?![^\W\d_])", text, re.I):
            if all(w[:1].isupper() for w in m.group().split()):
                add_name(m.start(), m.end(), "the same name as in an email address")
    for e in [e for e in ents if e.type == "PERSON" and e.source == "model" and e.score >= 0.5]:
        if len(e.text) < 3 or not e.text[:1].isupper():
            continue
        for m in re.finditer(r"(?<!\w)" + re.escape(e.text) + r"(?!\w)", text):
            add_name(m.start(), m.end(), "the same name found elsewhere in the text")
    ents.sort(key=lambda e: (e.start, -e.end))
    kept: List[Entity] = []
    for e in ents:
        if kept and e.start < kept[-1].end:
            k = kept[-1]
            if e.source == "custom" and k.source != "custom":   # your rule names the item
                k.type, k.rule, k.source, k.reason, k.score = e.type, e.rule, "custom", e.reason, 1.0
            if e.end > k.end:
                k.end, k.text = e.end, text[k.start:e.end]
            continue
        kept.append(e)
    # "1600 Pennsylvania Ave NW, Washington" + "DC 20500" is one address.
    i = len(kept) - 1
    while i > 0:
        a, b = kept[i - 1], kept[i]
        if a.type == b.type == "ADDRESS" and re.fullmatch(r"[ ,]{1,3}", text[a.end:b.start]):
            a.end, a.text, a.score = b.end, text[a.start:b.end], min(a.score, b.score)
            del kept[i]
        i -= 1
    for e in kept:
        # A secret or username grown over its key ("password=hunter2") keeps only the value.
        kv = re.match(r"[A-Za-z_][\w.-]{0,40}[\"']?\s*[:=](?!//)\s*[\"']?(?=\S)", e.text)
        if kv and re.search(r"PASSWORD|SECRET|API|USER|TOKEN", e.type) and len(e.text) > kv.end() + 2:
            e.start += kv.end()
        while e.end > e.start and text[e.end - 1] in "\"'`" and text[e.start] not in "\"'`":
            e.end -= 1
        e.text = text[e.start:e.end]
    # Model guesses too short to be personal data ("Q3", "B", "12").
    return [e for e in kept if not (e.source == "model" and e.type == "ADDRESS"
                                    and (len(e.text) <= 3 or re.fullmatch(r"(?i)Q[1-4]|[A-Z]?\d{1,3}[A-Z]?", e.text)))]


def find(text: str, min_score: float = 0.5, model: str = MODEL_ID, fast: bool = False) -> List[Entity]:
    """Return the personal data found in `text`, in order.

    Items the rules found or confirmed are always returned. Others need a model
    confidence of at least `min_score`, and must pass their type's check
    (Luhn for cards, checksum for IBANs, format for SSNs...) unless the model
    is at least 95% sure.

    fast=True skips the model and runs only the rules (emails, phones, SSNs,
    cards, IBANs, IPs, API keys, your own rules). It takes microseconds, which
    suits log lines and big scans, but it does not find names or addresses.
    """
    if not text.strip():
        return []
    return _finish(text, [] if fast else _model_entities(text, model), min_score)


def _finish(text: str, ents: List[Entity], min_score: float, dropped: Optional[List[Entity]] = None) -> List[Entity]:
    _grow(ents, text)
    ents = _rules(ents + _custom_entities(text), text)
    # A failed check (Luhn, SSN format ...) drops an item unless the model is
    # very sure: for a redactor, hiding a mistyped card number beats leaking it.
    kept = []
    for e in ents:
        pct = f"{e.score:.0%}"
        check = CHECK_NAMES.get(e.type)
        if e.source == "custom":
            e.reason = e.rule or "your rule"
        elif e.source == "rule":
            e.reason = f"rule: {e.rule}"
        elif e.source == "model+rule":
            e.reason = f"model found it, rule confirmed: {e.rule}"
        elif e.score < min_score:
            e.reason = f"model only {pct} sure, below min_score {min_score:g}"
        elif not _valid(e) and e.score < SURE:
            e.reason = f"model {pct} sure but it fails the {check}"
        elif not _valid(e):
            e.reason = f"model {pct} sure, kept although it fails the {check} (hiding beats leaking)"
        else:
            e.reason = f"model {pct} sure" + (f", passes the {check}" if check else "")
        keep = e.rule or (e.score >= min_score and (e.score >= SURE or _valid(e)))
        if keep and _allowed and _is_allowed(e):
            keep, e.reason = False, "on your allow list"
        (kept if keep else dropped if dropped is not None else []).append(e)
    return kept


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


def redact(text: str, mode: str = "label", min_score: float = 0.5, model: str = MODEL_ID, fast: bool = False) -> str:
    """Return `text` with personal data replaced.

    mode="label" -> [PHONE]   mode="mask" -> ████   mode="fake" -> (202) 555-0142
    mode="token" -> <PHONE_1> (use tokenize() to also get the key back)
    fast=True runs only the rules, no model (see find()).
    """
    return _apply(text, find(text, min_score, model, fast), mode)[0]


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


# ---------------------------------------------------------------- audit
def _preview(v: str) -> str:
    v = v.strip()
    if len(v) <= 4:
        return "*" * len(v)
    return v[0] + "*" * (len(v) - 2) + v[-1]


def audit(text: str, mode: str = "label", min_score: float = 0.5, model: str = MODEL_ID,
          include_values: bool = False, include_dropped: bool = True) -> dict:
    """Redact `text` and explain every decision, for review or a compliance log.

    Returns a dict with the redacted text, one entry per item (type, position,
    score, confidence band, whether the model or a rule found it, and why),
    counts by type, and the items that were looked at but left visible (low
    score, failed check, allowed) with the reason.

    The report holds no personal data unless include_values=True: values are
    shown as previews like "S***********n", and the input is identified by its
    SHA-256 hash.
    """
    import datetime
    dropped: List[Entity] = []
    ents = _finish(text, _model_entities(text, model), min_score, dropped) if text.strip() else []
    redacted = _apply(text, ents, mode)[0]

    def row(e: Entity) -> dict:
        d = {"type": e.type, "start": e.start, "end": e.end, "score": round(e.score, 4),
             "confidence": e.confidence, "source": e.source, "reason": e.reason,
             "preview": _preview(e.text)}
        if include_values:
            d["text"] = e.text
        return d

    counts: Dict[str, int] = {}
    for e in ents:
        counts[e.type] = counts.get(e.type, 0) + 1
    return {
        "scrubpii": __version__, "model": model, "backend": _backend(),
        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "input_sha256": hashlib.sha256(text.encode()).hexdigest(), "input_chars": len(text),
        "settings": {"mode": mode, "min_score": min_score, "custom_rules": len(_custom), "allowed": len(_allowed)},
        "redacted": redacted,
        "counts": dict(sorted(counts.items())),
        "items": [row(e) for e in ents],
        "left_visible": [row(e) for e in dropped] if include_dropped else [],
    }


def audit_markdown(report: dict) -> str:
    """A readable Markdown version of an audit() report."""
    lines = [f"# scrubpii audit", "",
             f"- Created: {report['created']}", f"- scrubpii {report['scrubpii']}, model `{report['model']}` "
             f"({report['backend']})", f"- Input: {report['input_chars']} characters, SHA-256 `{report['input_sha256'][:16]}...`",
             f"- Settings: mode `{report['settings']['mode']}`, min_score {report['settings']['min_score']}, "
             f"{report['settings']['custom_rules']} custom rule(s), {report['settings']['allowed']} allowed value(s)", "",
             f"## Redacted ({len(report['items'])} items)", ""]
    if report["counts"]:
        lines.append(", ".join(f"{t}: {n}" for t, n in report["counts"].items()))
        lines.append("")
    for title, items in (("Items", report["items"]), ("Looked at, left visible", report["left_visible"])):
        if not items:
            continue
        if title != "Items":
            lines += [f"## {title}", ""]
        lines += ["| # | Type | Where | Value | Score | Found by | Why |", "|---:|---|---|---|---:|---|---|"]
        for i, it in enumerate(items, 1):
            val = it.get("text", it["preview"]).replace("|", "\\|")
            why = it["reason"].replace("|", "\\|")
            lines.append(f"| {i} | {it['type']} | {it['start']}-{it['end']} | `{val}` | {it['score']:.2f} "
                         f"({it['confidence']}) | {it['source']} | {why} |")
        lines.append("")
    return "\n".join(lines)


def restore(text: str, key: Dict[str, str]) -> str:
    """Put real values back into tokenized text."""
    return re.sub(r"<[A-Z_]+_\d+>", lambda m: key.get(m.group(), m.group()), text)


from .structured import redact_csv, redact_dataframe, redact_json  # noqa: E402
from .guard import Guard  # noqa: E402
from .logs import ScrubFilter, scrub_logs  # noqa: E402
