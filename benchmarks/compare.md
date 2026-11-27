# chad-pii vs Microsoft Presidio vs spaCy

Run on 2026-11-27 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 98% | 98% | 100% | **0.989** | 18 |
| chad-pii v2 (current) | 79% | 72% | 94% | 0.858 | 17 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 7 |
| spaCy (en_core_web_lg) | 52% | 46% | 98% | 0.676 | 6 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 319 | 99% | 67% | 66% | 61% |
| CREDIT_CARD | 13 | 0% | 0% | 62% | 0% |
| DRIVER_LICENSE | 12 | 100% | 8% | 67% | 17% |
| EMAIL | 123 | 99% | 98% | 100% | 0% |
| ID_NUMBER | 109 | 96% | 6% | 50% | 4% |
| PASSPORT | 24 | 96% | 0% | 100% | 4% |
| PERSON | 848 | 100% | 98% | 78% | 76% |
| PHONE | 171 | 100% | 67% | 63% | 2% |
| SSN | 18 | 67% | 44% | 100% | 0% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 97% | 96% | 99% | **0.981** | 22 |
| chad-pii v2 (current) | 70% | 61% | 62% | 0.657 | 22 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 6 |
| spaCy (en_core_web_lg) | 41% | 34% | 52% | 0.461 | 6 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 76% | 36% | 32% |
| CREDIT_CARD | 14 | 0% | 0% | 64% | 14% |
| DRIVER_LICENSE | 11 | 100% | 0% | 46% | 18% |
| EMAIL | 58 | 98% | 64% | 100% | 12% |
| ID_NUMBER | 56 | 100% | 0% | 70% | 25% |
| PASSPORT | 26 | 100% | 0% | 65% | 38% |
| PERSON | 365 | 100% | 93% | 63% | 60% |
| PHONE | 79 | 100% | 57% | 65% | 18% |
| SSN | 12 | 67% | 33% | 100% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 93% | 92% | 99% | **0.957** | 30 |
| chad-pii v2 (current) | 47% | 37% | 88% | 0.614 | 29 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 12 |
| spaCy (en_core_web_lg) | 22% | 14% | 85% | 0.356 | 10 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 312 | 100% | 90% | 81% | 75% |
| API_KEY | 7 | 100% | 57% | 29% | 14% |
| CREDIT_CARD | 161 | 60% | 24% | 86% | 0% |
| DATE_OF_BIRTH | 477 | 99% | 0% | 100% | 0% |
| EMAIL | 222 | 100% | 90% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 1% | 75% | 7% |
| IP_ADDRESS | 166 | 92% | 71% | 99% | 2% |
| PASSWORD | 13 | 100% | 0% | 23% | 8% |
| PERSON | 421 | 99% | 97% | 90% | 89% |
| PHONE | 211 | 100% | 71% | 95% | 1% |
| SSN | 349 | 63% | 50% | 86% | 0% |
| USERNAME | 47 | 100% | 8% | 26% | 8% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 51% | 42% | 89% | 0.650 | 152 |
| chad-pii v2 (current) | 77% | 50% | 64% | **0.701** | 152 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 55 |
| spaCy (en_core_web_lg) | 55% | 34% | 61% | 0.580 | 46 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 801 | 72% | 83% | 78% | 73% |
| API_KEY | 19 | 63% | 32% | 16% | 0% |
| CREDIT_CARD | 26 | 27% | 27% | 85% | 4% |
| DATE_OF_BIRTH | 52 | 23% | 0% | 94% | 0% |
| DRIVER_LICENSE | 30 | 63% | 10% | 93% | 0% |
| EMAIL | 292 | 29% | 91% | 99% | 0% |
| IBAN | 57 | 53% | 49% | 54% | 4% |
| IP_ADDRESS | 73 | 34% | 37% | 99% | 6% |
| PASSPORT | 24 | 62% | 17% | 100% | 0% |
| PASSWORD | 33 | 48% | 3% | 39% | 3% |
| PERSON | 1503 | 46% | 81% | 79% | 76% |
| PHONE | 183 | 51% | 93% | 92% | 0% |
| SSN | 32 | 69% | 62% | 75% | 0% |
| USERNAME | 11 | 36% | 27% | 36% | 9% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except chad-pii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0).
