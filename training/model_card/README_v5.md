---
language: [en, es, fr, de, it]
license: apache-2.0
library_name: transformers
pipeline_tag: token-classification
tags: [pii, redaction, privacy, ner, distilbert, onnx]
datasets:
  - ai4privacy/open-pii-masking-500k-ai4privacy
  - gretelai/gretel-pii-masking-en-v1
  - nvidia/Nemotron-PII
---

# pii-distilbert-v5

A DistilBERT (cased, 66M parameters) token classifier that finds 15 kinds of personal data in English, Spanish,
French, German and Italian text: names, addresses, emails, phone numbers, SSNs, card numbers, IBANs, passports,
driver's licenses, ID numbers (including medical record and health plan numbers), dates of birth, usernames,
passwords, IP addresses and API keys (BIO labels). An 8-bit ONNX copy is in `onnx/model_quantized.onnx` (66 MB).

The easiest way to use it is the [scrubpii](https://pypi.org/project/scrubpii/) package. It runs the 8-bit copy
with ONNX Runtime (no PyTorch), adds checksum rules (Luhn, IBAN, SSN, NPI, DEA), reads long text in short windows,
and lets you add your own rules in plain English:

```python
pip install scrubpii
from scrubpii import redact
redact("Email sarah.j@example.com or call 415-555-0198")   # 'Email [EMAIL] or call [PHONE]'
```

Try it in the browser (nothing leaves the page): https://chadtollison.github.io/redact.html

## Head-to-head (F1, scrubpii package with this model, 8-bit)

| Dataset (held-out texts) | scrubpii v5 | scrubpii v3 | Microsoft Presidio |
|---|---:|---:|---:|
| ai4privacy, English | 1.00 | 0.99 | 0.81 |
| ai4privacy, Spanish | 0.99 | 0.99 | 0.63 |
| ai4privacy, French | 0.99 | 0.96 | 0.69 |
| ai4privacy, German | 0.98 | 0.79 | 0.60 |
| ai4privacy, Italian | 0.99 | 0.96 | 0.64 |
| Gretel PII, English | 0.99 | 0.99 | 0.85 |
| Gretel finance, English (never trained on) | 0.85 | 0.80 | 0.52 |
| Nemotron-PII medical records (test split) | 0.99 | 0.91 | 0.82 |
| Nemotron-PII tickets, emails, transcripts (test split) | 0.99 | 0.87 | 0.78 |
| Nemotron-PII logs and config files (test split) | 0.97 | 0.88 | 0.72 |

F1 of "caught" (share of marked personal data covered) and "was personal" (share of finds on real personal data).
v5 trained on Nemotron-PII's train split, so its Nemotron scores are on the separate test split of the same
data; the Gretel finance set is from a dataset it never saw. Full results by type:
[benchmarks/compare-v5.md](https://github.com/chadtollison/chadtollison.github.io/blob/main/benchmarks/compare-v5.md).

## Training data

- [ai4privacy/open-pii-masking-500k-ai4privacy](https://huggingface.co/datasets/ai4privacy/open-pii-masking-500k-ai4privacy), CC BY 4.0, by Ai4Privacy (English, Spanish, French, German and Italian rows)
- [gretelai/gretel-pii-masking-en-v1](https://huggingface.co/datasets/gretelai/gretel-pii-masking-en-v1), Apache 2.0
- [nvidia/Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), CC BY 4.0, by NVIDIA (train split)
- Generated sentences ([training/retrain_pii.py](https://github.com/chadtollison/chadtollison.github.io/blob/main/training/retrain_pii.py))

Fine-tuned from ChadTollison/pii-distilbert-v3 on about 114,000 texts (15% of them long documents made by joining
short ones) on a free CPU runner. Code: [training/train_v3.py](https://github.com/chadtollison/chadtollison.github.io/blob/main/training/train_v3.py)
and [.github/workflows/pii-v5.yml](https://github.com/chadtollison/chadtollison.github.io/blob/main/.github/workflows/pii-v5.yml).

## Limits

The training data is synthetic, so real-world recall will be lower than these benchmarks; always review
redactions for high-stakes use. Read long documents in short windows (the package does this).
