# Benchmark: ai4privacy/pii-masking-200k

2000 English texts picked at random from [ai4privacy/pii-masking-200k](https://huggingface.co/datasets/ai4privacy/pii-masking-200k), a public dataset this model was never trained on. Run on 2026-11-27.

**Overlap** counts a find that touches the marked item (what matters for redaction). **Exact** needs the same characters.

## Published model (Hugging Face)

| Type | Items | Found (recall) | Right (precision) | Overlap F1 | Exact F1 |
|---|---:|---:|---:|---:|---:|
| PERSON | 793 | 88% | 33% | 0.484 | 0.334 |
| EMAIL | 189 | 100% | 33% | 0.495 | 0.176 |
| PHONE | 106 | 78% | 18% | 0.299 | 0.259 |
| SSN | 100 | 41% | 18% | 0.250 | 0.180 |
| CREDIT_CARD | 121 | 31% | 30% | 0.302 | 0.294 |
| IP_ADDRESS | 295 | 51% | 64% | 0.567 | 0.493 |
| **All six** | 1604 | 75% | 32% | 0.451 | 0.307 |

## In-browser model (this site)

| Type | Items | Found (recall) | Right (precision) | Overlap F1 | Exact F1 |
|---|---:|---:|---:|---:|---:|
| PERSON | 793 | 93% | 27% | 0.418 | 0.184 |
| EMAIL | 189 | 100% | 10% | 0.184 | 0.085 |
| PHONE | 106 | 80% | 15% | 0.259 | 0.173 |
| SSN | 100 | 52% | 3% | 0.052 | 0.042 |
| CREDIT_CARD | 121 | 60% | 34% | 0.429 | 0.423 |
| IP_ADDRESS | 295 | 50% | 50% | 0.503 | 0.440 |
| **All six** | 1604 | 80% | 17% | 0.279 | 0.155 |

Dataset labels used: CREDITCARDNUMBER, EMAIL, FIRSTNAME, IP, IPV4, IPV6, LASTNAME, MIDDLENAME, PHONENUMBER, SSN.

Labels ignored (this model doesn't look for them): ACCOUNTNAME, ACCOUNTNUMBER, AGE, AMOUNT, BIC, BITCOINADDRESS, BUILDINGNUMBER, CITY, COMPANYNAME, COUNTY, CREDITCARDCVV, CREDITCARDISSUER, CURRENCY, CURRENCYCODE, CURRENCYNAME, CURRENCYSYMBOL, DATE, DOB, ETHEREUMADDRESS, EYECOLOR, GENDER, HEIGHT, IBAN, JOBAREA, JOBTITLE, JOBTYPE, LITECOINADDRESS, MAC, MASKEDNUMBER, NEARBYGPSCOORDINATE, ORDINALDIRECTION, PASSWORD, PHONEIMEI, PIN, PREFIX, SECONDARYADDRESS, SEX, STATE, STREET, TIME, URL, USERAGENT, USERNAME, VEHICLEVIN, VEHICLEVRM, ZIPCODE.
