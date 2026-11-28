# scrubpii vs Microsoft Presidio vs spaCy

Run on 2026-11-28 on a GitHub Actions runner (CPU only), scorer `training/compare.py` at commit `d2447b5`. Up to 1000 texts per dataset (half that for the four non-English sets).

**How to read this.** The headline is strict: **Fully hidden** is the share of marked personal-data items with at least 90% of their characters redacted, **Char precision** is the share of redacted characters that were marked personal data, and **Strict F1** combines the two. **Caught** and **Touch F1** count a find that touches an item by even one character, so a detector that marks one letter of every email would score 1.0 there; they are shown only for comparison with older reports. Names given to items don't matter, only whether the text would be safe to share.

## Summary (strict F1)

| Dataset | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|
| ai4privacy (English) | **0.987** | 0.761 | 0.736 | 0.963 | 0.624 |
| ai4privacy (Spanish) | **0.984** | 0.477 | 0.794 | 0.945 | 0.347 |
| ai4privacy (French) | **0.986** | 0.549 | 0.740 | 0.956 | 0.357 |
| ai4privacy (German) | **0.971** | 0.467 | 0.748 | 0.935 | 0.310 |
| ai4privacy (Italian) | **0.982** | 0.480 | 0.786 | 0.933 | 0.329 |
| Gretel PII (English) | **0.989** | 0.777 | 0.777 | 0.930 | 0.244 |
| Gretel finance (English, never trained on) | **0.820** | 0.482 | 0.473 | 0.565 | 0.436 |
| Medical records (Nemotron-PII test split) | **0.988** | 0.740 | 0.739 | 0.850 | 0.449 |
| Support tickets, emails, transcripts (Nemotron-PII test split) | **0.985** | 0.751 | 0.750 | 0.868 | 0.550 |
| Logs and config files (Nemotron-PII test split) | **0.967** | 0.656 | 0.655 | 0.879 | 0.298 |

