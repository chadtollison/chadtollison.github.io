"""Retrain the PII model: phones in every format, Spanish text, and four new types.

Starts from the current model (ChadTollison/pii-distilbert-v2), keeps training it
on generated sentences, then scores the old and new model on the same held-out
sentences so you can see whether it actually got better.

What the generated data teaches:
  * Phones written every way: 6626341141, 662-634-1141, (662) 634-1141,
    662.634.1141, +1 662 634 1141, 1-662-634-1141 ... with real area codes.
  * Look-alikes that are NOT personal data: order, tracking, invoice and
    confirmation numbers, zip codes, dates, prices, street addresses and towns.
  * Plenty of names, emails, SSNs, card numbers and IPs too, so the model
    keeps what it already knows.
  * Four new types: PASSPORT, DRIVER_LICENSE, API_KEY and IBAN. The model's
    output layer is grown for them; the old types keep their learned weights.
  * Spanish sentences (Spain and Latin America) for every type.
  * Your own examples from training/examples.txt (see that file).

Usage:
  python training/retrain_pii.py --out build/new_model
  python training/retrain_pii.py --base path/to/model --max-steps 20   # quick test
"""
import argparse
import json
import random
import re
from pathlib import Path

import numpy as np
import torch
from transformers import (AutoModelForTokenClassification, AutoTokenizer,
                          Trainer, TrainingArguments, pipeline)

HERE = Path(__file__).parent
AREA_CODES = (HERE / "area_codes.txt").read_text().split()
OLD_LABELS = ["PERSON", "EMAIL", "PHONE", "SSN", "CREDIT_CARD", "IP_ADDRESS"]
NEW_LABELS = ["PASSPORT", "DRIVER_LICENSE", "API_KEY", "IBAN"]
LABELS = OLD_LABELS + NEW_LABELS

# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------
FIRST = """James Mary Robert Patricia John Jennifer Michael Linda David Elizabeth William Barbara
Richard Susan Joseph Jessica Thomas Sarah Charles Karen Chris Lisa Daniel Nancy Matthew Betty
Anthony Sandra Mark Ashley Steven Kimberly Andrew Emily Joshua Donna Kevin Michelle Brian Carol
Chad Amanda Jose Melissa Luis Maria Carlos Sofia Juan Camila Wei Mei Hiroshi Yuki Raj Priya
Arjun Ananya Mohammed Fatima Ahmed Aisha Olu Ngozi Kwame Amara Ivan Olga Pierre Chloe Liam
Noah Emma Olivia Ava Mia Ethan Lucas Harper Evelyn Jamal Keisha DeShawn Tamika Bao Linh""".split()
LAST = """Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez
Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris
Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill
Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Tollison Patel Shah
Kumar Singh Chen Wang Zhang Tanaka Sato Kim Park Okafor Mensah Ivanova Dubois O'Brien McAllister
Zhao Haddad Nakamura Fischer Rossi Novak Kowalski""".split()
DOMAINS = "gmail.com yahoo.com outlook.com hotmail.com icloud.com aol.com proton.me company.com work.org mail.com example.net school.edu".split()
STREETS = "Main Oak Maple Pine Cedar Elm Washington Lake Hill Park Church Jackson Highland Sunset Magnolia".split()
SUFFIXES = "Street St Avenue Ave Road Rd Drive Dr Lane Ln Boulevard Blvd Court Ct".split()
TOWNS = """Eupora Tupelo Jackson Memphis Starkville Oxford Springfield Franklin Greenville Madison
Clinton Fairview Austin Denver Boston Seattle Atlanta Phoenix Portland Nashville Chicago Dallas
Houston Miami Tampa Columbus Raleigh Charlotte Louisville Birmingham""".split()
STATES = "MS TN AL TX CA NY FL GA OH IL WA CO NC VA".split()

