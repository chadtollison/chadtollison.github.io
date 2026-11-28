"""Head-to-head: scrubpii vs Microsoft Presidio vs spaCy on public PII datasets.

The question for a redactor is "would this text be safe to share after
redaction?", so the scores ignore what *name* each system gives an item.

Headline (strict) scores:
  Fully hidden   share of items with at least 90% of their characters covered
                 (a find that covers half a card number still leaks it)
  Char precision share of redacted characters that were marked personal data
                 (so redacting whole paragraphs does not score well)
  Strict F1      of Fully hidden and Char precision
Secondary (lenient) scores, kept for comparison with older reports:
  Caught         share of items that any find touches, even by one character
  Was personal   share of finds that touch marked personal data
  Touch F1       of Caught and Was personal. A detector that marks one character
                 of every item scores 1.0 here, which is why it is not the headline.
  ms/text        average time per text on the same CPU

Per-type "Caught" is reported too. Datasets:
  * ai4privacy open-pii-masking-500k, validation split, English, Spanish, French, German and Italian
  * gretel-pii-masking-en-v1, test split
  * gretel synthetic_pii_finance_multilingual, English test split: scrubpii
    never trains on this one, so it is the fairest outside test.
scrubpii v3 trains on the *train* splits of the first two (never on these rows).

  python training/compare.py --system scrubpii:build/v3 --system scrubpii:ChadTollison/pii-distilbert-v2 \
      --system presidio --system spacy --rows 1000
"""
import argparse
import json
import time
from datetime import date
from pathlib import Path

import pii_data

OUT = Path(__file__).resolve().parent.parent / "benchmarks"

PRESIDIO_MAP = {"PERSON": "PERSON", "EMAIL_ADDRESS": "EMAIL", "PHONE_NUMBER": "PHONE", "US_SSN": "SSN",
                "CREDIT_CARD": "CREDIT_CARD", "IP_ADDRESS": "IP_ADDRESS", "IBAN_CODE": "IBAN",
                "US_PASSPORT": "PASSPORT", "US_DRIVER_LICENSE": "DRIVER_LICENSE", "LOCATION": "ADDRESS",
                "US_ITIN": "ID_NUMBER", "US_BANK_NUMBER": "ID_NUMBER", "UK_NHS": "ID_NUMBER", "MEDICAL_LICENSE": "ID_NUMBER"}
SPACY_MAP = {"PERSON": "PERSON", "GPE": "ADDRESS", "LOC": "ADDRESS", "FAC": "ADDRESS"}


def make_system(spec):
    """Return (display name, fn(text) -> [(start, end, type)])."""
    if spec.startswith("scrubpii"):
        import os
        import scrubpii
        head, _, model = spec.partition(":")
        backend = head.partition("@")[2]           # scrubpii@onnx / scrubpii@torch / scrubpii (default)
        model, _, named = (model or scrubpii.MODEL_ID).partition("=")
        label = named if named else "scrubpii v3" if "v3" in model else "scrubpii v2 (current)" if "pii-distilbert-v2" in model else f"scrubpii ({model})"

        def run(t, lang="en"):
            if backend:
                os.environ["SCRUBPII_BACKEND"] = backend
            return [(e.start, e.end, e.type) for e in scrubpii.find(t, model=model)]
        run("warm up")
        return label, run
    if spec == "presidio":
        from presidio_analyzer import AnalyzerEngine
        eng = AnalyzerEngine()
        return "Microsoft Presidio (English setup)", lambda t, lang="en": [(r.start, r.end, PRESIDIO_MAP.get(r.entity_type, r.entity_type))
                                                for r in eng.analyze(t, language="en")]
    if spec == "presidio-multi":
        return "Microsoft Presidio (each language's own setup)", presidio_multilingual()
    if spec == "presidio+scrubpii":
        from presidio_analyzer import AnalyzerEngine
        from scrubpii.presidio import add_to
        eng = add_to(AnalyzerEngine(), replace_ner=True)
        to_ours = {v: k for k, v in __import__("scrubpii.presidio", fromlist=["x"]).TO_PRESIDIO.items()}
        to_ours["DATE_TIME"] = "DATE_OF_BIRTH"
        fn = lambda t, lang="en": [(r.start, r.end, to_ours.get(r.entity_type, PRESIDIO_MAP.get(r.entity_type, r.entity_type)))
                        for r in eng.analyze(t, language="en")]
        fn("warm up")
        return "Presidio + scrubpii plug-in", fn
    if spec == "spacy":
        import spacy
        nlp = spacy.load("en_core_web_lg")
        return "spaCy (en_core_web_lg)", lambda t, lang="en": [(e.start_char, e.end_char, SPACY_MAP[e.label_])
                                                    for e in nlp(t).ents if e.label_ in SPACY_MAP]
    raise SystemExit(f"unknown system {spec}")


