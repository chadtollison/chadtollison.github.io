---
language: [en, es]
license: apache-2.0
library_name: transformers
pipeline_tag: token-classification
tags: [pii, redaction, privacy, ner, distilbert]
datasets:
  - ai4privacy/open-pii-masking-500k-ai4privacy
  - gretelai/gretel-pii-masking-en-v1
---

# pii-distilbert-v3

A DistilBERT (cased, 66M parameters) token classifier that finds 15 kinds of personal data in English and Spanish text:
names, addresses, emails, phone numbers, SSNs, card numbers, IBANs, passports, driver's licenses, ID numbers,
dates of birth, usernames, passwords, IP addresses and API keys (BIO labels).

The easiest way to use it is the [scrubpii](https://pypi.org/project/scrubpii/) package, which adds checksum rules
(Luhn, IBAN, SSN), email/IP/API-key rules and reads long text in 128-token windows:

```python
pip install scrubpii
from scrubpii import redact
redact("Email sarah.j@example.com or call 415-555-0198")   # 'Email [EMAIL] or call [PHONE]'
```

Try it in the browser (nothing leaves the page): https://chadtollison.github.io/pii/

## Head-to-head (F1, scrubpii package with this model)

| Dataset (held-out texts) | scrubpii | Microsoft Presidio | spaCy |
|---|---:|---:|---:|
| ai4privacy, English | 0.99 | 0.81 | 0.68 |
| ai4privacy, Spanish | 0.99 | 0.63 | 0.46 |
| Gretel PII, English | 0.99 | 0.85 | 0.36 |
| Gretel finance, English (never trained on) | 0.79 | 0.52 | 0.58 |

F1 of "caught" (share of marked personal data covered) and "was personal" (share of finds on real personal data).
Presidio is about 4x faster per text. Full results by type:
[benchmarks/compare.md](https://github.com/chadtollison/chadtollison.github.io/blob/main/benchmarks/compare.md).

## Training data

- [ai4privacy/open-pii-masking-500k-ai4privacy](https://huggingface.co/datasets/ai4privacy/open-pii-masking-500k-ai4privacy), CC BY 4.0, by Ai4Privacy (English and Spanish rows)
- [gretelai/gretel-pii-masking-en-v1](https://huggingface.co/datasets/gretelai/gretel-pii-masking-en-v1), Apache 2.0
- Generated sentences ([training/retrain_pii.py](https://github.com/chadtollison/chadtollison.github.io/blob/main/training/retrain_pii.py))

Fine-tuned from ChadTollison/pii-distilbert-v2 for one epoch on about 100,000 texts on a CPU runner.
Code: [training/train_v3.py](https://github.com/chadtollison/chadtollison.github.io/blob/main/training/train_v3.py).

## Limits

Trained mostly on short texts: read long documents in short windows (the package does this). Synthetic-looking
training data means real-world recall will be lower than these benchmarks; always review redactions for
high-stakes use.
