# Changelog

## 0.3.0
- Renamed from `chad-pii` to `piiguard` (import `piiguard`, command `piiguard`). `pip install chad-pii`
  still works: it installs piiguard and keeps `import chad_pii` and the `chad-pii` command working.
- Uses the v3 model (ChadTollison/pii-distilbert-v3, 15 types) by default.

## 0.2.0 (as chad-pii)
- `find_many` and `redact_many` run the model over batches.
- `redact_json`, `redact_csv` and `redact_dataframe` for structured data, each in one batched pass.
- `Guard` keeps personal data out of LLM prompts: it scrubs to tokens, restores replies, keeps one key per
  conversation, and works as a wrapper or as LangChain runnables.
- `piiguard serve`: a local HTTP API (FastAPI) with `/redact`, `/find` and `/restore`. Install with `piiguard[server]`.
- The command line redacts `.csv`, `.json`, `.jsonl` and text files.
- `tokenize()` can reuse an existing key.
- A failed check (Luhn, SSN format ...) no longer drops an item the model is 95%+ sure of: hiding beats leaking.
- Card numbers that pass Luhn and well-formed SSNs (also `123 45 6789`, or 9 digits right after "SSN") are found
  by rule even when the model misses them.
- Email addresses and IPv4/IPv6 addresses are found by rule too, and dates of birth right after "born", "DOB" or
  "date of birth".
- Long text is read in 128-token windows (`PIIGUARD_WINDOW` changes it): far more found in long documents.
- Fake values for address, ID number, date of birth, username and password.

## 0.1.0 (as chad-pii)
- First release: `redact`, `find`, `tokenize`, `restore`, the `piiguard` command, label, mask, fake and token modes.
- Luhn, IBAN and SSN checks, the area-code phone rule and API key formats.