ES_FIRST = """José María Lucía Álvaro Begoña Íñigo Carmen Javier Sofía Mateo Valentina Diego Ximena
Alejandro Camila Andrés Daniela Sebastián Martina Pablo Paula Hugo Elena Manuel Inés Raúl Ángela
Jesús Guadalupe Fernando Rocío Rodrigo Nerea Joaquín Pilar Emilio Marta Gonzalo Lorena Óscar""".split()
ES_LAST = """García Fernández González Rodríguez López Martínez Sánchez Pérez Gómez Martín Jiménez
Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Navarro Torres Domínguez Vázquez Ramos Gil
Ramírez Serrano Blanco Suárez Molina Castro Ortega Delgado Ortiz Morales Peña Iglesias""".split()
ES_TOWNS = """Madrid Barcelona Sevilla Valencia Bilbao Málaga Zaragoza Granada Córdoba Salamanca
Guadalajara Monterrey Puebla Bogotá Medellín Lima Quito Santiago Montevideo Asunción""".split()
ES_STREETS = "Calle Mayor|Avenida de la Constitución|Calle del Sol|Paseo de Gracia|Calle Real|Avenida Reforma|Calle Alcalá".split("|")
ES_DOMAINS = "gmail.com hotmail.es yahoo.es outlook.es telefonica.net correo.mx empresa.com".split()

R = random.Random(13)


def person():
    f, l = R.choice(FIRST), R.choice(LAST)
    return R.choice([f"{f} {l}", f"{f} {l}", f, f"{f[0]}. {l}", f"{f} {R.choice('ABCDEFGHJKLMRST')}. {l}",
                     f"{f.lower()} {l.lower()}"])


def person_es():
    f, l1, l2 = R.choice(ES_FIRST), R.choice(ES_LAST), R.choice(ES_LAST)
    return R.choice([f"{f} {l1}", f"{f} {l1} {l2}", f"{f} {l1} {l2}", f, f"{f} {R.choice(ES_FIRST)} {l1}"])


def email_es():
    f, l = R.choice(ES_FIRST).lower(), R.choice(ES_LAST).lower()
    for a, b in zip("áéíóúñ", "aeioun"):
        f, l = f.replace(a, b), l.replace(a, b)
    return f"{R.choice([f'{f}.{l}', f'{f}{l}', f'{f[0]}{l}', f'{f}{R.randint(1, 99)}'])}@{R.choice(ES_DOMAINS)}"


def phone_es():
    d = lambda n: "".join(str(R.randint(0, 9)) for _ in range(n))
    m = f"{R.choice('6789')}{d(8)}"                       # Spain: 9 digits
    mx = f"{R.choice(['55', '33', '81'])}{d(8)}"         # Mexico: 10 digits
    return R.choice([f"{m[:3]} {m[3:5]} {m[5:7]} {m[7:]}", f"{m[:3]} {m[3:6]} {m[6:]}", m, f"+34 {m[:3]} {m[3:6]} {m[6:]}",
                     f"+34{m}", f"+52 {mx[:2]} {mx[2:6]} {mx[6:]}", f"{mx[:2]} {mx[2:6]} {mx[6:]}", f"+57 3{d(2)} {d(3)} {d(4)}"])


def email():
    f, l = R.choice(FIRST).lower(), R.choice(LAST).lower().replace("'", "")
    user = R.choice([f"{f}.{l}", f"{f}{l}", f"{f[0]}{l}", f"{f}_{l}", f"{f}{R.randint(1, 99)}", f"{l}.{f}"])
    return f"{user}@{R.choice(DOMAINS)}"


def phone():
    a, e, n = R.choice(AREA_CODES), f"{R.randint(2, 9)}{R.randint(0, 99):02d}", f"{R.randint(0, 9999):04d}"
    return R.choice([
        f"{a}{e}{n}", f"{a}{e}{n}", f"{a}{e}{n}",            # the format the old model missed
        f"{a}-{e}-{n}", f"({a}) {e}-{n}", f"({a}){e}-{n}", f"{a}.{e}.{n}", f"{a} {e} {n}",
        f"+1 {a} {e} {n}", f"+1-{a}-{e}-{n}", f"1-{a}-{e}-{n}", f"+1 ({a}) {e}-{n}", f"+1{a}{e}{n}",
        f"1{a}{e}{n}", f"{a}/{e}-{n}",
    ])


