# chad-pii

Find and redact personal data in text with one line of Python.

```bash
pip install chad-pii
```

```python
from chad_pii import redact

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

| Dataset | chad-pii | Microsoft Presidio | spaCy |
|---|---:|---:|---:|
| ai4privacy, English | 0.99 | 0.81 | 0.68 |
| ai4privacy, Spanish | 0.99 | 0.63 | 0.46 |
| Gretel PII, English | 0.99 | 0.85 | 0.36 |
| Gretel finance (never trained on) | 0.79 | 0.52 | 0.58 |

Presidio is about 4x faster per text.

The model (about 260 MB) downloads on first use and is cached, so after that
it works offline. Nothing is sent anywhere.

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
from chad_pii import tokenize, restore

safe, key = tokenize(text)
# safe == "Call <PERSON_1> at <PHONE_1>."
# key  == {"<PERSON_1>": "Sarah Johnson", "<PHONE_1>": "662-634-1142"}

restore(safe, key)          # back to the original
```

Handy for sending text to another service (an LLM, a ticketing tool) and
putting the real values back in its reply.

### Just find

```python
from chad_pii import find

for e in find(text):
    print(e.type, e.text, e.start, e.end, round(e.score, 2), e.rule)
```

`min_score` (default 0.5) sets how sure the model must be. Items caught or
confirmed by a rule are always returned.

## Many texts, JSON, CSV and pandas

Each of these batches the work, so it's much faster than a loop:

```python
from chad_pii import redact_many, redact_json, redact_csv, redact_dataframe

redact_many(["Call Sarah at 6626341142", "Email raj@example.com"])

redact_json({"user": {"name": "Sarah Johnson", "email": "sarah.j@example.com", "age": 41}})
# {"user": {"name": "[PERSON]", "email": "[EMAIL]", "age": 41}}

redact_csv(open("customers.csv").read(), columns=["name", "email", "notes"])

safe_df = redact_dataframe(df, mode="fake")        # pip install "chad-pii[pandas]"
```

## Keep personal data out of LLM prompts

```python
from chad_pii import Guard

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
pip install "chad-pii[server]"
chad-pii serve --port 8000
curl -X POST localhost:8000/redact -H 'content-type: application/json' \
     -d '{"text": "Call Sarah at 6626341142", "mode": "token"}'
```

Endpoints: `POST /redact`, `POST /find`, `POST /restore`, `GET /health`, with
interactive docs at `/docs`. It runs on your machine, so nothing is sent anywhere.

## Command line

```bash
chad-pii "Call Sarah at 662-634-1142"
cat notes.txt | chad-pii --mode mask > notes-redacted.txt
chad-pii --find "My SSN is 123-45-6789"
chad-pii --file customers.csv --columns name,email -o customers-safe.csv   # also .json, .jsonl, .txt
```

## Offline use

After the first run the model is cached, and nothing is ever sent anywhere.
To be sure no network call is attempted, set `HF_HUB_OFFLINE=1`.

## Limits

This is a research model. It can miss things or flag things by mistake, so
please don't rely on it alone for compliance work.

MIT licensed. Made by Michael Chad Tollison.