SPACY_MODELS = {"en": "en_core_web_lg", "es": "es_core_news_lg", "fr": "fr_core_news_lg", "de": "de_core_news_lg", "it": "it_core_news_lg"}


def presidio_multilingual():
    """Presidio set up for each language: that language's spaCy model plus
    copies of the pattern recognizers (email, card, IP, IBAN, phone...) that
    Presidio only registers for English by default. The fairest setup we know."""
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_analyzer import predefined_recognizers as pr
    langs = list(SPACY_MODELS)
    nlp = NlpEngineProvider(nlp_configuration={"nlp_engine_name": "spacy", "models": [
        {"lang_code": l, "model_name": m} for l, m in SPACY_MODELS.items()]}).create_engine()
    reg = RecognizerRegistry(supported_languages=langs)
    reg.load_predefined_recognizers(languages=langs, nlp_engine=nlp)
    have = {(type(r).__name__, r.supported_language) for r in reg.recognizers}
    for name in ["EmailRecognizer", "CreditCardRecognizer", "IpRecognizer", "IbanRecognizer", "PhoneRecognizer",
                 "UsSsnRecognizer", "UsPassportRecognizer", "UsLicenseRecognizer"]:
        cls = getattr(pr, name, None)
        for l in langs:
            if cls is None or (name, l) in have:
                continue
            try:
                reg.add_recognizer(cls(supported_language=l))
            except Exception as e:  # noqa: BLE001 - a recognizer that can't take the language is skipped
                print(f"presidio-multi: skipped {name} for {l}: {e}")
    eng = AnalyzerEngine(nlp_engine=nlp, registry=reg, supported_languages=langs)
    return lambda t, lang="en": [(r.start, r.end, PRESIDIO_MAP.get(r.entity_type, r.entity_type))
                                 for r in eng.analyze(t, language=lang if lang in SPACY_MODELS else "en")]


def covered(s, e, finds):
    hit = set()
    for fs, fe, _ in finds:
        hit.update(range(max(s, fs), min(e, fe)))
    return len(hit) / max(e - s, 1)


def score(fn, rows, lang="en"):
    per = {}
    tot = {"items": 0, "caught": 0, "hidden": 0, "finds": 0, "pii": 0, "find_chars": 0, "pii_chars": 0}
    t0 = time.time()
    for text, gold in rows:
        finds = [f for f in fn(text, lang) if f[1] > f[0]]
        tot["finds"] += len(finds)
        tot["pii"] += sum(any(fs < ge and gs < fe for gs, ge, _ in gold) for fs, fe, _ in finds)
        found_chars = set()
        for fs, fe, _ in finds:
            found_chars.update(range(fs, fe))
        gold_chars = set()
        for gs, ge, _ in gold:
            gold_chars.update(range(gs, ge))
        # Whitespace inside a find (between first and last name) is not counted against it.
        counted = {i for i in found_chars if not text[i].isspace()}
        tot["find_chars"] += len(counted)
        tot["pii_chars"] += len(counted & gold_chars)
        for gs, ge, gt in gold:
            if gt is None:
                continue
            c = covered(gs, ge, finds)
            p = per.setdefault(gt, {"items": 0, "caught": 0, "hidden": 0})
            for d in (p, tot):
                d["items"] += 1
                d["caught"] += c > 0
                d["hidden"] += c >= 0.9
    ms = (time.time() - t0) * 1000 / max(len(rows), 1)
    return summarize(tot, per, ms)


