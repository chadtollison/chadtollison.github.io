"""Turn a plain-English rule into a pattern, offline, with no AI model.

    redact any ###-#####-##-RC as an RC code
    hide codes like AB-1234 as order number
    redact 8 digit numbers after "member" as member id
    redact anything starting with EMP- as employee id
    redact Globex, Initech and Umbrella as client
    never redact support@acme.com
    never redact emails at acme.com

In a shape, # is a digit, @ is a letter, ? is a letter or digit and * is a run
of letters and digits. Everything else is matched as written (letters in any
case). After "like", an example stands for its shape: each digit stands for
any digit, letters and symbols stay as written.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

REDACT = r"(?:please\s+)?(?:redact|hide|mask|remove|scrub|block|blank out|black out|censor|flag|catch|find|treat)"
ALLOW = r"(?:never|don'?t|do not|please don'?t)\s+(?:redact|hide|mask|remove|scrub|touch|flag)|keep|allow|ignore|skip|leave"


@dataclass
class Parsed:
    action: str                    # "redact" or "allow"
    type: str
    pattern: str = ""              # regex, for shapes
    words: List[str] = field(default_factory=list)
    context: List[str] = field(default_factory=list)
    explain: str = ""


class RuleNotUnderstood(ValueError):
    def __init__(self, why: str):
        super().__init__(f"{why}. Try something like: redact any ###-#####-##-RC as an RC code "
                         f"(# is a digit, @ a letter), or: redact Globex and Initech as client")


def _type_name(label: str) -> str:
    label = re.sub(r"(?i)\b(?:please|thanks?|thank you)\b", "", label)
    name = re.sub(r"[^A-Za-z]+", "_", label).strip("_").upper()
    return name or "CUSTOM"


def _split_list(s: str) -> List[str]:
    parts = re.split(r"\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+", s.strip())
    out = []
    for p in parts:
        p = p.strip().strip("\"'“”‘’`").strip()
        if p:
            out.append(p)
    return out


def _n(k: int, one: str, many: str) -> str:
    return f"{k} {one if k == 1 else many}"


def _shape(template: str, example: bool = False):
    """Return (regex, explanation) for a shape like ###-#####-##-RC."""
    rx, said = [], []
    i = 0
    while i < len(template):
        c = template[i]
        j = i
        while j < len(template) and template[j] == c:
            j += 1
        k = j - i
        if c == "#" or (example and c.isdigit()):
            if example:                       # 1234 -> any 4 digits (a run of different digits)
                j = i
                while j < len(template) and template[j].isdigit():
                    j += 1
                k = j - i
            rx.append(r"\d" if k == 1 else rf"\d{{{k}}}")
            said.append(_n(k, "digit", "digits"))
        elif c == "@" and not example:
            rx.append(r"[A-Za-z]" if k == 1 else rf"[A-Za-z]{{{k}}}")
            said.append(_n(k, "letter", "letters"))
        elif c == "?" and not example:
            rx.append(r"[A-Za-z0-9]" if k == 1 else rf"[A-Za-z0-9]{{{k}}}")
            said.append(_n(k, "letter or digit", "letters or digits"))
        elif c == "*" and not example:
            rx.append(r"[A-Za-z0-9]+")
            said.append("any letters or digits")
            j = i + 1
        elif c.isspace():
            while j < len(template) and template[j].isspace():
                j += 1
            rx.append(r"\s+")
            said.append("a space")
        else:                                  # literal text, up to the next special character
            j = i
            special = "#@?* \t" if not example else " \t0123456789"
            while j < len(template) and template[j] not in special:
                j += 1
            lit = template[i:j]
            rx.append(re.escape(lit))
            said.append(f'"{lit}"')
        i = j
    regex = r"(?<![A-Za-z0-9])" + "".join(rx) + r"(?![A-Za-z0-9])"
    return regex, ", then ".join(said)