def ssn():
    a = R.choice([x for x in range(1, 900) if x != 666])
    s = (f"{a:03d}", f"{R.randint(1, 99):02d}", f"{R.randint(1, 9999):04d}")
    return R.choice(["-".join(s), "-".join(s), " ".join(s), "".join(s)])


def card():
    prefix = R.choice(["4", "51", "52", "53", "54", "55", "34", "37", "6011"])
    length = 15 if prefix in ("34", "37") else 16
    digits = [int(c) for c in prefix] + [R.randint(0, 9) for _ in range(length - len(prefix) - 1)]
    total = 0
    for i, d in enumerate(reversed(digits)):          # Luhn check digit
        d = d * 2 if i % 2 == 0 else d
        total += d - 9 if d > 9 else d
    digits.append((10 - total % 10) % 10)
    s = "".join(map(str, digits))
    groups = [s[:4], s[4:10], s[10:]] if length == 15 else [s[i:i + 4] for i in range(0, 16, 4)]
    return R.choice([" ".join(groups), "-".join(groups), s])


def ip():
    return ".".join(str(R.randint(1, 254)) for _ in range(4))


ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
def rs(n, chars=ALNUM): return "".join(R.choice(chars) for _ in range(n))
def digits(n): return rs(n, "0123456789")


def passport():
    return R.choice([digits(9), f"{R.choice(UPPER)}{digits(8)}", f"{rs(3, UPPER)}{digits(6)}", f"{rs(2, UPPER)}{digits(7)}"])


def dni():
    n = R.randint(10000000, 99999999)
    return f"{n}{'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]}"         # Spanish DNI with its check letter


def driver_license():
    return R.choice([f"{R.choice(UPPER)}{digits(7)}", digits(8), digits(9), f"{digits(3)} {digits(3)} {digits(3)}",
                     f"{R.choice(UPPER)}{digits(3)}-{digits(3)}-{digits(2)}-{digits(3)}-{digits(1)}",
                     f"{R.choice(UPPER)}{digits(12)}", f"{rs(2, UPPER)}{digits(6)}", dni()])


def api_key():
    hexs = "0123456789abcdef"
    return R.choice([f"sk_{R.choice(['live', 'test'])}_{rs(24)}", f"pk_{R.choice(['live', 'test'])}_{rs(24)}",
                     f"sk-{rs(48)}", f"sk-proj-{rs(40)}", f"AKIA{rs(16, UPPER + '234567')}", f"ghp_{rs(36)}",
                     f"xoxb-{digits(11)}-{digits(12)}-{rs(24)}", f"AIza{rs(35, ALNUM + '-_')}", rs(32, hexs), rs(40, hexs)])


IBAN_FORMATS = {"ES": "n20", "DE": "n18", "GB": "a4n14", "FR": "n10c11n2", "IT": "a1n10c12", "NL": "a4n10", "PT": "n21", "BE": "n12"}


def iban():
    cc = R.choice(list(IBAN_FORMATS))
    bban = ""
    for kind, n in re.findall(r"([anc])(\d+)", IBAN_FORMATS[cc]):
        bban += rs(int(n), {"a": UPPER, "n": "0123456789", "c": UPPER + "0123456789"}[kind])
    num = int("".join(str(int(c, 36)) for c in bban + cc + "00"))
    s = f"{cc}{98 - num % 97:02d}{bban}"
    return R.choice([s, " ".join(s[i:i + 4] for i in range(0, len(s), 4))])


