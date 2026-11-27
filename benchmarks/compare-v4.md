# chad-pii vs Microsoft Presidio vs spaCy

Run on 2026-11-27 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii-v3 | 99% | 99% | 100% | 0.993 | 26 |
| v4-long-documents | 100% | 99% | 100% | **0.996** | 25 |
| v4-large-DeBERTa | 74% | 52% | 100% | 0.846 | 63 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 6 |
| spaCy (en_core_web_lg) | 52% | 46% | 98% | 0.676 | 5 |

Caught, by type:

| Type | Items | chad-pii-v3 | v4-long-documents | v4-large-DeBERTa | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 319 | 99% | 99% | 88% | 66% | 61% |
| CREDIT_CARD | 13 | 100% | 100% | 85% | 62% | 0% |
| DRIVER_LICENSE | 12 | 100% | 100% | 83% | 67% | 17% |
| EMAIL | 123 | 99% | 100% | 58% | 100% | 0% |
| ID_NUMBER | 109 | 97% | 97% | 70% | 50% | 4% |
| PASSPORT | 24 | 96% | 100% | 75% | 100% | 4% |
| PERSON | 848 | 100% | 100% | 70% | 78% | 76% |
| PHONE | 171 | 100% | 100% | 78% | 63% | 2% |
| SSN | 18 | 72% | 100% | 78% | 100% | 0% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii-v3 | 99% | 98% | 99% | 0.991 | 33 |
| v4-long-documents | 99% | 99% | 100% | **0.996** | 33 |
| v4-large-DeBERTa | 73% | 53% | 100% | 0.843 | 67 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 5 |
| spaCy (en_core_web_lg) | 41% | 34% | 52% | 0.461 | 5 |

Caught, by type:

| Type | Items | chad-pii-v3 | v4-long-documents | v4-large-DeBERTa | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 99% | 81% | 36% | 32% |
| CREDIT_CARD | 14 | 100% | 100% | 64% | 64% | 14% |
| DRIVER_LICENSE | 11 | 100% | 100% | 46% | 46% | 18% |
| EMAIL | 58 | 100% | 100% | 60% | 100% | 12% |
| ID_NUMBER | 56 | 100% | 100% | 71% | 70% | 25% |
| PASSPORT | 26 | 100% | 100% | 85% | 65% | 38% |
| PERSON | 365 | 100% | 100% | 70% | 63% | 60% |
| PHONE | 79 | 100% | 100% | 84% | 65% | 18% |
| SSN | 12 | 67% | 83% | 75% | 100% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii-v3 | 100% | 99% | 99% | 0.992 | 51 |
| v4-long-documents | 100% | 100% | 99% | **0.993** | 52 |
| v4-large-DeBERTa | 65% | 45% | 100% | 0.787 | 88 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 11 |
| spaCy (en_core_web_lg) | 22% | 14% | 85% | 0.356 | 9 |

Caught, by type:

| Type | Items | chad-pii-v3 | v4-long-documents | v4-large-DeBERTa | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 312 | 100% | 100% | 95% | 81% | 75% |
| API_KEY | 7 | 100% | 100% | 86% | 29% | 14% |
| CREDIT_CARD | 161 | 98% | 99% | 86% | 86% | 0% |
| DATE_OF_BIRTH | 477 | 99% | 100% | 72% | 100% | 0% |
| EMAIL | 222 | 100% | 100% | 34% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 100% | 31% | 75% | 7% |
| IP_ADDRESS | 166 | 100% | 100% | 34% | 99% | 2% |
| PASSWORD | 13 | 100% | 100% | 8% | 23% | 8% |
| PERSON | 421 | 99% | 99% | 86% | 90% | 89% |
| PHONE | 211 | 100% | 100% | 60% | 95% | 1% |
| SSN | 349 | 100% | 100% | 92% | 86% | 0% |
| USERNAME | 47 | 100% | 100% | 23% | 26% | 8% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii-v3 | 70% | 63% | 84% | **0.761** | 291 |
| v4-long-documents | 70% | 65% | 81% | 0.755 | 300 |
| v4-large-DeBERTa | 48% | 14% | 88% | 0.619 | 433 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 53 |
| spaCy (en_core_web_lg) | 55% | 34% | 61% | 0.580 | 45 |

Caught, by type:

| Type | Items | chad-pii-v3 | v4-long-documents | v4-large-DeBERTa | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 801 | 82% | 82% | 76% | 78% | 73% |
| API_KEY | 19 | 84% | 90% | 37% | 16% | 0% |
| CREDIT_CARD | 26 | 88% | 88% | 73% | 85% | 4% |
| DATE_OF_BIRTH | 52 | 92% | 92% | 81% | 94% | 0% |
| DRIVER_LICENSE | 30 | 77% | 90% | 13% | 93% | 0% |
| EMAIL | 292 | 52% | 56% | 3% | 99% | 0% |
| IBAN | 57 | 60% | 70% | 54% | 54% | 4% |
| IP_ADDRESS | 73 | 70% | 73% | 14% | 99% | 6% |
| PASSPORT | 24 | 92% | 100% | 21% | 100% | 0% |
| PASSWORD | 33 | 70% | 85% | 6% | 39% | 3% |
| PERSON | 1503 | 65% | 66% | 44% | 79% | 76% |
| PHONE | 183 | 70% | 52% | 32% | 92% | 0% |
| SSN | 32 | 84% | 88% | 84% | 75% | 0% |
| USERNAME | 11 | 82% | 91% | 9% | 36% | 9% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except chad-pii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0).
