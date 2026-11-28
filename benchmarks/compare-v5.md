# scrubpii vs Microsoft Presidio vs spaCy

Run on 2026-11-28 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 100% | 100% | 100% | **0.996** | 3 |
| scrubpii v3 (0.5) | 99% | 99% | 99% | 0.993 | 4 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 6 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 319 | 100% | 99% | 66% |
| CREDIT_CARD | 13 | 100% | 100% | 62% |
| DRIVER_LICENSE | 12 | 100% | 100% | 67% |
| EMAIL | 123 | 100% | 100% | 100% |
| ID_NUMBER | 109 | 99% | 96% | 50% |
| PASSPORT | 24 | 96% | 96% | 100% |
| PERSON | 848 | 100% | 100% | 78% |
| PHONE | 171 | 100% | 99% | 63% |
| SSN | 18 | 94% | 78% | 100% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 99% | 99% | 100% | **0.994** | 5 |
| scrubpii v3 (0.5) | 99% | 98% | 99% | 0.991 | 5 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 5 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 169 | 98% | 98% | 36% |
| CREDIT_CARD | 14 | 100% | 100% | 64% |
| DRIVER_LICENSE | 11 | 100% | 100% | 46% |
| EMAIL | 58 | 100% | 100% | 100% |
| ID_NUMBER | 56 | 100% | 100% | 70% |
| PASSPORT | 26 | 100% | 100% | 65% |
| PERSON | 365 | 100% | 100% | 63% |
| PHONE | 79 | 100% | 100% | 65% |
| SSN | 12 | 67% | 67% | 100% |

## ai4privacy (French)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 99% | 99% | 100% | **0.993** | 5 |
| scrubpii v3 (0.5) | 98% | 96% | 94% | 0.956 | 5 |
| Microsoft Presidio | 66% | 58% | 72% | 0.690 | 6 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 111 | 99% | 99% | 37% |
| CREDIT_CARD | 18 | 94% | 94% | 89% |
| DRIVER_LICENSE | 11 | 100% | 91% | 55% |
| EMAIL | 80 | 100% | 100% | 100% |
| ID_NUMBER | 46 | 100% | 96% | 72% |
| PASSPORT | 18 | 100% | 100% | 56% |
| PERSON | 375 | 100% | 97% | 65% |
| PHONE | 95 | 100% | 100% | 66% |
| SSN | 12 | 67% | 92% | 92% |

## ai4privacy (German)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 98% | 97% | 99% | **0.984** | 5 |
| scrubpii v3 (0.5) | 97% | 94% | 66% | 0.788 | 5 |
| Microsoft Presidio | 75% | 65% | 50% | 0.602 | 6 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 129 | 96% | 88% | 58% |
| CREDIT_CARD | 13 | 100% | 100% | 92% |
| DRIVER_LICENSE | 15 | 100% | 100% | 93% |
| EMAIL | 61 | 100% | 100% | 100% |
| ID_NUMBER | 73 | 99% | 97% | 89% |
| PASSPORT | 27 | 100% | 100% | 59% |
| PERSON | 384 | 98% | 98% | 76% |
| PHONE | 83 | 100% | 100% | 70% |
| SSN | 12 | 92% | 100% | 42% |

## ai4privacy (Italian)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 99% | 99% | 99% | **0.992** | 7 |
| scrubpii v3 (0.5) | 99% | 97% | 94% | 0.964 | 5 |
| Microsoft Presidio | 68% | 58% | 60% | 0.638 | 5 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 160 | 99% | 97% | 52% |
| CREDIT_CARD | 8 | 100% | 88% | 100% |
| DRIVER_LICENSE | 10 | 100% | 100% | 100% |
| EMAIL | 55 | 100% | 100% | 100% |
| ID_NUMBER | 59 | 100% | 100% | 88% |
| PASSPORT | 13 | 100% | 100% | 100% |
| PERSON | 361 | 99% | 100% | 63% |
| PHONE | 83 | 99% | 100% | 75% |
| SSN | 4 | 100% | 100% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 100% | 99% | 99% | 0.991 | 8 |
| scrubpii v3 (0.5) | 100% | 99% | 99% | **0.992** | 8 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 11 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 312 | 99% | 100% | 81% |
| API_KEY | 7 | 100% | 100% | 29% |
| CREDIT_CARD | 161 | 99% | 98% | 86% |
| DATE_OF_BIRTH | 477 | 100% | 99% | 100% |
| EMAIL | 222 | 100% | 100% | 100% |
| ID_NUMBER | 547 | 100% | 100% | 75% |
| IP_ADDRESS | 166 | 100% | 100% | 99% |
| PASSWORD | 13 | 100% | 100% | 23% |
| PERSON | 421 | 99% | 99% | 90% |
| PHONE | 211 | 100% | 100% | 95% |
| SSN | 349 | 99% | 100% | 86% |
| USERNAME | 47 | 100% | 100% | 26% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 86% | 78% | 84% | **0.845** | 71 |
| scrubpii v3 (0.5) | 74% | 67% | 86% | 0.796 | 51 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 50 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 801 | 91% | 81% | 78% |
| API_KEY | 19 | 79% | 84% | 16% |
| CREDIT_CARD | 26 | 85% | 88% | 85% |
| DATE_OF_BIRTH | 52 | 92% | 90% | 94% |
| DRIVER_LICENSE | 30 | 83% | 77% | 93% |
| EMAIL | 292 | 98% | 98% | 99% |
| IBAN | 57 | 68% | 60% | 54% |
| IP_ADDRESS | 73 | 73% | 73% | 99% |
| PASSPORT | 24 | 96% | 88% | 100% |
| PASSWORD | 33 | 88% | 67% | 39% |
| PERSON | 1503 | 80% | 62% | 79% |
| PHONE | 183 | 98% | 98% | 92% |
| SSN | 32 | 84% | 84% | 75% |
| USERNAME | 11 | 100% | 91% | 36% |