# Things that look like personal data but are not (labelled O).
def order_no(): return R.choice([f"#{R.randint(10000, 9999999)}", f"{R.randint(1000000000, 9999999999)}", f"A{R.randint(100000, 999999)}"])
def tracking(): return R.choice([f"1Z{R.randint(10**15, 10**16 - 1)}", f"{R.randint(10**11, 10**12 - 1)}", f"9400{R.randint(10**17, 10**18 - 1)}"])
def invoice(): return R.choice([f"INV-{R.randint(2019, 2027)}-{R.randint(1, 99999):05d}", f"{R.randint(1000000000, 9999999999)}"])
def zipcode(): return R.choice([f"{R.randint(1001, 99950):05d}", f"{R.randint(1001, 99950):05d}-{R.randint(0, 9999):04d}"])
def date(): return R.choice([f"{R.randint(1, 12):02d}/{R.randint(1, 28):02d}/{R.randint(1990, 2027)}", f"{R.randint(2019, 2027)}-{R.randint(1, 12):02d}-{R.randint(1, 28):02d}", f"{R.randint(1, 12)}/{R.randint(1, 28)}"])
def price(): return R.choice([f"${R.randint(1, 9999):,}.{R.randint(0, 99):02d}", f"${R.randint(1, 500)}", f"{R.randint(1, 9999)} dollars"])
def address(): return f"{R.randint(1, 9999)} {R.choice(STREETS)} {R.choice(SUFFIXES)}"
def town(): return R.choice([R.choice(TOWNS), f"{R.choice(TOWNS)}, {R.choice(STATES)}"])
def qty(): return str(R.choice([R.randint(2, 500), R.randint(1000, 99999)]))
def sha(): return rs(R.choice([7, 7, 40]), "0123456789abcdef")
def version(): return f"{R.randint(0, 12)}.{R.randint(0, 30)}.{R.randint(0, 99)}"
def date_es(): return R.choice([f"{R.randint(1, 28)} de {R.choice(['enero', 'marzo', 'mayo', 'julio', 'octubre', 'diciembre'])} de {R.randint(2019, 2027)}", f"{R.randint(1, 28):02d}/{R.randint(1, 12):02d}/{R.randint(2019, 2027)}"])
def price_es(): return R.choice([f"{R.randint(1, 9999)},{R.randint(0, 99):02d} €", f"{R.randint(1, 500)} euros", f"${R.randint(100, 99999):,} MXN"])
def address_es(): return f"{R.choice(ES_STREETS)} {R.randint(1, 200)}"
def town_es(): return R.choice(ES_TOWNS)
def zip_es(): return f"{R.randint(1000, 52999):05d}"


FILL = {"PERSON": person, "EMAIL": email, "PHONE": phone, "SSN": ssn, "CREDIT_CARD": card, "IP_ADDRESS": ip,
        "ORDER": order_no, "TRACK": tracking, "INVOICE": invoice, "ZIP": zipcode, "DATE": date, "PRICE": price,
        "ADDRESS": address, "TOWN": town, "QTY": qty, "PASSPORT": passport, "DRIVER_LICENSE": driver_license,
        "API_KEY": api_key, "IBAN": iban, "SHA": sha, "VERSION": version}
FILL_ES = {**FILL, "PERSON": person_es, "EMAIL": email_es, "PHONE": phone_es, "DATE": date_es, "PRICE": price_es,
           "ADDRESS": address_es, "TOWN": town_es, "ZIP": zip_es}

