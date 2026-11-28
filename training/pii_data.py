"""Public PII datasets, mapped onto scrubpii's types.

Every loader returns a list of (text, spans), where each span is
(start, end, TYPE) for a type scrubpii models, or (start, end, None) for
personal data it doesn't label (dates, ages, company names ...). Training
ignores the None spans instead of teaching them as "not personal data", and
the benchmark still counts finds there as landing on personal data.

Sources (both allow training and redistribution with credit):
  * ai4privacy/open-pii-masking-500k-ai4privacy  (CC BY 4.0)
  * gretelai/gretel-pii-masking-en-v1            (Apache 2.0)
  * gretelai/synthetic_pii_finance_multilingual  (Apache 2.0)  test only, never trained on
  * nvidia/Nemotron-PII                          (CC BY 4.0)   v5 trains on its train split; tests use its test split
"""
import ast
import json
import random
import re

TYPES = ["PERSON", "EMAIL", "PHONE", "SSN", "CREDIT_CARD", "IP_ADDRESS", "PASSPORT", "DRIVER_LICENSE",
         "API_KEY", "IBAN", "ADDRESS", "ID_NUMBER", "DATE_OF_BIRTH", "USERNAME", "PASSWORD"]

# Dataset label (lower case, no separators) -> scrubpii type. Missing -> None (ignored).
LABEL_MAP = {
    # people
    "givenname": "PERSON", "surname": "PERSON", "name": "PERSON", "firstname": "PERSON", "lastname": "PERSON",
    "middlename": "PERSON", "fullname": "PERSON",
    # contact
    "email": "EMAIL", "emailaddress": "EMAIL",
    "telephonenum": "PHONE", "phonenumber": "PHONE", "phone": "PHONE", "faxnumber": "PHONE",
    "streetaddress": "ADDRESS", "address": "ADDRESS", "street": "ADDRESS", "buildingnum": "ADDRESS",
    "zipcode": "ADDRESS", "postcode": "ADDRESS", "city": "ADDRESS", "secondaryaddress": "ADDRESS",
    # government ids
    "socialnum": "SSN", "ssn": "SSN", "socialsecuritynumber": "SSN",
    "passportnum": "PASSPORT", "passportnumber": "PASSPORT", "passport": "PASSPORT",
    "driverlicensenum": "DRIVER_LICENSE", "driverlicensenumber": "DRIVER_LICENSE", "driverlicense": "DRIVER_LICENSE",
    "idcardnum": "ID_NUMBER", "taxnum": "ID_NUMBER", "nationalid": "ID_NUMBER", "taxid": "ID_NUMBER",
    "taxidentificationnumber": "ID_NUMBER", "nationalidentificationnumber": "ID_NUMBER", "medicalrecordnumber": "ID_NUMBER",
    "healthplanbeneficiarynumber": "ID_NUMBER",
    # money
    "creditcardnumber": "CREDIT_CARD", "creditcard": "CREDIT_CARD", "creditdebitcard": "CREDIT_CARD",
    "iban": "IBAN", "bban": "IBAN",
    # tech
    "ipv4": "IP_ADDRESS", "ipv6": "IP_ADDRESS", "ip": "IP_ADDRESS", "ipaddress": "IP_ADDRESS",
    "apikey": "API_KEY", "username": "USERNAME", "password": "PASSWORD", "accountpin": "PASSWORD", "pin": "PASSWORD",
    "dateofbirth": "DATE_OF_BIRTH", "dob": "DATE_OF_BIRTH", "birthdate": "DATE_OF_BIRTH",
}


def map_label(label):
    return LABEL_MAP.get(re.sub(r"[^a-z0-9]", "", str(label).lower()))