## Medical records (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 98% | 98% | 99% | **0.989** | 27 |
| scrubpii v3 (0.5) | 85% | 79% | 99% | 0.913 | 26 |
| Microsoft Presidio | 88% | 78% | 76% | 0.816 | 27 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 248 | 98% | 86% | 64% |
| API_KEY | 2 | 100% | 100% | 0% |
| CREDIT_CARD | 28 | 100% | 96% | 68% |
| DATE_OF_BIRTH | 519 | 100% | 100% | 100% |
| EMAIL | 402 | 99% | 99% | 99% |
| ID_NUMBER | 918 | 99% | 82% | 86% |
| IP_ADDRESS | 5 | 100% | 100% | 100% |
| PASSWORD | 85 | 93% | 53% | 65% |
| PERSON | 1274 | 97% | 72% | 85% |
| PHONE | 365 | 100% | 100% | 94% |
| SSN | 42 | 100% | 100% | 98% |
| USERNAME | 21 | 100% | 76% | 33% |

## Support tickets, emails, transcripts (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 98% | 98% | 100% | **0.987** | 30 |
| scrubpii v3 (0.5) | 78% | 74% | 99% | 0.871 | 30 |
| Microsoft Presidio | 82% | 76% | 75% | 0.783 | 32 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 188 | 90% | 71% | 63% |
| API_KEY | 5 | 100% | 100% | 20% |
| CREDIT_CARD | 127 | 99% | 99% | 72% |
| DATE_OF_BIRTH | 80 | 100% | 100% | 100% |
| EMAIL | 818 | 99% | 99% | 99% |
| ID_NUMBER | 65 | 100% | 80% | 78% |
| IP_ADDRESS | 67 | 100% | 100% | 98% |
| PASSWORD | 204 | 93% | 63% | 53% |
| PERSON | 1723 | 98% | 64% | 83% |
| PHONE | 315 | 100% | 100% | 95% |
| SSN | 51 | 100% | 100% | 100% |
| USERNAME | 352 | 99% | 66% | 52% |

## Logs and config files (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii v5 | 96% | 96% | 97% | **0.969** | 36 |
| scrubpii v3 (0.5) | 81% | 77% | 97% | 0.884 | 36 |
| Microsoft Presidio | 70% | 60% | 74% | 0.717 | 29 |

Caught, by type:

| Type | Items | scrubpii v5 | scrubpii v3 (0.5) | Microsoft Presidio |
|---|---:|---:|---:|---:|
| ADDRESS | 114 | 96% | 69% | 69% |
| API_KEY | 533 | 99% | 96% | 11% |
| CREDIT_CARD | 58 | 97% | 97% | 66% |
| DATE_OF_BIRTH | 25 | 100% | 100% | 100% |
| EMAIL | 447 | 100% | 100% | 100% |
| ID_NUMBER | 102 | 96% | 79% | 79% |
| IP_ADDRESS | 786 | 100% | 100% | 99% |
| PASSWORD | 252 | 97% | 64% | 49% |
| PERSON | 634 | 90% | 53% | 88% |
| PHONE | 157 | 100% | 99% | 94% |
| SSN | 10 | 100% | 100% | 100% |
| USERNAME | 605 | 93% | 62% | 44% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except scrubpii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0).