TEMPLATES = """
{PHONE}
my number is {PHONE}
My phone is {PHONE}
Call me at {PHONE}.
call {PHONE} now
Text me at {PHONE} or {PHONE}
You can reach me at {PHONE} anytime.
{PERSON}'s cell is {PHONE}.
{PERSON} {PHONE}
{PERSON} is from {TOWN}. His phone is {PHONE}
{PERSON} is from {TOWN}. Her number is {PHONE}.
Please call {PERSON} back at {PHONE} before {DATE}.
Contact: {PERSON}, {PHONE}, {EMAIL}
Phone: {PHONE} | Email: {EMAIL}
phone: {PHONE}
cell {PHONE}.
Emergency contact {PERSON} ({PHONE})
New lead from {TOWN}: {PERSON}, tel {PHONE}
Hi, I'm {PERSON}. Email me at {EMAIL} or call {PHONE}.
Hi team, my name is {PERSON} and I can't log in. Reach me at {EMAIL} or {PHONE}.
{PERSON} works in {TOWN} and can be reached on {PHONE}.
Fax {PHONE}, office {PHONE}
Left a voicemail for {PERSON} at {PHONE} about invoice {INVOICE}.
Your order {ORDER} ships to {ADDRESS}, {TOWN} {ZIP}. We'll text {PHONE} when it leaves.
Order {ORDER} confirmed for {PERSON}. Total {PRICE}.
Your order number is {ORDER}.
Tracking number: {TRACK}
Track package {TRACK} at our website.
Invoice {INVOICE} for {PRICE} is due {DATE}.
Reference number {INVOICE}, amount {PRICE}.
Confirmation code {ORDER} for your stay on {DATE}.
Ship to {ADDRESS}, {TOWN} {ZIP}
{PERSON} lives at {ADDRESS} in {TOWN}.
The office moved to {ADDRESS}, {TOWN}.
We had {QTY} visitors from {TOWN} on {DATE}.
Zip code {ZIP}
Meeting moved to {DATE} at 3pm with {PERSON}.
My SSN is {SSN}.
SSN: {SSN}, DOB {DATE}
New hire {PERSON}, social security number {SSN}, email {EMAIL}.
Charge card {CREDIT_CARD} for {PRICE}.
Card number {CREDIT_CARD} exp {DATE}
{PERSON} paid with {CREDIT_CARD}.
Refund {PRICE} to card {CREDIT_CARD} for order {ORDER}.
Login from {IP_ADDRESS} by {PERSON} on {DATE}.
Server {IP_ADDRESS} logged a failed login from {IP_ADDRESS}.
Blocked IP {IP_ADDRESS} after {QTY} attempts.
Send the report to {EMAIL} and cc {EMAIL}.
{PERSON} ({EMAIL}) asked about order {ORDER}.
Thanks {PERSON}! Your account number {INVOICE} is now active.
Passport number: {PASSPORT}
{PERSON}, passport {PASSPORT}, expires {DATE}.
Please upload a copy of your passport ({PASSPORT}) before {DATE}.
Traveler {PERSON} checked in with passport no. {PASSPORT}.
Driver's license: {DRIVER_LICENSE}
DL# {DRIVER_LICENSE}, issued in {TOWN}.
{PERSON} showed driver's license {DRIVER_LICENSE} at the counter.
License number {DRIVER_LICENSE} expires {DATE}.
export API_KEY={API_KEY}
Our API key is {API_KEY}, please don't share it.
OPENAI_API_KEY="{API_KEY}"
Authorization: Bearer {API_KEY}
{PERSON} pasted the key {API_KEY} in the chat by mistake.
aws_access_key_id = {API_KEY}
Deployed version {VERSION} from commit {SHA}.
Build {SHA} passed on {DATE}.
Wire the money to IBAN {IBAN}.
IBAN: {IBAN} (account holder {PERSON})
Please refund {PRICE} to {IBAN}.
{PERSON} updated the payout account to {IBAN} on {DATE}.
""".strip().splitlines()

TEMPLATES_ES = """
Hola, soy {PERSON}. Mi correo es {EMAIL} y mi teléfono es {PHONE}.
Llámame al {PHONE}.
Mi número es {PHONE}
Puedes escribirme a {EMAIL} o llamar al {PHONE}.
{PERSON} vive en {ADDRESS}, {TOWN}.
El pedido {ORDER} de {PERSON} llegará el {DATE}.
Su número de pedido es {ORDER}.
Factura {INVOICE} por {PRICE}, vence el {DATE}.
Envío a {ADDRESS}, {ZIP} {TOWN}.
Teléfono: {PHONE} | Correo: {EMAIL}
Contacto: {PERSON}, {PHONE}
Nuevo empleado {PERSON}, correo {EMAIL}, permiso de conducir {DRIVER_LICENSE}.
Pasaporte número {PASSPORT}
{PERSON} presentó el pasaporte {PASSPORT} en el mostrador.
Por favor, envíe una copia de su pasaporte ({PASSPORT}) antes del {DATE}.
Permiso de conducir: {DRIVER_LICENSE}
Licencia de conducir {DRIVER_LICENSE}, expedida en {TOWN}.
Transfiere el dinero al IBAN {IBAN}.
IBAN: {IBAN}, titular {PERSON}.
Devuelva {PRICE} a la cuenta {IBAN}.
Pagó con la tarjeta {CREDIT_CARD}.
Número de tarjeta {CREDIT_CARD}, caduca el {DATE}.
Acceso desde la IP {IP_ADDRESS} el {DATE}.
Bloqueamos la IP {IP_ADDRESS} tras {QTY} intentos.
La clave de API es {API_KEY}, no la compartas.
{PERSON} pegó la clave {API_KEY} en el chat por error.
Reunión con {PERSON} el {DATE} en {TOWN}.
Tuvimos {QTY} visitas desde {TOWN} el {DATE}.
Gracias {PERSON}, su cuenta {INVOICE} ya está activa.
Escríbele a {PERSON} a {EMAIL} y copia a {EMAIL}.
""".strip().splitlines()


