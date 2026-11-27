# chad-pii vs Microsoft Presidio vs spaCy

Run on 2026-11-27 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 99% | 99% | 100% | **0.993** | 36 |
| chad-pii v2 (current) | 81% | 73% | 94% | 0.869 | 34 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 9 |
| spaCy (en_core_web_lg) | 52% | 46% | 98% | 0.676 | 7 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 319 | 99% | 68% | 66% | 61% |
| CREDIT_CARD | 13 | 100% | 8% | 62% | 0% |
| DRIVER_LICENSE | 12 | 100% | 17% | 67% | 17% |
| EMAIL | 123 | 99% | 100% | 100% | 0% |
| ID_NUMBER | 109 | 97% | 8% | 50% | 4% |
| PASSPORT | 24 | 96% | 4% | 100% | 4% |
| PERSON | 848 | 100% | 98% | 78% | 76% |
| PHONE | 171 | 100% | 74% | 63% | 2% |
| SSN | 18 | 72% | 72% | 100% | 0% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 99% | 98% | 99% | **0.991** | 45 |
| chad-pii v2 (current) | 73% | 64% | 62% | 0.675 | 44 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 8 |
| spaCy (en_core_web_lg) | 41% | 34% | 52% | 0.461 | 7 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 77% | 36% | 32% |
| CREDIT_CARD | 14 | 100% | 21% | 64% | 14% |
| DRIVER_LICENSE | 11 | 100% | 0% | 46% | 18% |
| EMAIL | 58 | 100% | 90% | 100% | 12% |
| ID_NUMBER | 56 | 100% | 2% | 70% | 25% |
| PASSPORT | 26 | 100% | 0% | 65% | 38% |
| PERSON | 365 | 100% | 93% | 63% | 60% |
| PHONE | 79 | 100% | 63% | 65% | 18% |
| SSN | 12 | 67% | 42% | 100% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 100% | 99% | 99% | **0.992** | 67 |
| chad-pii v2 (current) | 68% | 57% | 90% | 0.773 | 66 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 16 |
| spaCy (en_core_web_lg) | 22% | 14% | 85% | 0.356 | 13 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 312 | 100% | 92% | 81% | 75% |
| API_KEY | 7 | 100% | 57% | 29% | 14% |
| CREDIT_CARD | 161 | 98% | 76% | 86% | 0% |
| DATE_OF_BIRTH | 477 | 99% | 65% | 100% | 0% |
| EMAIL | 222 | 100% | 97% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 6% | 75% | 7% |
| IP_ADDRESS | 166 | 100% | 85% | 99% | 2% |
| PASSWORD | 13 | 100% | 38% | 23% | 8% |
| PERSON | 421 | 99% | 97% | 90% | 89% |
| PHONE | 211 | 100% | 74% | 95% | 1% |
| SSN | 349 | 100% | 80% | 86% | 0% |
| USERNAME | 47 | 100% | 57% | 26% | 8% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| chad-pii v3 | 70% | 63% | 84% | **0.761** | 376 |
| chad-pii v2 (current) | 85% | 59% | 53% | 0.651 | 378 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 72 |
| spaCy (en_core_web_lg) | 55% | 34% | 61% | 0.580 | 59 |

Caught, by type:

| Type | Items | chad-pii v3 | chad-pii v2 (current) | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 801 | 82% | 91% | 78% | 73% |
| API_KEY | 19 | 84% | 42% | 16% | 0% |
| CREDIT_CARD | 26 | 88% | 58% | 85% | 4% |
| DATE_OF_BIRTH | 52 | 92% | 85% | 94% | 0% |
| DRIVER_LICENSE | 30 | 77% | 13% | 93% | 0% |
| EMAIL | 292 | 52% | 98% | 99% | 0% |
| IBAN | 57 | 60% | 51% | 54% | 4% |
| IP_ADDRESS | 73 | 70% | 44% | 99% | 6% |
| PASSPORT | 24 | 92% | 8% | 100% | 0% |
| PASSWORD | 33 | 70% | 24% | 39% | 3% |
| PERSON | 1503 | 65% | 86% | 79% | 76% |
| PHONE | 183 | 70% | 95% | 92% | 0% |
| SSN | 32 | 84% | 88% | 75% | 0% |
| USERNAME | 11 | 82% | 46% | 36% | 9% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except chad-pii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0).
