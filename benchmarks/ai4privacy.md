# Benchmark: ai4privacy/pii-masking-200k

2000 English texts picked at random from [ai4privacy/pii-masking-200k](https://huggingface.co/datasets/ai4privacy/pii-masking-200k), a public dataset this model was never trained on. Run on 2026-11-27.

**Overlap** counts a find that touches the marked item (what matters for redaction). **Exact** needs the same characters. **Was personal data** is the share of the model's finds that landed on anything the dataset marks as personal, including types this model has no label for (a username flagged as a name still hides personal data).

## Published model (Hugging Face)

| Type | Items | Found (recall) | Right type (precision) | Was personal data | Overlap F1 | Exact F1 |
|---|---:|---:|---:|---:|---:|---:|
| PERSON | 793 | 88% | 33% | 95% | 0.484 | 0.334 |
| EMAIL | 189 | 100% | 33% | 99% | 0.495 | 0.176 |
| PHONE | 106 | 78% | 18% | 98% | 0.299 | 0.259 |
| SSN | 100 | 41% | 18% | 97% | 0.250 | 0.180 |
| CREDIT_CARD | 121 | 31% | 30% | 100% | 0.302 | 0.294 |
| IP_ADDRESS | 295 | 51% | 64% | 100% | 0.567 | 0.493 |
| PASSPORT | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| DRIVER_LICENSE | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| API_KEY | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| IBAN | 94 | 0% | 0% | 0% | 0.000 | 0.000 |
| **All types** | 1698 | 71% | 32% | 97% | 0.443 | 0.302 |

## In-browser model (this site)

| Type | Items | Found (recall) | Right type (precision) | Was personal data | Overlap F1 | Exact F1 |
|---|---:|---:|---:|---:|---:|---:|
| PERSON | 793 | 87% | 34% | 95% | 0.484 | 0.327 |
| EMAIL | 189 | 100% | 38% | 99% | 0.551 | 0.191 |
| PHONE | 106 | 78% | 20% | 99% | 0.320 | 0.255 |
| SSN | 100 | 37% | 17% | 97% | 0.229 | 0.188 |
| CREDIT_CARD | 121 | 31% | 36% | 100% | 0.329 | 0.320 |
| IP_ADDRESS | 295 | 50% | 65% | 100% | 0.568 | 0.505 |
| PASSPORT | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| DRIVER_LICENSE | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| API_KEY | 0 | 0% | 0% | 0% | 0.000 | 0.000 |
| IBAN | 94 | 0% | 0% | 0% | 0.000 | 0.000 |
| **All types** | 1698 | 70% | 34% | 97% | 0.453 | 0.304 |

Dataset labels used: CREDITCARDNUMBER, EMAIL, FIRSTNAME, IBAN, IP, IPV4, IPV6, LASTNAME, MIDDLENAME, PHONENUMBER, SSN.

Labels ignored (this model doesn't look for them): ACCOUNTNAME, ACCOUNTNUMBER, AGE, AMOUNT, BIC, BITCOINADDRESS, BUILDINGNUMBER, CITY, COMPANYNAME, COUNTY, CREDITCARDCVV, CREDITCARDISSUER, CURRENCY, CURRENCYCODE, CURRENCYNAME, CURRENCYSYMBOL, DATE, DOB, ETHEREUMADDRESS, EYECOLOR, GENDER, HEIGHT, JOBAREA, JOBTITLE, JOBTYPE, LITECOINADDRESS, MAC, MASKEDNUMBER, NEARBYGPSCOORDINATE, ORDINALDIRECTION, PASSWORD, PHONEIMEI, PIN, PREFIX, SECONDARYADDRESS, SEX, STATE, STREET, TIME, URL, USERAGENT, USERNAME, VEHICLEVIN, VEHICLEVRM, ZIPCODE.
