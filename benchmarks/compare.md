# scrubpii vs Microsoft Presidio vs spaCy

Run on 2026-11-28 on a GitHub Actions runner (CPU only). Up to 1000 texts per dataset.

**Caught**: share of marked personal-data items that any find touches. **Fully hidden**: share with 90%+ of characters covered. **Was personal**: share of finds that landed on marked personal data. Names given to items don't matter here, only whether the text would be safe to share.

## ai4privacy (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 100% | 100% | 99% | **0.996** | 4 |
| Microsoft Presidio | 74% | 67% | 90% | 0.814 | 6 |
| Presidio + scrubpii plug-in | 100% | 100% | 95% | 0.973 | 14 |
| spaCy (en_core_web_lg) | 52% | 46% | 98% | 0.676 | 5 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 319 | 100% | 66% | 100% | 61% |
| CREDIT_CARD | 13 | 92% | 62% | 100% | 0% |
| DRIVER_LICENSE | 12 | 100% | 67% | 100% | 17% |
| EMAIL | 123 | 100% | 100% | 100% | 0% |
| ID_NUMBER | 109 | 99% | 50% | 100% | 4% |
| PASSPORT | 24 | 96% | 100% | 100% | 4% |
| PERSON | 848 | 100% | 78% | 100% | 76% |
| PHONE | 171 | 100% | 63% | 100% | 2% |
| SSN | 18 | 94% | 100% | 100% | 0% |

## ai4privacy (Spanish)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 99% | 99% | 100% | **0.994** | 5 |
| Microsoft Presidio | 61% | 52% | 65% | 0.629 | 6 |
| Presidio + scrubpii plug-in | 100% | 100% | 92% | 0.956 | 12 |
| spaCy (en_core_web_lg) | 41% | 34% | 52% | 0.461 | 5 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 169 | 99% | 36% | 99% | 32% |
| CREDIT_CARD | 14 | 100% | 64% | 100% | 14% |
| DRIVER_LICENSE | 11 | 100% | 46% | 100% | 18% |
| EMAIL | 58 | 100% | 100% | 100% | 12% |
| ID_NUMBER | 56 | 100% | 70% | 100% | 25% |
| PASSPORT | 26 | 100% | 65% | 100% | 38% |
| PERSON | 365 | 100% | 63% | 100% | 60% |
| PHONE | 79 | 100% | 65% | 100% | 18% |
| SSN | 12 | 67% | 100% | 100% | 25% |

## ai4privacy (French)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 99% | 98% | 100% | **0.992** | 8 |
| Microsoft Presidio | 66% | 58% | 72% | 0.690 | 6 |
| Presidio + scrubpii plug-in | 100% | 99% | 94% | 0.964 | 17 |
| spaCy (en_core_web_lg) | 38% | 33% | 58% | 0.457 | 5 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 111 | 99% | 37% | 99% | 32% |
| CREDIT_CARD | 18 | 94% | 89% | 100% | 0% |
| DRIVER_LICENSE | 11 | 100% | 55% | 100% | 0% |
| EMAIL | 80 | 100% | 100% | 100% | 9% |
| ID_NUMBER | 46 | 100% | 72% | 100% | 6% |
| PASSPORT | 18 | 100% | 56% | 100% | 6% |
| PERSON | 375 | 100% | 65% | 100% | 64% |
| PHONE | 95 | 100% | 66% | 100% | 4% |
| SSN | 12 | 50% | 92% | 100% | 0% |

## ai4privacy (German)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 98% | 97% | 98% | **0.983** | 5 |
| Microsoft Presidio | 75% | 65% | 50% | 0.602 | 6 |
| Presidio + scrubpii plug-in | 98% | 97% | 93% | 0.954 | 12 |
| spaCy (en_core_web_lg) | 47% | 42% | 32% | 0.381 | 5 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 129 | 96% | 58% | 97% | 49% |
| CREDIT_CARD | 13 | 100% | 92% | 100% | 0% |
| DRIVER_LICENSE | 15 | 100% | 93% | 100% | 20% |
| EMAIL | 61 | 100% | 100% | 100% | 5% |
| ID_NUMBER | 73 | 100% | 89% | 100% | 14% |
| PASSPORT | 27 | 100% | 59% | 100% | 7% |
| PERSON | 384 | 98% | 76% | 98% | 74% |
| PHONE | 83 | 100% | 70% | 100% | 12% |
| SSN | 12 | 92% | 42% | 92% | 0% |