# Every 5th sentence shape is kept out of training, so the score shows how the
# model does on sentence shapes it has never seen, not just new values.
TEST_TEMPLATES = [(t, FILL) for t in TEMPLATES[2::5]] + [(t, FILL_ES) for t in TEMPLATES_ES[2::5]]
TRAIN_TEMPLATES = ([(t, FILL) for t in TEMPLATES if (t, FILL) not in TEST_TEMPLATES]
                   + [(t, FILL_ES) for t in TEMPLATES_ES if (t, FILL_ES) not in TEST_TEMPLATES])


def make_example(templates):
    """Return (text, [(start, end, label), ...])."""
    tpl, fill = R.choice(templates)
    text, spans, pos = "", [], 0
    for m in re.finditer(r"\{(\w+)\}", tpl):
        text += tpl[pos:m.start()]
        value = fill[m.group(1)]()
        if m.group(1) in LABELS:
            spans.append((len(text), len(text) + len(value), m.group(1)))
        text += value
        pos = m.end()
    text += tpl[pos:]
    if R.random() < 0.15:
        text = text.lower()
    return text, spans


def load_examples(path=HERE / "examples.txt"):
    """Lines like "Call [PERSON: Chad] at [PHONE: 6626341141]" -> (text, spans)."""
    out = []
    if not path.exists():
        return out
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        text, spans, pos = "", [], 0
        for m in re.finditer(r"\[([A-Z_]+):\s*(.+?)\]", line):
            if m.group(1) not in LABELS:
                raise SystemExit(f"examples.txt line {n}: unknown type {m.group(1)} (use one of {', '.join(LABELS)})")
            text += line[pos:m.start()]
            spans.append((len(text), len(text) + len(m.group(2)), m.group(1)))
            text += m.group(2)
            pos = m.end()
        out.append((text + line[pos:], spans))
    return out


# --------------------------------------------------------------------------
# Tokenize and label every word piece (B- on the first piece, I- after)
# --------------------------------------------------------------------------
def encode(tok, label2id, text, spans, max_len=128):
    enc = tok(text, truncation=True, max_length=max_len, return_offsets_mapping=True)
    labels = []
    for a, b in enc.pop("offset_mapping"):
        if a == b:
            labels.append(-100)          # [CLS] / [SEP]
            continue
        lab = "O"
        for s, e, name in spans:
            if a >= s and b <= e:
                lab = ("B-" if a == s else "I-") + name
                break
        labels.append(label2id[lab])
    enc["labels"] = labels
    return enc


class ListDataset(torch.utils.data.Dataset):
    def __init__(self, items): self.items = items
    def __len__(self): return len(self.items)
    def __getitem__(self, i): return self.items[i]


def collate(batch, pad_id):
    n = max(len(x["input_ids"]) for x in batch)
    out = {k: [] for k in ("input_ids", "attention_mask", "labels")}
    for x in batch:
        pad = n - len(x["input_ids"])
        out["input_ids"].append(x["input_ids"] + [pad_id] * pad)
        out["attention_mask"].append(x["attention_mask"] + [0] * pad)
        out["labels"].append(x["labels"] + [-100] * pad)
    return {k: torch.tensor(v) for k, v in out.items()}


