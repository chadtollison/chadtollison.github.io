"""Head-to-head: scrubpii vs Microsoft Presidio vs spaCy on public PII datasets.

The question for a redactor is "would this text be safe to share after
redaction?", so the main scores ignore what *name* each system gives an item:

  Caught         share of marked personal-data items that any find touches
  Fully hidden   share of items with at least 90% of their characters covered
                 (a find that covers half a card number still leaks it)
  Was personal   share of finds that landed on marked personal data (precision)
  F1             of Caught and Was personal
  ms/text        average time per text on the same CPU

Per-type "Caught" is reported too. Datasets:
  * ai4privacy open-pii-masking-500k, validation split, English and Spanish
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

        def run(t):
            if backend:
                os.environ["SCRUBPII_BACKEND"] = backend
            return [(e.start, e.end, e.type) for e in scrubpii.find(t, model=model)]
        run("warm up")
        return label, run
    if spec == "presidio":
        from presidio_analyzer import AnalyzerEngine
        eng = AnalyzerEngine()
        return "Microsoft Presidio", lambda t: [(r.start, r.end, PRESIDIO_MAP.get(r.entity_type, r.entity_type))
                                                for r in eng.analyze(t, language="en")]
    if spec == "spacy":
        import spacy
        nlp = spacy.load("en_core_web_lg")
        return "spaCy (en_core_web_lg)", lambda t: [(e.start_char, e.end_char, SPACY_MAP[e.label_])
                                                    for e in nlp(t).ents if e.label_ in SPACY_MAP]
    raise SystemExit(f"unknown system {spec}")


def covered(s, e, finds):
    hit = set()
    for fs, fe, _ in finds:
        hit.update(range(max(s, fs), min(e, fe)))
    return len(hit) / max(e - s, 1)


def score(fn, rows):
    per = {}
    tot = {"items": 0, "caught": 0, "hidden": 0, "finds": 0, "pii": 0}
    t0 = time.time()
    for text, gold in rows:
        finds = [f for f in fn(text) if f[1] > f[0]]
        tot["finds"] += len(finds)
        tot["pii"] += sum(any(fs < ge and gs < fe for gs, ge, _ in gold) for fs, fe, _ in finds)
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
    rec = tot["caught"] / max(tot["items"], 1)
    prec = tot["pii"] / max(tot["finds"], 1)
    return {"items": tot["items"], "caught": round(rec, 3), "fully_hidden": round(tot["hidden"] / max(tot["items"], 1), 3),
            "was_personal": round(prec, 3), "f1": round(2 * rec * prec / (rec + prec) if rec + prec else 0, 3),
            "ms_per_text": round(ms, 1),
            "by_type": {t: {"items": p["items"], "caught": round(p["caught"] / p["items"], 3),
                            "fully_hidden": round(p["hidden"] / p["items"], 3)} for t, p in sorted(per.items())}}


DATASETS = {
    "ai4privacy (English)": lambda n: pii_data.openpii("validation", langs=("en",), n=n, seed=7),
    "ai4privacy (Spanish)": lambda n: pii_data.openpii("validation", langs=("es",), n=n // 2, seed=7),
    "Gretel PII (English)": lambda n: pii_data.gretel_en("test", n=n, seed=7),
    "Gretel finance (English, never trained on)": lambda n: pii_data.gretel_finance("test", n=n, seed=7),
}


def report(results, stem, meta):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{stem}.json").write_text(json.dumps({"meta": meta, "results": results}, indent=2) + "\n")
    L = ["# scrubpii vs Microsoft Presidio vs spaCy", "",
         f"Run on {meta['date']} on a GitHub Actions runner (CPU only). Up to {meta['rows']} texts per dataset.", "",
         "**Caught**: share of marked personal-data items that any find touches. "
         "**Fully hidden**: share with 90%+ of characters covered. "
         "**Was personal**: share of finds that landed on marked personal data. "
         "Names given to items don't matter here, only whether the text would be safe to share.", ""]
    for ds, systems in results.items():
        L += [f"## {ds}", "", "| System | Caught | Fully hidden | Was personal | F1 | ms/text |", "|---|---:|---:|---:|---:|---:|"]
        best = max(r["f1"] for r in systems.values())
        for name, r in systems.items():
            f1 = f"**{r['f1']:.3f}**" if r["f1"] == best else f"{r['f1']:.3f}"
            L.append(f"| {name} | {r['caught']:.0%} | {r['fully_hidden']:.0%} | {r['was_personal']:.0%} | {f1} | {r['ms_per_text']:.0f} |")
        types = sorted({t for r in systems.values() for t in r["by_type"]})
        L += ["", "Caught, by type:", "", "| Type | Items | " + " | ".join(systems) + " |", "|---|---:|" + "---:|" * len(systems)]
        for t in types:
            items = max(r["by_type"].get(t, {}).get("items", 0) for r in systems.values())
            L.append(f"| {t} | {items} | " + " | ".join(f"{r['by_type'][t]['caught']:.0%}" if t in r["by_type"] else "–"
                                                         for r in systems.values()) + " |")
        L.append("")
    L += ["Presidio runs with its defaults (spaCy en_core_web_lg, all recognizers, English). "
          "On Spanish text every system uses its English setup except scrubpii, which trains on Spanish too.", "",
          "Data: ai4privacy open-pii-masking-500k (CC BY 4.0), Gretel gretel-pii-masking-en-v1 and "
          "synthetic_pii_finance_multilingual (Apache 2.0)."]
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
    for ds, load in DATASETS.items():
        if a.dataset and ds not in a.dataset:
            continue
        rows = load(a.rows)
        results[ds] = {}
        for name, fn in systems:
            results[ds][name] = score(fn, rows)
            r = results[ds][name]
            print(f"{ds} | {name}: caught {r['caught']:.1%}, hidden {r['fully_hidden']:.1%}, "
                  f"personal {r['was_personal']:.1%}, F1 {r['f1']:.3f}, {r['ms_per_text']:.0f} ms", flush=True)
    report(results, a.out, {"date": date.today().isoformat(), "rows": a.rows, "systems": [n for n, _ in systems]})
    print((OUT / f"{a.out}.md").read_text())


if __name__ == "__main__":
    main()