## ai4privacy (Italian)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 99% | 98% | 99% | **0.991** | 5 |
| Microsoft Presidio | 68% | 58% | 60% | 0.638 | 5 |
| Presidio + scrubpii plug-in | 99% | 98% | 90% | 0.947 | 12 |
| spaCy (en_core_web_lg) | 42% | 35% | 45% | 0.434 | 5 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 160 | 99% | 52% | 99% | 42% |
| CREDIT_CARD | 8 | 100% | 100% | 100% | 12% |
| DRIVER_LICENSE | 10 | 100% | 100% | 100% | 10% |
| EMAIL | 55 | 100% | 100% | 100% | 9% |
| ID_NUMBER | 59 | 98% | 88% | 100% | 12% |
| PASSPORT | 13 | 100% | 100% | 100% | 15% |
| PERSON | 361 | 99% | 63% | 99% | 62% |
| PHONE | 83 | 99% | 75% | 100% | 8% |
| SSN | 4 | 100% | 25% | 100% | 25% |

## Gretel PII (English)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 99% | 99% | 99% | **0.990** | 9 |
| Microsoft Presidio | 87% | 75% | 83% | 0.852 | 12 |
| Presidio + scrubpii plug-in | 100% | 99% | 89% | 0.940 | 29 |
| spaCy (en_core_web_lg) | 22% | 14% | 85% | 0.356 | 9 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 312 | 99% | 81% | 99% | 75% |
| API_KEY | 7 | 100% | 29% | 100% | 14% |
| CREDIT_CARD | 161 | 99% | 86% | 100% | 0% |
| DATE_OF_BIRTH | 477 | 100% | 100% | 100% | 0% |
| EMAIL | 222 | 100% | 100% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 75% | 100% | 7% |
| IP_ADDRESS | 166 | 99% | 99% | 100% | 2% |
| PASSWORD | 13 | 100% | 23% | 100% | 8% |
| PERSON | 421 | 99% | 90% | 99% | 89% |
| PHONE | 211 | 100% | 95% | 100% | 1% |
| SSN | 349 | 99% | 86% | 100% | 0% |
| USERNAME | 47 | 100% | 26% | 100% | 8% |

## Gretel finance (English, never trained on)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 86% | 78% | 84% | **0.845** | 52 |
| Microsoft Presidio | 81% | 56% | 38% | 0.521 | 53 |
| Presidio + scrubpii plug-in | 88% | 79% | 36% | 0.511 | 107 |
| spaCy (en_core_web_lg) | 55% | 34% | 61% | 0.580 | 45 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 801 | 91% | 78% | 91% | 73% |
| API_KEY | 19 | 79% | 16% | 79% | 0% |
| CREDIT_CARD | 26 | 85% | 85% | 92% | 4% |
| DATE_OF_BIRTH | 52 | 92% | 94% | 94% | 0% |
| DRIVER_LICENSE | 30 | 83% | 93% | 97% | 0% |
| EMAIL | 292 | 98% | 99% | 99% | 0% |
| IBAN | 57 | 67% | 54% | 68% | 4% |
| IP_ADDRESS | 73 | 73% | 99% | 100% | 6% |
| PASSPORT | 24 | 88% | 100% | 100% | 0% |
| PASSWORD | 33 | 88% | 39% | 94% | 3% |
| PERSON | 1503 | 80% | 79% | 82% | 76% |
| PHONE | 183 | 98% | 92% | 99% | 0% |
| SSN | 32 | 84% | 75% | 97% | 0% |
| USERNAME | 11 | 100% | 36% | 100% | 9% |

