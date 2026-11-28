# scrubpii vs Microsoft Presidio vs spaCy

Run on 2026-11-28 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 99% | 99% | 99% | **0.992** | 11 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 9 |
| spaCy (en_core_web_lg) | 52% | 46% | 98% | 0.676 | 7 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 319 | 99% | 66% | 61% |
| CREDIT_CARD | 13 | 100% | 62% | 0% |
| DRIVER_LICENSE | 12 | 100% | 67% | 17% |
| EMAIL | 123 | 100% | 100% | 0% |
| ID_NUMBER | 109 | 96% | 50% | 4% |
| PASSPORT | 24 | 96% | 100% | 4% |
| PERSON | 848 | 100% | 78% | 76% |
| PHONE | 171 | 99% | 63% | 2% |
| SSN | 18 | 72% | 100% | 0% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 99% | 98% | 100% | **0.992** | 16 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 9 |
| spaCy (en_core_web_lg) | 41% | 34% | 52% | 0.461 | 7 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 36% | 32% |
| CREDIT_CARD | 14 | 100% | 64% | 14% |
| DRIVER_LICENSE | 11 | 100% | 46% | 18% |
| EMAIL | 58 | 100% | 100% | 12% |
| ID_NUMBER | 56 | 100% | 70% | 25% |
| PASSPORT | 26 | 100% | 65% | 38% |
| PERSON | 365 | 100% | 63% | 60% |
| PHONE | 79 | 99% | 65% | 18% |
| SSN | 12 | 67% | 100% | 25% |

## ai4privacy (French)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 98% | 96% | 94% | **0.957** | 17 |
| Microsoft Presidio | 66% | 58% | 72% | 0.690 | 9 |
| spaCy (en_core_web_lg) | 38% | 33% | 58% | 0.457 | 8 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 111 | 99% | 37% | 32% |
| CREDIT_CARD | 18 | 94% | 89% | 0% |
| DRIVER_LICENSE | 11 | 91% | 55% | 0% |
| EMAIL | 80 | 100% | 100% | 9% |
| ID_NUMBER | 46 | 96% | 72% | 6% |
| PASSPORT | 18 | 100% | 56% | 6% |
| PERSON | 375 | 97% | 65% | 64% |
| PHONE | 95 | 100% | 66% | 4% |
| SSN | 12 | 92% | 92% | 0% |

## ai4privacy (German)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 97% | 94% | 66% | **0.786** | 16 |
| Microsoft Presidio | 75% | 65% | 50% | 0.602 | 8 |
| spaCy (en_core_web_lg) | 47% | 42% | 32% | 0.381 | 7 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 129 | 88% | 58% | 49% |
| CREDIT_CARD | 13 | 100% | 92% | 0% |
| DRIVER_LICENSE | 15 | 100% | 93% | 20% |
| EMAIL | 61 | 100% | 100% | 5% |
| ID_NUMBER | 73 | 97% | 89% | 14% |
| PASSPORT | 27 | 100% | 59% | 7% |
| PERSON | 384 | 98% | 76% | 74% |
| PHONE | 83 | 100% | 70% | 12% |
| SSN | 12 | 92% | 42% | 0% |

## ai4privacy (Italian)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 99% | 97% | 94% | **0.965** | 15 |
| Microsoft Presidio | 68% | 58% | 60% | 0.638 | 8 |
| spaCy (en_core_web_lg) | 42% | 35% | 45% | 0.434 | 7 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 160 | 98% | 52% | 42% |
| CREDIT_CARD | 8 | 88% | 100% | 12% |
| DRIVER_LICENSE | 10 | 100% | 100% | 10% |
| EMAIL | 55 | 100% | 100% | 9% |
| ID_NUMBER | 59 | 100% | 88% | 12% |
| PASSPORT | 13 | 100% | 100% | 15% |
| PERSON | 361 | 100% | 63% | 62% |
| PHONE | 83 | 100% | 75% | 8% |
| SSN | 4 | 100% | 25% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 100% | 99% | 99% | **0.992** | 28 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 16 |
| spaCy (en_core_web_lg) | 22% | 14% | 85% | 0.356 | 14 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 312 | 99% | 81% | 75% |
| API_KEY | 7 | 100% | 29% | 14% |
| CREDIT_CARD | 161 | 98% | 86% | 0% |
| DATE_OF_BIRTH | 477 | 99% | 100% | 0% |
| EMAIL | 222 | 100% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 75% | 7% |
| IP_ADDRESS | 166 | 100% | 99% | 2% |
| PASSWORD | 13 | 100% | 23% | 8% |
| PERSON | 421 | 99% | 90% | 89% |
| PHONE | 211 | 100% | 95% | 1% |
| SSN | 349 | 100% | 86% | 0% |
| USERNAME | 47 | 100% | 26% | 8% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 74% | 67% | 86% | **0.796** | 191 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 71 |
| spaCy (en_core_web_lg) | 55% | 34% | 61% | 0.580 | 59 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 801 | 81% | 78% | 73% |
| API_KEY | 19 | 84% | 16% | 0% |
| CREDIT_CARD | 26 | 88% | 85% | 4% |
| DATE_OF_BIRTH | 52 | 90% | 94% | 0% |
| DRIVER_LICENSE | 30 | 77% | 93% | 0% |
| EMAIL | 292 | 98% | 99% | 0% |
| IBAN | 57 | 61% | 54% | 4% |
| IP_ADDRESS | 73 | 73% | 99% | 6% |
| PASSPORT | 24 | 79% | 100% | 0% |
| PASSWORD | 33 | 67% | 39% | 3% |
| PERSON | 1503 | 63% | 79% | 76% |
| PHONE | 183 | 98% | 92% | 0% |
| SSN | 32 | 88% | 75% | 0% |
| USERNAME | 11 | 82% | 36% | 9% |

