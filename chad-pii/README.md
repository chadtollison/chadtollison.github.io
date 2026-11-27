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

It finds **names, emails, phone numbers, Social Security numbers, card
numbers, IP addresses, passports, driver's licenses, API keys and IBANs**, in
English and Spanish. A fine-tuned DistilBERT model
([ChadTollison/pii-distilbert-v2](https://huggingface.co/ChadTollison/pii-distilbert-v2))
does the finding, and rules double-check it: card numbers must pass Luhn,
IBANs their bank checksum, SSNs the SSA format. The rules also catch 10-digit
US phone numbers with a real area code, valid IBANs and well-known API key
formats even if the model misses them.

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

## Command line

```bash
chad-pii "Call Sarah at 662-634-1142"
cat notes.txt | chad-pii --mode mask > notes-redacted.txt
chad-pii --find "My SSN is 123-45-6789"
```

## Limits

This is a research model. It can miss things or flag things by mistake, so
please don't rely on it alone for compliance work.

MIT licensed. Made by Michael Chad Tollison.