def _parse(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return ast.literal_eval(v)
    return v


def merge(spans, text):
    """Join same-type neighbours: "Sarah" + "Johnson", "12 Main St" + ", " + "Leeds"."""
    out = []
    for s, e, t in sorted(spans, key=lambda x: (x[0], -x[1])):
        if out and out[-1][1] > s:            # overlap: keep the first, grow it
            ps, pe, pt = out[-1]
            out[-1] = (ps, max(pe, e), pt if pt is not None else t)
            continue
        if out and t is not None and out[-1][2] == t:
            gap = text[out[-1][1]:s]
            if gap.strip() == "" or (t == "ADDRESS" and re.fullmatch(r"[\s,]*", gap)):
                out[-1] = (out[-1][0], e, t)
                continue
        out.append((s, e, t))
    return out


def openpii(split="train", langs=("en", "es"), n=None, seed=0):
    from datasets import load_dataset
    ds = load_dataset("ai4privacy/open-pii-masking-500k-ai4privacy", split=split)
    ds = ds.filter(lambda r: r["language"] in langs)
    idx = list(range(len(ds)))
    random.Random(seed).shuffle(idx)
    out = []
    for i in idx[:n] if n else idx:
        r = ds[i]
        spans = [(int(m["start"]), int(m["end"]), map_label(m["label"])) for m in _parse(r["privacy_mask"])]
        out.append((r["source_text"], merge(spans, r["source_text"])))
    return out


def gretel_en(split="train", n=None, seed=0):
    """gretel-pii-masking-en-v1 lists entity strings, not offsets, so find each one in the text."""
    from datasets import load_dataset
    ds = load_dataset("gretelai/gretel-pii-masking-en-v1", split=split)
    idx = list(range(len(ds)))
    random.Random(seed).shuffle(idx)
    out = []
    for i in idx[:n] if n else idx:
        r = ds[i]
        text, spans = r["text"], []
        for ent in _parse(r["entities"]):
            value, types = ent.get("entity", ""), ent.get("types") or [None]
            if not value:
                continue
            t = next((map_label(x) for x in types if map_label(x)), None)
            for m in re.finditer(re.escape(value), text):
                spans.append((m.start(), m.end(), t))
        out.append((text, merge(spans, text)))
    return out


def gretel_finance(split="test", language="English", n=None, seed=0):
    from datasets import load_dataset
    ds = load_dataset("gretelai/synthetic_pii_finance_multilingual", split=split)
    ds = ds.filter(lambda r: r["language"] == language)
    idx = list(range(len(ds)))
    random.Random(seed).shuffle(idx)
    out = []
    for i in idx[:n] if n else idx:
        r = ds[i]
        text = r["generated_text"]
        spans = [(int(m["start"]), int(m["end"]), map_label(m["label"])) for m in _parse(r["pii_spans"])]
        out.append((text, merge(spans, text)))
    return out


# Harder kinds of text from nvidia/Nemotron-PII, picked by document type.
NEMOTRON_KINDS = {
    "medical": r"medical|patient|health|prescription|discharge|lab report|clinic|hospital|immuniz|vaccin|dental|pharmacy",
    "conversation": r"ticket|transcript|e-?mail|interview|complaint|inquiry|chat|message|correspondence",
    "logs_config": r"\blog\b|logs|logging|configuration file|config|script|api|debug|server|dhcp",
}


def nemotron(kind, split="test", n=None, seed=0):
    from datasets import load_dataset
    ds = load_dataset("nvidia/Nemotron-PII", split=split)
    if kind:
        rx = re.compile(NEMOTRON_KINDS[kind], re.I)
        ds = ds.filter(lambda r: bool(rx.search(r["document_type"])))
    idx = list(range(len(ds)))
    random.Random(seed).shuffle(idx)
    out = []
    for i in idx[:n] if n else idx:
        r = ds[i]
        spans = [(int(m["start"]), int(m["end"]), map_label(m["label"])) for m in _parse(r["spans"])]
        out.append((r["text"], merge(spans, r["text"])))
    return out


def label_counts(rows):
    from collections import Counter
    return Counter(t for _, spans in rows for _, _, t in spans)