## ai4privacy (English)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 98.0% | 99.5% | **0.987** | 98.2% | 0.988 | 6 |
| Microsoft Presidio (English setup) | 66.8% | 88.5% | 0.761 | 74.0% | 0.814 | 7 |
| Microsoft Presidio (each language's own setup) | 63.3% | 88.0% | 0.736 | 69.2% | 0.783 | 7 |
| Presidio + scrubpii plug-in | 98.2% | 94.5% | 0.963 | 98.5% | 0.966 | 18 |
| spaCy (en_core_web_lg) | 46.2% | 96.3% | 0.624 | 51.7% | 0.676 | 6 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 319 | 92% | 45% | 28% | 92% | 40% |
| CREDIT_CARD | 13 | 92% | 62% | 62% | 100% | 0% |
| DRIVER_LICENSE | 12 | 100% | 50% | 50% | 100% | 17% |
| EMAIL | 123 | 100% | 100% | 100% | 100% | 0% |
| ID_NUMBER | 109 | 99% | 50% | 50% | 100% | 4% |
| PASSPORT | 24 | 96% | 100% | 100% | 100% | 4% |
| PERSON | 848 | 100% | 75% | 74% | 100% | 73% |
| PHONE | 171 | 100% | 48% | 48% | 100% | 2% |
| SSN | 18 | 94% | 100% | 100% | 100% | 0% |

## ai4privacy (Spanish)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 97.3% | 99.5% | **0.984** | 97.6% | 0.986 | 9 |
| Microsoft Presidio (English setup) | 51.5% | 44.4% | 0.477 | 60.8% | 0.629 | 7 |
| Microsoft Presidio (each language's own setup) | 67.6% | 96.2% | 0.794 | 75.2% | 0.848 | 6 |
| Presidio + scrubpii plug-in | 97.8% | 91.3% | 0.945 | 98.1% | 0.947 | 20 |
| spaCy (en_core_web_lg) | 34.1% | 35.4% | 0.347 | 41.3% | 0.461 | 6 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 169 | 91% | 17% | 60% | 91% | 16% |
| CREDIT_CARD | 14 | 100% | 64% | 50% | 100% | 14% |
| DRIVER_LICENSE | 11 | 100% | 46% | 46% | 100% | 18% |
| EMAIL | 58 | 100% | 100% | 98% | 100% | 10% |
| ID_NUMBER | 56 | 100% | 70% | 43% | 100% | 25% |
| PASSPORT | 26 | 100% | 65% | 81% | 100% | 38% |
| PERSON | 365 | 100% | 55% | 77% | 100% | 53% |
| PHONE | 79 | 100% | 46% | 32% | 100% | 13% |
| SSN | 12 | 67% | 100% | 100% | 100% | 25% |

## ai4privacy (French)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 97.5% | 99.7% | **0.986** | 97.9% | 0.988 | 10 |
| Microsoft Presidio (English setup) | 57.7% | 52.4% | 0.549 | 65.8% | 0.690 | 7 |
| Microsoft Presidio (each language's own setup) | 60.6% | 94.9% | 0.740 | 71.5% | 0.825 | 8 |
| Presidio + scrubpii plug-in | 98.4% | 92.9% | 0.956 | 98.8% | 0.960 | 21 |
| spaCy (en_core_web_lg) | 33.4% | 38.4% | 0.357 | 37.9% | 0.457 | 6 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 111 | 92% | 16% | 55% | 92% | 14% |
| CREDIT_CARD | 18 | 94% | 89% | 72% | 100% | 0% |
| DRIVER_LICENSE | 11 | 100% | 18% | 36% | 100% | 0% |
| EMAIL | 80 | 100% | 100% | 100% | 100% | 9% |
| ID_NUMBER | 46 | 100% | 65% | 72% | 100% | 6% |
| PASSPORT | 18 | 100% | 56% | 56% | 100% | 6% |
| PERSON | 375 | 99% | 62% | 59% | 99% | 61% |
| PHONE | 95 | 100% | 45% | 38% | 100% | 1% |
| SSN | 12 | 50% | 83% | 50% | 100% | 0% |

## ai4privacy (German)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 96.1% | 98.1% | **0.971** | 97.0% | 0.977 | 9 |
| Microsoft Presidio (English setup) | 65.2% | 36.3% | 0.467 | 75.0% | 0.602 | 7 |
| Microsoft Presidio (each language's own setup) | 66.0% | 86.4% | 0.748 | 74.2% | 0.834 | 6 |
| Presidio + scrubpii plug-in | 96.2% | 91.0% | 0.935 | 97.1% | 0.947 | 20 |
| spaCy (en_core_web_lg) | 41.7% | 24.7% | 0.310 | 47.2% | 0.381 | 6 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 129 | 88% | 40% | 47% | 88% | 36% |
| CREDIT_CARD | 13 | 100% | 92% | 69% | 100% | 0% |
| DRIVER_LICENSE | 15 | 100% | 67% | 67% | 100% | 13% |
| EMAIL | 61 | 100% | 98% | 97% | 100% | 5% |
| ID_NUMBER | 73 | 100% | 85% | 84% | 100% | 14% |
| PASSPORT | 27 | 100% | 59% | 59% | 100% | 7% |
| PERSON | 384 | 96% | 70% | 71% | 96% | 69% |
| PHONE | 83 | 100% | 48% | 45% | 100% | 5% |
| SSN | 12 | 92% | 0% | 0% | 92% | 0% |

## ai4privacy (Italian)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 97.3% | 99.1% | **0.982** | 97.9% | 0.985 | 9 |
| Microsoft Presidio (English setup) | 58.0% | 40.9% | 0.480 | 68.3% | 0.638 | 7 |
| Microsoft Presidio (each language's own setup) | 67.2% | 94.6% | 0.786 | 75.8% | 0.846 | 6 |
| Presidio + scrubpii plug-in | 97.5% | 89.5% | 0.933 | 98.1% | 0.940 | 20 |
| spaCy (en_core_web_lg) | 35.2% | 30.9% | 0.329 | 42.0% | 0.434 | 6 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 160 | 92% | 32% | 56% | 92% | 25% |
| CREDIT_CARD | 8 | 100% | 100% | 88% | 100% | 12% |
| DRIVER_LICENSE | 10 | 100% | 100% | 100% | 100% | 10% |
| EMAIL | 55 | 100% | 100% | 100% | 100% | 9% |
| ID_NUMBER | 59 | 98% | 83% | 61% | 100% | 10% |
| PASSPORT | 13 | 100% | 100% | 100% | 100% | 15% |
| PERSON | 361 | 98% | 57% | 72% | 98% | 56% |
| PHONE | 83 | 99% | 52% | 41% | 99% | 7% |
| SSN | 4 | 100% | 25% | 25% | 100% | 25% |

## Gretel PII (English)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 99.2% | 98.7% | **0.989** | 99.4% | 0.989 | 15 |
| Microsoft Presidio (English setup) | 75.0% | 80.5% | 0.777 | 87.2% | 0.852 | 13 |
| Microsoft Presidio (each language's own setup) | 74.9% | 80.6% | 0.777 | 86.9% | 0.851 | 13 |
| Presidio + scrubpii plug-in | 99.4% | 87.4% | 0.930 | 99.7% | 0.939 | 36 |
| spaCy (en_core_web_lg) | 14.2% | 86.7% | 0.244 | 22.5% | 0.356 | 11 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 312 | 99% | 7% | 6% | 99% | 5% |
| API_KEY | 7 | 100% | 14% | 14% | 100% | 14% |
| CREDIT_CARD | 161 | 98% | 68% | 68% | 99% | 0% |
| DATE_OF_BIRTH | 477 | 100% | 100% | 100% | 100% | 0% |
| EMAIL | 222 | 100% | 100% | 100% | 100% | 0% |
| ID_NUMBER | 547 | 100% | 71% | 71% | 100% | 7% |
| IP_ADDRESS | 166 | 99% | 98% | 98% | 99% | 1% |
| PASSWORD | 13 | 100% | 8% | 8% | 100% | 8% |
| PERSON | 421 | 98% | 84% | 84% | 98% | 84% |
| PHONE | 211 | 100% | 84% | 84% | 100% | 1% |
| SSN | 349 | 99% | 79% | 79% | 100% | 0% |
| USERNAME | 47 | 100% | 21% | 21% | 100% | 8% |

## Gretel finance (English, never trained on)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 79.9% | 84.1% | **0.820** | 87.6% | 0.864 | 96 |
| Microsoft Presidio (English setup) | 56.4% | 42.1% | 0.482 | 80.8% | 0.521 | 59 |
| Microsoft Presidio (each language's own setup) | 55.1% | 41.5% | 0.473 | 79.0% | 0.513 | 59 |
| Presidio + scrubpii plug-in | 81.0% | 43.4% | 0.565 | 89.2% | 0.515 | 166 |
| spaCy (en_core_web_lg) | 34.0% | 60.6% | 0.436 | 55.2% | 0.580 | 50 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 801 | 73% | 6% | 3% | 73% | 4% |
| API_KEY | 19 | 79% | 0% | 0% | 79% | 0% |
| CREDIT_CARD | 26 | 85% | 58% | 58% | 85% | 4% |
| DATE_OF_BIRTH | 52 | 92% | 92% | 92% | 94% | 0% |
| DRIVER_LICENSE | 30 | 80% | 53% | 53% | 87% | 0% |
| EMAIL | 292 | 98% | 98% | 98% | 98% | 0% |
| IBAN | 57 | 63% | 47% | 47% | 63% | 4% |
| IP_ADDRESS | 73 | 99% | 99% | 99% | 100% | 1% |
| PASSPORT | 24 | 88% | 100% | 100% | 100% | 0% |
| PASSWORD | 33 | 88% | 33% | 33% | 94% | 3% |
| PERSON | 1503 | 77% | 71% | 69% | 78% | 68% |
| PHONE | 183 | 97% | 73% | 73% | 98% | 0% |
| SSN | 32 | 84% | 75% | 75% | 97% | 0% |
| USERNAME | 11 | 100% | 27% | 27% | 100% | 9% |

## Medical records (Nemotron-PII test split)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 98.4% | 99.3% | **0.988** | 98.7% | 0.990 | 49 |
| Microsoft Presidio (English setup) | 78.1% | 70.3% | 0.740 | 87.6% | 0.816 | 33 |
| Microsoft Presidio (each language's own setup) | 77.9% | 70.3% | 0.739 | 87.2% | 0.815 | 33 |
| Presidio + scrubpii plug-in | 98.6% | 74.7% | 0.850 | 98.9% | 0.887 | 96 |
| spaCy (en_core_web_lg) | 30.1% | 88.4% | 0.449 | 31.7% | 0.474 | 29 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 248 | 98% | 38% | 36% | 98% | 29% |
| API_KEY | 2 | 100% | 0% | 0% | 100% | 0% |
| CREDIT_CARD | 28 | 100% | 32% | 32% | 100% | 0% |
| DATE_OF_BIRTH | 519 | 100% | 100% | 100% | 100% | 0% |
| EMAIL | 402 | 99% | 99% | 99% | 99% | 1% |
| ID_NUMBER | 918 | 99% | 57% | 57% | 100% | 2% |
| IP_ADDRESS | 5 | 100% | 100% | 100% | 100% | 0% |
| PASSWORD | 85 | 92% | 53% | 53% | 95% | 6% |
| PERSON | 1274 | 97% | 85% | 85% | 97% | 84% |
| PHONE | 365 | 100% | 93% | 93% | 100% | 0% |
| SSN | 42 | 100% | 98% | 98% | 100% | 0% |
| USERNAME | 21 | 100% | 14% | 14% | 100% | 5% |

## Support tickets, emails, transcripts (Nemotron-PII test split)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 97.7% | 99.2% | **0.985** | 98.1% | 0.987 | 58 |
| Microsoft Presidio (English setup) | 76.2% | 74.0% | 0.751 | 82.3% | 0.783 | 39 |
| Microsoft Presidio (each language's own setup) | 76.0% | 74.0% | 0.750 | 81.9% | 0.781 | 39 |
| Presidio + scrubpii plug-in | 97.7% | 78.1% | 0.868 | 98.1% | 0.870 | 111 |
| spaCy (en_core_web_lg) | 39.0% | 93.1% | 0.550 | 40.2% | 0.568 | 34 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 188 | 89% | 46% | 43% | 89% | 40% |
| API_KEY | 5 | 100% | 20% | 0% | 100% | 20% |
| CREDIT_CARD | 127 | 99% | 36% | 36% | 99% | 0% |
| DATE_OF_BIRTH | 80 | 100% | 100% | 100% | 100% | 0% |
| EMAIL | 818 | 99% | 99% | 99% | 99% | 1% |
| ID_NUMBER | 65 | 100% | 40% | 40% | 100% | 2% |
| IP_ADDRESS | 67 | 100% | 87% | 87% | 100% | 0% |
| PASSWORD | 204 | 93% | 37% | 37% | 93% | 4% |
| PERSON | 1723 | 98% | 82% | 82% | 98% | 81% |
| PHONE | 315 | 100% | 94% | 94% | 100% | 0% |
| SSN | 51 | 100% | 100% | 100% | 100% | 0% |
| USERNAME | 352 | 98% | 29% | 29% | 98% | 18% |

## Logs and config files (Nemotron-PII test split)

| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |
|---|---:|---:|---:|---:|---:|---:|
| scrubpii | 96.0% | 97.5% | **0.967** | 97.1% | 0.968 | 68 |
| Microsoft Presidio (English setup) | 59.6% | 72.9% | 0.656 | 70.0% | 0.717 | 35 |
| Microsoft Presidio (each language's own setup) | 59.4% | 73.0% | 0.655 | 69.8% | 0.717 | 35 |
| Presidio + scrubpii plug-in | 97.6% | 79.9% | 0.879 | 98.4% | 0.871 | 117 |
| spaCy (en_core_web_lg) | 18.2% | 82.6% | 0.298 | 19.0% | 0.313 | 30 |

Fully hidden, by type:

| Type | Items | scrubpii | Microsoft Presidio (English setup) | Microsoft Presidio (each language's own setup) | Presidio + scrubpii plug-in | spaCy (en_core_web_lg) |
|---|---:|---:|---:|---:|---:|---:|
| ADDRESS | 114 | 96% | 47% | 40% | 96% | 41% |
| API_KEY | 533 | 98% | 2% | 2% | 98% | 2% |
| CREDIT_CARD | 58 | 98% | 22% | 22% | 98% | 0% |
| DATE_OF_BIRTH | 25 | 100% | 100% | 100% | 100% | 0% |
| EMAIL | 447 | 100% | 99% | 99% | 100% | 2% |
| ID_NUMBER | 102 | 96% | 50% | 50% | 97% | 0% |
| IP_ADDRESS | 786 | 100% | 83% | 83% | 100% | 0% |
| PASSWORD | 252 | 98% | 26% | 26% | 98% | 4% |
| PERSON | 634 | 90% | 87% | 87% | 92% | 84% |
| PHONE | 157 | 100% | 94% | 94% | 100% | 0% |
| SSN | 10 | 100% | 100% | 100% | 100% | 0% |
| USERNAME | 605 | 91% | 31% | 31% | 98% | 11% |

**Setups.** *Microsoft Presidio (English setup)* is Presidio's default: spaCy en_core_web_lg and every recognizer, run with language="en" on every set, including the Spanish, French, German and Italian ones. *Microsoft Presidio (each language's own setup)* gives Presidio that language's large spaCy model and copies of its pattern recognizers (email, card, IP, IBAN, phone, SSN, passport, license) for each language, which is the fairest multilingual setup we know. scrubpii is one model for every language. spaCy alone is shown as a floor.

**Limits.** scrubpii trains on the *train* splits of ai4privacy and Gretel PII, never on these test rows; Gretel finance and the three Nemotron sets are never trained on. Labels in public datasets are imperfect, so small differences (under a point) are noise.

Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0).