# --------------------------------------------------------------------------
# Scoring: exact match of whole items, per type
# --------------------------------------------------------------------------
def score(model, tok, examples):
    nlp = pipeline("token-classification", model=model, tokenizer=tok, aggregation_strategy="max", device=-1)
    stats = {lab: [0, 0, 0] for lab in LABELS}    # true positives, predicted, gold
    for text, gold in examples:
        pred = {(p["start"], p["end"], p["entity_group"]) for p in nlp(text) if p["score"] >= 0.5}
        gold = set(gold)
        for lab in LABELS:
            g = {x for x in gold if x[2] == lab}
            p = {x for x in pred if x[2] == lab}
            stats[lab][0] += len(g & p); stats[lab][1] += len(p); stats[lab][2] += len(g)
    rows, tp, pp, gg = {}, 0, 0, 0
    for lab, (t, p, g) in stats.items():
        prec = t / p if p else 1.0
        rec = t / g if g else 1.0
        rows[lab] = {"precision": prec, "recall": rec, "f1": 2 * prec * rec / (prec + rec) if prec + rec else 0.0, "count": g}
        tp, pp, gg = tp + t, pp + p, gg + g
    prec, rec = tp / pp if pp else 1.0, tp / gg if gg else 1.0
    rows["ALL"] = {"precision": prec, "recall": rec, "f1": 2 * prec * rec / (prec + rec) if prec + rec else 0.0, "count": gg}
    return rows


CHECKS = [
    "6626341141",
    "Chad Tollison is from Eupora. His phone is 6626341142",
    "Text me at 6626341141 or 662.634.1142",
    "Your order number is 4567891234.",
    "Hi, I'm Sarah Johnson. Email sarah.j@example.com or call 415-555-0198.",
    "My SSN is 123-45-6789 and my card is 4111 1111 1111 1111.",
    "Ship it to 42 Maple Street, Springfield, IL 62704 for Dr. Raj Patel.",
    "Server 192.168.1.24 logged a failed login from 10.0.0.7.",
    "Hola, soy María García López. Escríbeme a maria.garcia@correo.es o llama al 612 345 678.",
    "Pasaporte PAA123456, permiso de conducir 12345678Z.",
    "Traveler Raj Patel, passport 546283917, driver's license D1234567.",
    "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
    "Wire it to IBAN GB82 WEST 1234 5698 7654 32 or ES91 2100 0418 4502 0005 1332.",
    "Deployed version 2.4.1 from commit 3f2a9c1.",
]


