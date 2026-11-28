# scrubpii

Find and redact personal data in text with one line of Python.

```bash
pip install scrubpii
```

```python
from scrubpii import redact

redact("Hi, I'm Sarah Johnson. Email sarah.j@example.com or call 6626341142.")
# "Hi, I'm [PERSON]. Email [EMAIL] or call [PHONE]."
```

It finds **names, addresses, emails, phone numbers, Social Security numbers,
card numbers, IBANs, passports, driver's licenses, ID numbers, dates of birth,
usernames, passwords, IP addresses and API keys**, in English and Spanish. A
fine-tuned DistilBERT model
([ChadTollison/pii-distilbert-v3](https://huggingface.co/ChadTollison/pii-distilbert-v3))
does the finding, and rules double-check it: card numbers must pass Luhn,
IBANs their bank checksum, SSNs the SSA format. The rules also catch what the
model misses: Luhn-valid card numbers, SSNs, emails, IP addresses, US phone
numbers with a real area code, valid IBANs, well-known API key formats and
dates right after "born" or "DOB".

## How it compares

F1 on held-out public data (full results in
[benchmarks/compare.md](https://github.com/chadtollison/chadtollison.github.io/blob/main/benchmarks/compare.md)):

| Dataset | scrubpii | Microsoft Presidio | spaCy |
|---|---:|---:|---:|
| ai4privacy, English | **0.99** | 0.81 | 0.68 |
| ai4privacy, Spanish | **0.99** | 0.63 | 0.46 |
| Gretel PII, English | **0.99** | 0.85 | 0.36 |
| Gretel finance (never trained on) | **0.80** | 0.52 | 0.58 |
| Medical records (never trained on) | **0.91** | 0.82 | 0.47 |
| Support tickets, emails, transcripts (never trained on) | **0.87** | 0.78 | 0.57 |
| Logs and config files (never trained on) | **0.88** | 0.72 | 0.31 |

The last three come from NVIDIA's Nemotron-PII (CC BY 4.0). Presidio flags
more text, so on long, unfamiliar documents it touches 3 to 7 points more of
the real items, mostly first names on their own. But a quarter or more of what
it flags there isn't personal data, while 97 to 99% of scrubpii's finds are.

Install and speed ([benchmarks/speed.md](https://github.com/chadtollison/chadtollison.github.io/blob/main/benchmarks/speed.md)):

| | scrubpii 0.4 | Microsoft Presidio |
|---|---:|---:|
| Install size, with model | **288 MB** | 815 MB |
| Start-up (new process, first answer) | **0.6 s** | 1.5 s |
| Short texts (ai4privacy) | **6 ms** | 8 ms |
| Long documents (finance) | 95 ms | **59 ms** |

It runs on ONNX Runtime, so there is no PyTorch to install. The 8-bit model
(about 66 MB) downloads on first use and is cached, so after that it starts in
under a second and works offline. Nothing is sent anywhere. If you already
use PyTorch, `pip install "scrubpii[torch]"` and set `SCRUBPII_BACKEND=torch`.

Try it in your browser first: [chadtollison.github.io/redact.html](https://chadtollison.github.io/redact.html)

## Ways to redact

```python
text = "Call Sarah Johnson at 662-634-1142."

redact(text)                # Call [PERSON] at [PHONE].
redact(text, mode="mask")   # Call █████████████ at ████████████.
redact(text, mode="fake")   # Call Avery Brooks at (202) 555-0117.
```

Fake values are harmless on purpose: phones use the 555-01xx range reserved
for fiction, cards are public test numbers, IPs come from the documentation
range, and SSNs start with 9, which is never issued.

### Reversible tokens

```python
from scrubpii import tokenize, restore

safe, key = tokenize(text)
# safe == "Call <PERSON_1> at <PHONE_1>."
# key  == {"<PERSON_1>": "Sarah Johnson", "<PHONE_1>": "662-634-1142"}

restore(safe, key)          # back to the original
```

Handy for sending text to another service (an LLM, a ticketing tool) and
putting the real values back in its reply.

### Just find

```python
from scrubpii import find

for e in find(text):
    print(e.type, e.text, e.score, e.confidence, e.source, e.reason)
# PERSON Sarah Johnson 0.97 high model "model 97% sure"
# EMAIL sarah.j@example.com 1.0 high model+rule "model found it, rule confirmed: email address format"
```

`min_score` (default 0.5) sets how sure the model must be. Items caught or
confirmed by a rule are always returned. Every item says how it was found
(`source`: model, rule, model+rule or custom) and why (`reason`).

## Your own rules

Say it in plain English. No regex, no retraining, no AI service: scrubpii
reads the sentence itself, offline.

```python
import scrubpii

scrubpii.teach("redact any ###-#####-##-RC as an RC code")
scrubpii.redact("Ref 123-45678-90-RC is late")
# "Ref [RC_CODE] is late"
```

In a shape, `#` is a digit, `@` a letter, `?` a letter or digit and `*` any
letters or digits. Everything else is matched as written, in any case. More
things it understands:

```python
scrubpii.teach(
    "hide codes like AB-1234 as order number",              # an example: digits vary, the rest stays
    'redact 8 digit numbers after "member" as member id',   # only right after these words
    "redact 6 to 8 digit numbers near account or acct as account",
    "redact anything starting with EMP- as employee id",
    "redact Globex, Initech and Umbrella as client",        # exact words or names
    "never redact support@acme.com",                        # keep these visible
    "never redact emails at acme.com",
)
scrubpii.understand("redact any ###-#####-##-RC as an RC code")
# 'Redact 3 digits, then "-", then 5 digits, then "-", then 2 digits, then "-RC", labeled [RC_CODE]'
```

On the command line: `scrubpii --rule "redact any ###-#####-##-RC as an RC code" --file notes.txt`.
The [online demo](https://chadtollison.github.io/redact.html) takes the same rules.

### Rules with regular expressions

If you know regular expressions, add patterns directly:

```python
import scrubpii

scrubpii.add_rule("EMPLOYEE_ID", r"\bEMP-\d{6}\b")
scrubpii.add_rule("MEMBER_ID", r"\b\d{8}\b", context=["member", "acct"])   # only after these words
scrubpii.add_words("CLIENT", ["Globex", "Initech"])                         # exact names, any case
scrubpii.allow("support@acme.com")                                          # never redact this

scrubpii.redact("EMP-004211 called Globex, member no. 12345678, cc support@acme.com")
# "[EMPLOYEE_ID] called [CLIENT], member no. [MEMBER_ID], cc support@acme.com"
```

Your rules win where they overlap the model, and work in every mode, in
`tokenize`, `Guard`, JSON/CSV and the command line. `add_rule` also takes
`group=` (redact one regex group) and `check=` (a function that must return
True). Keep rules in a JSON file and load them with `scrubpii.load_rules("rules.json")`
or `scrubpii --rules rules.json`:

```json
{"rules": [{"type": "EMPLOYEE_ID", "pattern": "\\bEMP-\\d{6}\\b"},
           {"type": "MEMBER_ID", "pattern": "\\b\\d{8}\\b", "context": ["member"]}],
 "words": {"CLIENT": ["Globex", "Initech"]},
 "allow": ["support@acme.com"],
 "say": ["redact any ###-#####-##-RC as an RC code"]}
```

## Audit report

For reviews and compliance logs, `audit()` redacts and explains every
decision: what was hidden, how sure it was, what found it and why, plus what
it looked at and left visible (too unsure, failed a checksum, on your allow
list). The report holds no personal data unless you ask for it: values show as
previews like `S***********n` and the input is identified by its SHA-256 hash.

```python
from scrubpii import audit, audit_markdown

report = audit(text)                 # a dict, ready to json.dump into a log
print(report["redacted"], report["counts"])
print(audit_markdown(report))        # a readable table
```

```bash
scrubpii --audit --file letter.txt                    # JSON
scrubpii --audit --audit-format md --file letter.txt  # Markdown
```

The HTTP API has `POST /audit` too.

## Many texts, JSON, CSV and pandas

Each of these batches the work, so it's much faster than a loop:

```python
from scrubpii import redact_many, redact_json, redact_csv, redact_dataframe

redact_many(["Call Sarah at 6626341142", "Email raj@example.com"])

redact_json({"user": {"name": "Sarah Johnson", "email": "sarah.j@example.com", "age": 41}})
# {"user": {"name": "[PERSON]", "email": "[EMAIL]", "age": 41}}

redact_csv(open("customers.csv").read(), columns=["name", "email", "notes"])

safe_df = redact_dataframe(df, mode="fake")        # pip install "scrubpii[pandas]"
```

## Keep personal data out of LLM prompts

```python
from scrubpii import Guard

guard = Guard()
safe = guard.scrub("Write to Sarah Johnson (sarah.j@example.com) about her refund")
# "Write to <PERSON_1> (<EMAIL_1>) about her refund"   <- this is all the LLM sees
reply = call_your_llm(safe)                            # "Dear <PERSON_1>, ..."
guard.restore(reply)                                   # "Dear Sarah Johnson, ..."

ask = guard.wrap(call_your_llm)                        # or wrap the call once
```

The guard keeps one key for the whole conversation, so the same person stays
`<PERSON_1>` in every turn. With LangChain:
`scrub, restore = guard.langchain()` then `chain = scrub | prompt | llm | parser | restore`.

## HTTP API

```bash
pip install "scrubpii[server]"
scrubpii serve --port 8000
curl -X POST localhost:8000/redact -H 'content-type: application/json' \
     -d '{"text": "Call Sarah at 6626341142", "mode": "token"}'
```

Endpoints: `POST /redact`, `POST /find`, `POST /restore`, `GET /health`, with
interactive docs at `/docs`. It runs on your machine, so nothing is sent anywhere.

## Command line

```bash
scrubpii "Call Sarah at 662-634-1142"
cat notes.txt | scrubpii --mode mask > notes-redacted.txt
scrubpii --find "My SSN is 123-45-6789"
scrubpii --audit --audit-format md "Call Sarah at 662-634-1142"
scrubpii --rules my_rules.json --file notes.txt
scrubpii --file customers.csv --columns name,email -o customers-safe.csv   # also .json, .jsonl, .txt
```

## Offline use

After the first run the model is cached, and nothing is ever sent anywhere.
To be sure no network call is attempted, set `HF_HUB_OFFLINE=1`.

## Limits

This is a research model. It can miss things or flag things by mistake, so
please don't rely on it alone for compliance work.

MIT licensed. Made by Michael Chad Tollison.