## Medical records (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 98% | 98% | 99% | **0.989** | 26 |
| Microsoft Presidio | 88% | 78% | 76% | 0.816 | 30 |
| Presidio + scrubpii plug-in | 99% | 98% | 80% | 0.886 | 64 |
| spaCy (en_core_web_lg) | 32% | 30% | 94% | 0.474 | 26 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 248 | 99% | 64% | 99% | 52% |
| API_KEY | 2 | 100% | 0% | 100% | 0% |
| CREDIT_CARD | 28 | 100% | 68% | 100% | 0% |
| DATE_OF_BIRTH | 519 | 100% | 100% | 100% | 0% |
| EMAIL | 402 | 99% | 99% | 99% | 1% |
| ID_NUMBER | 918 | 99% | 86% | 100% | 2% |
| IP_ADDRESS | 5 | 100% | 100% | 100% | 0% |
| PASSWORD | 85 | 92% | 65% | 95% | 6% |
| PERSON | 1274 | 97% | 85% | 97% | 84% |
| PHONE | 365 | 100% | 94% | 100% | 0% |
| SSN | 42 | 100% | 98% | 100% | 0% |
| USERNAME | 21 | 100% | 33% | 100% | 14% |

## Support tickets, emails, transcripts (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 98% | 98% | 100% | **0.987** | 32 |
| Microsoft Presidio | 82% | 76% | 75% | 0.783 | 36 |
| Presidio + scrubpii plug-in | 98% | 98% | 78% | 0.869 | 69 |
| spaCy (en_core_web_lg) | 40% | 39% | 97% | 0.568 | 32 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 188 | 90% | 63% | 90% | 56% |
| API_KEY | 5 | 100% | 20% | 100% | 20% |
| CREDIT_CARD | 127 | 99% | 72% | 99% | 0% |
| DATE_OF_BIRTH | 80 | 100% | 100% | 100% | 0% |
| EMAIL | 818 | 99% | 99% | 99% | 1% |
| ID_NUMBER | 65 | 100% | 78% | 100% | 5% |
| IP_ADDRESS | 67 | 100% | 98% | 100% | 0% |
| PASSWORD | 204 | 93% | 53% | 93% | 4% |
| PERSON | 1723 | 98% | 83% | 98% | 82% |
| PHONE | 315 | 100% | 95% | 100% | 1% |
| SSN | 51 | 100% | 100% | 100% | 0% |
| USERNAME | 352 | 99% | 52% | 99% | 19% |

## Logs and config files (Nemotron-PII test split)

| System | Caught | Fully hidden | Was personal | F1 | ms/text |
|---|---:|---:|---:|---:|---:|
| scrubpii | 96% | 96% | 97% | **0.968** | 38 |
| Microsoft Presidio | 70% | 60% | 74% | 0.717 | 32 |
| Presidio + scrubpii plug-in | 98% | 97% | 78% | 0.869 | 72 |
| spaCy (en_core_web_lg) | 19% | 18% | 88% | 0.313 | 28 |

Caught, by type:

| Type | Items | scrubpii | Microsoft Presidio | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ADDRESS | 114 | 96% | 69% | 96% | 64% |
| API_KEY | 533 | 99% | 11% | 99% | 2% |
| CREDIT_CARD | 58 | 98% | 66% | 98% | 0% |
| DATE_OF_BIRTH | 25 | 100% | 100% | 100% | 0% |
| EMAIL | 447 | 100% | 100% | 100% | 2% |
| ID_NUMBER | 102 | 96% | 79% | 100% | 1% |
| IP_ADDRESS | 786 | 100% | 99% | 100% | 1% |
| PASSWORD | 252 | 97% | 49% | 98% | 4% |
| PERSON | 634 | 89% | 88% | 92% | 84% |
| PHONE | 157 | 100% | 94% | 100% | 0% |
| SSN | 10 | 100% | 100% | 100% | 0% |
| USERNAME | 605 | 93% | 44% | 98% | 11% |

Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). On Spanish text every system uses its English setup except scrubpii, which trains on Spanish too.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0).