def show(model, tok):
    nlp = pipeline("token-classification", model=model, tokenizer=tok, aggregation_strategy="max", device=-1)
    lines = []
    for t in CHECKS:
        found = ", ".join(f"{p['entity_group']}: {t[p['start']:p['end']]}" for p in nlp(t) if p["score"] >= 0.5) or "(nothing)"
        lines.append(f"- `{t}` → {found}")
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="ChadTollison/pii-distilbert-v2")
    ap.add_argument("--out", default="build/new_model")
    ap.add_argument("--train-size", type=int, default=16000)
    ap.add_argument("--test-size", type=int, default=1200)
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--max-steps", type=int, default=-1)
    args = ap.parse_args()

    random.seed(13); np.random.seed(13); torch.manual_seed(13)
    # DistilBERT takes no token_type_ids; saying so here also fixes the saved
    # tokenizer, so `pipeline(...)` works out of the box for anyone using it.
    tok = AutoTokenizer.from_pretrained(args.base, model_input_names=["input_ids", "attention_mask"])
    old = AutoModelForTokenClassification.from_pretrained(args.base)
    old_ids = {k: int(v) for k, v in old.config.label2id.items()}
    # Keep the old label ids and add B-/I- for any new type at the end.
    names = [old.config.id2label[i] for i in range(len(old_ids))]
    names += [f"{p}-{t}" for t in LABELS for p in "BI" if f"{p}-{t}" not in old_ids]
    label2id = {n: i for i, n in enumerate(names)}

    train = [make_example(TRAIN_TEMPLATES) for _ in range(args.train_size)]
    mine = load_examples()
    train += mine * 10          # your examples count ten times, so they stick
    R.shuffle(train)
    print(f"{len(mine)} examples from training/examples.txt")
    test = [make_example(TEST_TEMPLATES) for _ in range(args.test_size)]

    print("Scoring the current model ...")
    before = score(old, tok, test)
    before_mine = score(old, tok, mine) if mine else None
    before_checks = show(old, tok)

    model = AutoModelForTokenClassification.from_pretrained(
        args.base, num_labels=len(names), id2label=dict(enumerate(names)), label2id=label2id,
        ignore_mismatched_sizes=True)
    with torch.no_grad():   # the old types keep exactly what they learned
        n = len(old_ids)
        model.classifier.weight[:n] = old.classifier.weight
        model.classifier.bias[:n] = old.classifier.bias
        if len(names) > n:  # new types start out unlikely, so nothing changes until they are learned
            model.classifier.weight[n:] = torch.randn_like(model.classifier.weight[n:]) * 0.02
            model.classifier.bias[n:] = old.classifier.bias.min() - 2
    print(f"Labels: {len(old_ids)} -> {len(names)}")
    data = ListDataset([encode(tok, label2id, t, s) for t, s in train])
    trainer = Trainer(
        model=model,
        args=TrainingArguments(output_dir="build/checkpoints", per_device_train_batch_size=16,
                               learning_rate=3e-5, num_train_epochs=args.epochs, max_steps=args.max_steps,
                               warmup_ratio=0.1, weight_decay=0.01, logging_steps=50, save_strategy="no",
                               report_to=[], seed=13),
        train_dataset=data,
        data_collator=lambda b: collate(b, tok.pad_token_id),
    )
    trainer.train()

    print("Scoring the retrained model ...")
    after = score(model, tok, test)
    after_mine = score(model, tok, mine) if mine else None
    after_checks = show(model, tok)

    model.save_pretrained(args.out)
    tok.save_pretrained(args.out)

    report = ["## Old model vs retrained model", "",
              f"Scored on {args.test_size} sentences built from {len(TEST_TEMPLATES)} sentence shapes that were never used in training.", "",
              "| Type | Old F1 | New F1 | Old recall | New recall |", "|---|---|---|---|---|"]
    for lab in LABELS + ["ALL"]:
        b, a = before[lab], after[lab]
        report.append(f"| {lab} | {b['f1']:.3f} | {a['f1']:.3f} | {b['recall']:.3f} | {a['recall']:.3f} |")
    if mine:
        report += ["", f"Your {len(mine)} examples from training/examples.txt (the new model trained on these): "
                   f"F1 {before_mine['ALL']['f1']:.3f} → {after_mine['ALL']['f1']:.3f}"]
    report += ["", "### Spot checks, old model", *before_checks, "", "### Spot checks, retrained model", *after_checks]
    text = "\n".join(report)
    print(text)
    Path(args.out, "report.md").write_text(text)
    # Better = no type got worse, something improved (a type, or your own
    # examples), any new type is actually usable (F1 of at least 0.85 on
    # sentences it never saw), and your examples didn't get worse.
    better = (all(after[l]["f1"] >= before[l]["f1"] - 0.005 for l in LABELS)
              and (any(after[l]["f1"] > before[l]["f1"] + 0.005 for l in LABELS)
                   or (mine and after_mine["ALL"]["f1"] > before_mine["ALL"]["f1"] + 0.005))
              and all(after[l]["f1"] >= 0.85 for l in LABELS if f"B-{l}" not in old_ids)
              and (not mine or after_mine["ALL"]["f1"] >= before_mine["ALL"]["f1"]))
    Path(args.out, "verdict.json").write_text(json.dumps({"better": better, "before": before, "after": after}, indent=2))
    print("VERDICT:", "better" if better else "NOT better, keep the old model")


if __name__ == "__main__":
    main()