def _what(rest: str):
    """The thing to redact -> (regex or None, words, explanation)."""
    r = rest.strip().strip("\"'“”`")
    m0 = re.match(r"(?i)(?:any|all|every|each|the)\s+", r)
    any_word = bool(m0)
    if m0:
        r = r[m0.end():]

    m = re.match(r"(?:\w+\s+){0,3}?(?:that\s+)?(?:look(?:s|ing)?\s+like|shaped\s+like|formatted\s+like|like|such\s+as|in\s+the\s+form(?:at)?\s+(?:of\s+)?)\s*(.+)$", r, re.I)
    if m and not re.search(r"[#@?*]", m.group(1)):
        ex = m.group(1).strip().strip("\"'“”`")
        rx, said = _shape(ex, example=True)
        return rx, [], f"anything shaped like {ex}: {said}"
    if m:
        r = m.group(1).strip().strip("\"'“”`")

    m = re.match(r"(\d+)\s*(?:-|to|or)\s*(\d+)[\s-]*digits?(?:\s+\w+)?$", r, re.I) \
        or re.match(r"(?:\w+\s+)?(?:with|of)\s+(\d+)\s*(?:-|to|or)\s*(\d+)\s+digits$", r, re.I)
    if m:
        a, b = sorted((int(m.group(1)), int(m.group(2))))
        return rf"(?<!\d)\d{{{a},{b}}}(?!\d)", [], f"any number with {a} to {b} digits"
    m = re.match(r"(\d+)[\s-]*digits?(?:\s+\w+)?$", r, re.I) or re.match(r"(?:\w+\s+)?(?:with|of)\s+(\d+)\s+digits$", r, re.I)
    if m:
        k = int(m.group(1))
        return rf"(?<!\d)\d{{{k}}}(?!\d)", [], f"any {k}-digit number"
    if re.fullmatch(r"(?:numbers?|digits)", r, re.I):
        return r"(?<!\d)\d+(?!\d)", [], "any number"

    m = re.match(r"(?:e-?mails?|e-?mail addresses)\s+(?:at|from|ending\s+(?:in|with)|on|@)\s+@?(\S+)$", r, re.I)
    if m:
        dom = m.group(1).strip("\"'“”`").lstrip("@")
        return rf"[\w.%+-]+@(?:[\w-]+\.)*{re.escape(dom)}(?![\w.-]*\w)", [], f"any email address at {dom}"
    m = re.match(r"(?:\w+\s+)?(?:that\s+)?(?:starts?|starting|begins?|beginning)\s+with\s+(\S+)$", r, re.I)
    if m:
        pre = m.group(1).strip("\"'“”`")
        return rf"(?<![A-Za-z0-9]){re.escape(pre)}[A-Za-z0-9_-]+", [], f"anything starting with {pre}"
    m = re.match(r"(?:\w+\s+)?(?:that\s+)?(?:ends?|ending)\s+(?:with|in)\s+(\S+)$", r, re.I)
    if m:
        suf = m.group(1).strip("\"'“”`")
        return rf"[A-Za-z0-9_-]+{re.escape(suf)}(?![A-Za-z0-9])", [], f"anything ending with {suf}"

    if re.fullmatch(r"[\w.%+-]+@[\w-]+(?:\.[\w-]+)+|https?://\S+|www\.\S+", r):   # an email or web address
        return None, [r], f'"{r}"'
    if re.search(r"[#@?*]", r) and " " not in r.strip():
        rx, said = _shape(r)
        return rx, [], said
    if re.search(r"[#]", r):
        rx, said = _shape(r)
        return rx, [], said
    if any_word and re.search(r"\d", r) and " " not in r:      # "any AB-1234" = that shape
        rx, said = _shape(r, example=True)
        return rx, [], f"anything shaped like {r}: {said}"
    words = _split_list(r)
    if not words:
        raise RuleNotUnderstood("I couldn't find what to redact")
    return None, words, "the exact words " + ", ".join(f'"{w}"' for w in words) + " (any case)"


def parse(sentence: str) -> Parsed:
    s = sentence.strip().rstrip(".!")
    if not s:
        raise RuleNotUnderstood("the rule is empty")
    action = "redact"
    m = re.match(rf"(?i)(?:{ALLOW})(?:\s+|$)", s)
    if m:
        action, s = "allow", s[m.end():]
    else:
        m = re.match(rf"(?i){REDACT}(?:\s+|$)", s)
        if m:
            s = s[m.end():]
    label = None
    m = re.search(r"(?i)\s+(?:as|label(?:l)?ed(?:\s+as)?|called|named|with the label)\s+(?:an?\s+|the\s+)?([^\"]+?)\s*$", s)
    if m and action == "redact":
        label, s = m.group(1), s[:m.start()]
    context: List[str] = []
    m = re.search(r"(?i)\s+(?:that\s+comes?\s+|when\s+(?:it\s+)?(?:comes?\s+)?|if\s+(?:it\s+)?(?:comes?\s+)?)?(?:right\s+|just\s+)?"
                  r"(?:after|following|next\s+to|near|preceded\s+by|behind)\s+(?:the\s+)?(?:words?\s+|phrases?\s+|labels?\s+)?(.+)$", s)
    if m:
        context = [c.lower() for c in _split_list(m.group(1))]
        s = s[:m.start()]
    rx, words, said = _what(s)
    typ = _type_name(label) if label else "CUSTOM"
    if action == "allow":
        explain = f"Never redact {said}"
    else:
        explain = f"Redact {said}" + (f" when it comes right after {' or '.join(repr(c) for c in context)}" if context else "") \
                  + f", labeled [{typ}]"
    return Parsed(action, typ, rx or "", words, context, explain)
