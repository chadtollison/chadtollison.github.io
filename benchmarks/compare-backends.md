# scrubpii vs Microsoft Presidio vs spaCy

Run on 2026-11-27 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 (ONNX 8-bit) | 99% | 99% | 99% | 0.992 | 12 |
| scrubpii (PyTorch) | 99% | 99% | 100% | **0.993** | 37 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 9 |

Caught, by type:

| Type | Items | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 319 | 99% | 99% | 66% |
| CREDIT_CARD | 13 | 100% | 100% | 62% |
| DRIVER_LICENSE | 12 | 100% | 100% | 67% |
| EMAIL | 123 | 100% | 100% | 100% |
| ID_NUMBER | 109 | 96% | 97% | 50% |
| PASSPORT | 24 | 96% | 96% | 100% |
| PERSON | 848 | 100% | 100% | 78% |
| PHONE | 171 | 99% | 100% | 63% |
| SSN | 18 | 72% | 72% | 100% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 (ONNX 8-bit) | 99% | 98% | 100% | **0.992** | 17 |
| scrubpii (PyTorch) | 99% | 98% | 99% | 0.991 | 47 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 9 |

Caught, by type:

| Type | Items | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 98% | 36% |
| CREDIT_CARD | 14 | 100% | 100% | 64% |
| DRIVER_LICENSE | 11 | 100% | 100% | 46% |
| EMAIL | 58 | 100% | 100% | 100% |
| ID_NUMBER | 56 | 100% | 100% | 70% |
| PASSPORT | 26 | 100% | 100% | 65% |
| PERSON | 365 | 100% | 100% | 63% |
| PHONE | 79 | 99% | 100% | 65% |
| SSN | 12 | 67% | 67% | 100% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 (ONNX 8-bit) | 100% | 99% | 99% | **0.992** | 30 |
| scrubpii (PyTorch) | 100% | 99% | 99% | **0.992** | 72 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 17 |

Caught, by type:

| Type | Items | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 312 | 99% | 100% | 81% |
| API_KEY | 7 | 100% | 100% | 29% |
| CREDIT_CARD | 161 | 98% | 98% | 86% |
| DATE_OF_BIRTH | 477 | 99% | 99% | 100% |
| EMAIL | 222 | 100% | 100% | 100% |
| ID_NUMBER | 547 | 100% | 100% | 75% |
| IP_ADDRESS | 166 | 100% | 100% | 99% |
| PASSWORD | 13 | 100% | 100% | 23% |
| PERSON | 421 | 99% | 99% | 90% |
| PHONE | 211 | 100% | 100% | 95% |
| SSN | 349 | 100% | 100% | 86% |
| USERNAME | 47 | 100% | 100% | 26% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 (ONNX 8-bit) | 74% | 67% | 86% | 0.796 | 195 |
| scrubpii (PyTorch) | 76% | 69% | 84% | **0.798** | 415 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 75 |

Caught, by type:

| Type | Items | scrubpii 0.4 (ONNX 8-bit) | scrubpii (PyTorch) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 801 | 81% | 82% | 78% |
| API_KEY | 19 | 84% | 84% | 16% |
| CREDIT_CARD | 26 | 88% | 88% | 85% |
| DATE_OF_BIRTH | 52 | 90% | 92% | 94% |
| DRIVER_LICENSE | 30 | 77% | 77% | 93% |
| EMAIL | 292 | 98% | 98% | 99% |
| IBAN | 57 | 61% | 60% | 54% |
| IP_ADDRESS | 73 | 73% | 73% | 99% |
| PASSPORT | 24 | 79% | 92% | 100% |
| PASSWORD | 33 | 67% | 70% | 39% |
| PERSON | 1503 | 63% | 65% | 79% |
| PHONE | 183 | 98% | 98% | 92% |
| SSN | 32 | 88% | 84% | 75% |
| USERNAME | 11 | 82% | 91% | 36% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except scrubpii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0).
