# Changelog

## 0.6.0
- New model, pii-distilbert-v5: trained on more data (NVIDIA Nemotron-PII; French, German and Italian from
  ai4privacy). It now reads five languages and catches far more lone first names and health ID numbers:
  F1 on unseen finance documents 0.80 -> 0.85, German 0.79 -> 0.98, medical records 0.91 -> 0.99.
- `SCRUBPII_MODEL` picks the model (a Hugging Face repo or a local folder).
- SSNs written with dots (123.45.6789) are now caught by the SSN rule too, as Presidio does.
- Presidio plug-in: `scrubpii.presidio.add_to(AnalyzerEngine())` adds scrubpii as a Presidio recognizer, with
  Presidio's entity names (`pip install "scrubpii[presidio]"`). `replace_ner=True` drops Presidio's spaCy names.
- US health identifiers found by rule: NPI numbers (after "NPI", with a valid check digit), Medicare
  Beneficiary Identifiers (MBI format) and DEA registration numbers (with a valid check digit), as ID_NUMBER.

## 0.5.0
- Rules in plain English: `teach("redact any ###-#####-##-RC as an RC code")`. Shapes (`#` digit, `@` letter,
  `?` letter or digit, `*` a run), examples ("codes like AB-1234"), "N digit numbers", "starting with",
  "ending with", word lists, "after ..." for nearby words, and "never redact ..." to keep values visible.
  Read offline by simple grammar, no AI model. `understand()` shows how a rule is read.
- `add_rule()` also takes a plain-English sentence; the CLI takes `--rule`, and rules files take `"say"`.

## 0.4.0
- Runs on ONNX Runtime by default: no PyTorch or transformers needed. Installs far smaller and starts much
  faster, and the model download is the 66 MB 8-bit ONNX file instead of 260 MB.
- The model loads on first use and is kept for the process, one copy per model.
- `SCRUBPII_BACKEND=torch` (with `pip install "scrubpii[torch]"`) uses the PyTorch model as before.
  `SCRUBPII_THREADS` sets how many CPU threads ONNX Runtime uses.
- Passwords stop at a comma or a closing full stop, not just at a space.
- Your own rules: `add_rule`, `add_words`, `allow`, `load_rules` and `--rules` add patterns (employee IDs,
  client names ...) without retraining, and keep chosen values visible.
- Every item now has `confidence` (high/medium/low), `source` (model, rule, model+rule, custom) and `reason`.
- `audit()` and `audit_markdown()` (also `scrubpii --audit` and `POST /audit`) explain each decision, including
  what was left visible and why. Reports hold no personal data unless `include_values=True`.
- More phone numbers: international numbers with a +country code, numbers written like `(123) 456-7890` or
  `1-800-123-4567`, and any phone-shaped number right after "phone", "call", "contact" and similar words.

## 0.3.0
- Renamed from `chad-pii` to `scrubpii` (import `scrubpii`, command `scrubpii`). `pip install chad-pii`
  still works: it installs scrubpii and keeps `import chad_pii` and the `chad-pii` command working.
- Uses the v3 model (ChadTollison/pii-distilbert-v3, 15 types) by default.

## 0.2.0 (as chad-pii)
- `find_many` and `redact_many` run the model over batches.
- `redact_json`, `redact_csv` and `redact_dataframe` for structured data, each in one batched pass.
- `Guard` keeps personal data out of LLM prompts: it scrubs to tokens, restores replies, keeps one key per
  conversation, and works as a wrapper or as LangChain runnables.
- `scrubpii serve`: a local HTTP API (FastAPI) with `/redact`, `/find` and `/restore`. Install with `scrubpii[server]`.
- The command line redacts `.csv`, `.json`, `.jsonl` and text files.
- `tokenize()` can reuse an existing key.
- A failed check (Luhn, SSN format ...) no longer drops an item the model is 95%+ sure of: hiding beats leaking.
- Card numbers that pass Luhn and well-formed SSNs (also `123 45 6789`, or 9 digits right after "SSN") are found
  by rule even when the model misses them.
- Email addresses and IPv4/IPv6 addresses are found by rule too, and dates of birth right after "born", "DOB" or
  "date of birth".
- Long text is read in 128-token windows (`SCRUBPII_WINDOW` changes it): far more found in long documents.
- Fake values for address, ID number, date of birth, username and password.

## 0.1.0 (as chad-pii)
- First release: `redact`, `find`, `tokenize`, `restore`, the `scrubpii` command, label, mask, fake and token modes.
- Luhn, IBAN and SSN checks, the area-code phone rule and API key formats.