## Medical records (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 84% | 79% | 99% | **0.912** | 98 |
| Microsoft Presidio | 88% | 78% | 76% | 0.816 | 40 |
| spaCy (en_core_web_lg) | 32% | 30% | 94% | 0.474 | 35 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 248 | 85% | 64% | 52% |
| API_KEY | 2 | 100% | 0% | 0% |
| CREDIT_CARD | 28 | 96% | 68% | 0% |
| DATE_OF_BIRTH | 519 | 100% | 100% | 0% |
| EMAIL | 402 | 99% | 99% | 1% |
| ID_NUMBER | 918 | 81% | 86% | 2% |
| IP_ADDRESS | 5 | 100% | 100% | 0% |
| PASSWORD | 85 | 54% | 65% | 6% |
| PERSON | 1274 | 72% | 85% | 84% |
| PHONE | 365 | 100% | 94% | 0% |
| SSN | 42 | 100% | 98% | 0% |
| USERNAME | 21 | 76% | 33% | 14% |

## Support tickets, emails, transcripts (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 78% | 73% | 99% | **0.871** | 114 |
| Microsoft Presidio | 82% | 76% | 75% | 0.783 | 47 |
| spaCy (en_core_web_lg) | 40% | 39% | 97% | 0.568 | 40 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 188 | 72% | 63% | 56% |
| API_KEY | 5 | 100% | 20% | 20% |
| CREDIT_CARD | 127 | 99% | 72% | 0% |
| DATE_OF_BIRTH | 80 | 100% | 100% | 0% |
| EMAIL | 818 | 99% | 99% | 1% |
| ID_NUMBER | 65 | 80% | 78% | 5% |
| IP_ADDRESS | 67 | 100% | 98% | 0% |
| PASSWORD | 204 | 63% | 53% | 4% |
| PERSON | 1723 | 64% | 83% | 82% |
| PHONE | 315 | 100% | 95% | 1% |
| SSN | 51 | 100% | 100% | 0% |
| USERNAME | 352 | 66% | 52% | 19% |

## Logs and config files (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii 0.4 | 81% | 77% | 97% | **0.884** | 135 |
| Microsoft Presidio | 70% | 60% | 74% | 0.717 | 43 |
| spaCy (en_core_web_lg) | 19% | 18% | 88% | 0.313 | 35 |

Caught, by type:

| Type | Items | scrubpii 0.4 | Microsoft Presidio | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|
| ADDRESS | 114 | 68% | 69% | 64% |
| API_KEY | 533 | 97% | 11% | 2% |
| CREDIT_CARD | 58 | 97% | 66% | 0% |
| DATE_OF_BIRTH | 25 | 100% | 100% | 0% |
| EMAIL | 447 | 99% | 100% | 2% |
| ID_NUMBER | 102 | 79% | 79% | 1% |
| IP_ADDRESS | 786 | 100% | 99% | 1% |
| PASSWORD | 252 | 62% | 49% | 4% |
| PERSON | 634 | 53% | 88% | 84% |
| PHONE | 157 | 100% | 94% | 0% |
| SSN | 10 | 100% | 100% | 0% |
| USERNAME | 605 | 62% | 44% | 11% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except scrubpii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0).