def f1(a, b):
    return 2 * a * b / (a + b) if a + b else 0


def summarize(tot, per, ms=0.0):
    rec = tot["caught"] / max(tot["items"], 1)
    hidden = tot["hidden"] / max(tot["items"], 1)
    prec = tot["pii"] / max(tot["finds"], 1)
    cprec = tot["pii_chars"] / max(tot["find_chars"], 1)
    return {"items": tot["items"], "fully_hidden": round(hidden, 3), "char_precision": round(cprec, 3),
            "strict_f1": round(f1(hidden, cprec), 3),
            "caught": round(rec, 3), "was_personal": round(prec, 3), "touch_f1": round(f1(rec, prec), 3),
            "ms_per_text": round(ms, 1),
            "by_type": {t: {"items": p["items"], "caught": round(p["caught"] / p["items"], 3),
                            "fully_hidden": round(p["hidden"] / p["items"], 3)} for t, p in sorted(per.items())}}


DATASETS = {   # name -> (language, loader)
    "ai4privacy (English)": ("en", lambda n: pii_data.openpii("validation", langs=("en",), n=n, seed=7)),
    "ai4privacy (Spanish)": ("es", lambda n: pii_data.openpii("validation", langs=("es",), n=n // 2, seed=7)),
    "ai4privacy (French)": ("fr", lambda n: pii_data.openpii("validation", langs=("fr",), n=n // 2, seed=7)),
    "ai4privacy (German)": ("de", lambda n: pii_data.openpii("validation", langs=("de",), n=n // 2, seed=7)),
    "ai4privacy (Italian)": ("it", lambda n: pii_data.openpii("validation", langs=("it",), n=n // 2, seed=7)),
    "Gretel PII (English)": ("en", lambda n: pii_data.gretel_en("test", n=n, seed=7)),
    "Gretel finance (English, never trained on)": ("en", lambda n: pii_data.gretel_finance("test", n=n, seed=7)),
    "Medical records (Nemotron-PII test split)": ("en", lambda n: pii_data.nemotron("medical", n=n, seed=7)),
    "Support tickets, emails, transcripts (Nemotron-PII test split)":
        ("en", lambda n: pii_data.nemotron("conversation", n=n, seed=7)),
    "Logs and config files (Nemotron-PII test split)": ("en", lambda n: pii_data.nemotron("logs_config", n=n, seed=7)),
}


def report(results, stem, meta):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{stem}.json").write_text(json.dumps({"meta": meta, "results": results}, indent=2) + "\n")
    names = meta["systems"]
    L = ["# scrubpii vs Microsoft Presidio vs spaCy", "",
         f"Run on {meta['date']} on a GitHub Actions runner (CPU only), scorer `training/compare.py` "
         f"at commit `{meta.get('commit', 'local')}`. Up to {meta['rows']} texts per dataset "
         "(half that for the four non-English sets).", "",
         "**How to read this.** The headline is strict: **Fully hidden** is the share of marked personal-data items "
         "with at least 90% of their characters redacted, **Char precision** is the share of redacted characters that "
         "were marked personal data, and **Strict F1** combines the two. **Caught** and **Touch F1** count a find that "
         "touches an item by even one character, so a detector that marks one letter of every email would score 1.0 there; "
         "they are shown only for comparison with older reports. Names given to items don't matter, only whether "
         "the text would be safe to share.", ""]
    # Summary: strict F1 per dataset, one column per system.
    L += ["## Summary (strict F1)", "", "| Dataset | " + " | ".join(names) + " |", "|---|" + "---:|" * len(names)]
    for ds, systems in results.items():
        best = max(r["strict_f1"] for r in systems.values())
        L.append(f"| {ds} | " + " | ".join(
            (f"**{systems[n]['strict_f1']:.3f}**" if systems[n]["strict_f1"] == best else f"{systems[n]['strict_f1']:.3f}")
            if n in systems else "–" for n in names) + " |")
    L.append("")
    for ds, systems in results.items():
        L += [f"## {ds}", "", "| System | Fully hidden | Char precision | Strict F1 | Caught (any touch) | Touch F1 | ms/text |",
              "|---|---:|---:|---:|---:|---:|---:|"]
        best = max(r["strict_f1"] for r in systems.values())
        for name, r in systems.items():
            sf = f"**{r['strict_f1']:.3f}**" if r["strict_f1"] == best else f"{r['strict_f1']:.3f}"
            L.append(f"| {name} | {r['fully_hidden']:.1%} | {r['char_precision']:.1%} | {sf} | {r['caught']:.1%} | "
                     f"{r['touch_f1']:.3f} | {r['ms_per_text']:.0f} |")
        types = sorted({t for r in systems.values() for t in r["by_type"]})
        L += ["", "Fully hidden, by type:", "", "| Type | Items | " + " | ".join(systems) + " |", "|---|---:|" + "---:|" * len(systems)]
        for t in types:
            items = max(r["by_type"].get(t, {}).get("items", 0) for r in systems.values())
            L.append(f"| {t} | {items} | " + " | ".join(f"{r['by_type'][t]['fully_hidden']:.0%}" if t in r["by_type"] else "–"
                                                         for r in systems.values()) + " |")
        L.append("")
    L += ["**Setups.** *Microsoft Presidio (English setup)* is Presidio's default: spaCy en_core_web_lg and every "
          "recognizer, run with language=\"en\" on every set, including the Spanish, French, German and Italian ones. "
          "*Microsoft Presidio (each language's own setup)* gives Presidio that language's large spaCy model and copies "
          "of its pattern recognizers (email, card, IP, IBAN, phone, SSN, passport, license) for each language, which "
          "is the fairest multilingual setup we know. scrubpii is one model for every language. spaCy alone is shown "
          "as a floor.", "",
          "**Limits.** scrubpii trains on the *train* splits of ai4privacy and Gretel PII, never on these test rows; "
          "Gretel finance and the three Nemotron sets are never trained on. Labels in public datasets are imperfect, "
          "so small differences (under a point) are noise.", "",
          "Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and "
          "synthetic_pii_finance_multilingual (Apache 2.0), NVIDIA Nemotron-PII (CC BY 4.0)."]
    (OUT / f"{stem}.md").write_text("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", action="append", required=True)
    ap.add_argument("--rows", type=int, default=1000)
    ap.add_argument("--dataset", action="append", help="limit to these dataset names")
    ap.add_argument("--out", default="compare", help="name of the report files in benchmarks/")
    a = ap.parse_args()
    systems = [make_system(s) for s in a.system]
    results = {}
    for ds, (lang, load) in DATASETS.items():
        if a.dataset and ds not in a.dataset:
            continue
        rows = load(a.rows)
        results[ds] = {}
        for name, fn in systems:
            results[ds][name] = score(fn, rows, lang)
            r = results[ds][name]
            print(f"{ds} | {name}: hidden {r['fully_hidden']:.1%}, char precision {r['char_precision']:.1%}, "
                  f"strict F1 {r['strict_f1']:.3f} (touch F1 {r['touch_f1']:.3f}), {r['ms_per_text']:.0f} ms", flush=True)
    import os
    report(results, a.out, {"date": date.today().isoformat(), "rows": a.rows, "systems": [n for n, _ in systems],
                            "commit": os.environ.get("GITHUB_SHA", "local")[:7]})
    print((OUT / f"{a.out}.md").read_text())


if __name__ == "__main__":
    main()
