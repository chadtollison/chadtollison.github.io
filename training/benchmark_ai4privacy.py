"""Score the PII model on a public dataset it was never trained on.

Uses ai4privacy/pii-masking-200k from Hugging Face: real-looking English text
written by a different team, with every piece of personal data marked. Their
labels are mapped onto this model's six types (FIRSTNAME + LASTNAME -> PERSON,
PHONENUMBER -> PHONE and so on); their other types (addresses, usernames ...)
are ignored, because this model doesn't look for them.

Two scores per type:
  * exact:   the model found exactly the same characters as the dataset marks.
  * overlap: the model's find touches the marked item (a fair score for a
             redactor, since a black bar a few characters wide still hides it).

Usage:
  python training/benchmark_ai4privacy.py --model ChadTollison/pii-distilbert-v2 --name "Hugging Face model"
  python training/benchmark_ai4privacy.py --model models/pii-distilbert-v2 --name "In-browser model"
  python training/benchmark_ai4privacy.py ... --rows 300        # quick run
Writes benchmarks/ai4privacy.json (one entry per --name) and benchmarks/ai4privacy.md.
"""
import argparse
import ast
import json
import random
import re
import time
from datetime import date
from pathlib import Path

from datasets import load_dataset
from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline

DATASET = "ai4privacy/pii-masking-200k"
TYPES = ["PERSON", "EMAIL", "PHONE", "SSN", "CREDIT_CARD", "IP_ADDRESS"]
OUT = Path(__file__).resolve().parent.parent / "benchmarks"


def map_label(label):
    L = re.sub(r"[^A-Z0-9]", "", label.upper())
    if L in {"FIRSTNAME", "LASTNAME", "MIDDLENAME", "GIVENNAME", "SURNAME"} or re.fullmatch(r"(GIVENNAME|LASTNAME)\d", L):
        return "PERSON"
    if L == "EMAIL":
        return "EMAIL"
    if L in {"PHONENUMBER", "TEL", "TELEPHONENUM", "PHONE"}:
        return "PHONE"
    if L in {"SSN", "SOCIALNUM", "SOCIALNUMBER"}:
        return "SSN"
    if L == "CREDITCARDNUMBER":
        return "CREDIT_CARD"
    if L in {"IP", "IPV4", "IPV6", "IPADDRESS"}:
        return "IP_ADDRESS"
    return None


def parse_mask(mask):
    if isinstance(mask, str):
        try:
            mask = json.loads(mask)
        except json.JSONDecodeError:
            mask = ast.literal_eval(mask)
    return mask


def merge(spans, text):
    """Join same-type pieces that only have spaces between them ("Sarah" + "Johnson")."""
    spans = sorted(spans)
    out = []
    for s, e, t in spans:
        if out and out[-1][2] == t and out[-1][1] <= s and text[out[-1][1]:s].strip() == "":
            out[-1] = (out[-1][0], e, t)
        else:
            out.append((s, e, t))
    return out


def load_rows(n, max_tokens, tok):
    ds = load_dataset(DATASET, split="train")
    lang_col = "language" if "language" in ds.column_names else None
    idx = list(range(len(ds)))
    random.Random(0).shuffle(idx)
    rows, seen_labels = [], set()
    for i in idx:
        r = ds[i]
        if lang_col and not str(r[lang_col]).lower().startswith("en"):
            continue
        text = r["source_text"]
        if len(tok(text)["input_ids"]) > max_tokens:
            continue
        gold = []
        for m in parse_mask(r["privacy_mask"]):
            seen_labels.add(m["label"])
            t = map_label(m["label"])
            if t:
                gold.append((int(m["start"]), int(m["end"]), t))
        rows.append((text, merge(gold, text)))
        if len(rows) >= n:
            break
    return rows, sorted(seen_labels)


def load_model(path):
    p = Path(path)
    tok = AutoTokenizer.from_pretrained(path, model_input_names=["input_ids", "attention_mask"])
    if (p / "onnx" / "model_quantized.onnx").exists():
        from optimum.onnxruntime import ORTModelForTokenClassification
        model = ORTModelForTokenClassification.from_pretrained(path, subfolder="onnx", file_name="model_quantized.onnx")
    else:
        model = AutoModelForTokenClassification.from_pretrained(path)
    return tok, pipeline("token-classification", model=model, tokenizer=tok, aggregation_strategy="max")


def predict(pii, text):
    spans = []
    for item in pii(text):
        s, e = item["start"], item["end"]
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e > s and item["entity_group"] in TYPES:
            spans.append((s, e, item["entity_group"]))
    return merge(spans, text)


def f1(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def evaluate(pii, rows):
    c = {t: {"gold": 0, "pred": 0, "exact": 0, "found": 0, "right": 0} for t in TYPES}
    for text, gold in rows:
        pred = predict(pii, text)
        for t in TYPES:
            g = [(s, e) for s, e, tt in gold if tt == t]
            p = [(s, e) for s, e, tt in pred if tt == t]
            c[t]["gold"] += len(g)
            c[t]["pred"] += len(p)
            c[t]["exact"] += len(set(g) & set(p))
            c[t]["found"] += sum(any(ps < ge and gs < pe for ps, pe in p) for gs, ge in g)
            c[t]["right"] += sum(any(ps < ge and gs < pe for gs, ge in g) for ps, pe in p)
    result = {}
    tot = {k: 0 for k in ("gold", "pred", "exact", "found", "right")}
    for t in TYPES + ["ALL"]:
        k = tot if t == "ALL" else c[t]
        if t != "ALL":
            for key in tot:
                tot[key] += k[key]
        ep, er, ef = f1(k["exact"], k["pred"] - k["exact"], k["gold"] - k["exact"])
        op = k["right"] / k["pred"] if k["pred"] else 0.0
        orr = k["found"] / k["gold"] if k["gold"] else 0.0
        of = 2 * op * orr / (op + orr) if op + orr else 0.0
        result[t] = {"items": k["gold"], "exact_f1": round(ef, 3), "overlap_precision": round(op, 3),
                     "overlap_recall": round(orr, 3), "overlap_f1": round(of, 3)}
    return result


def write_report(all_results, meta):
    OUT.mkdir(exist_ok=True)
    (OUT / "ai4privacy.json").write_text(json.dumps({"meta": meta, "models": all_results}, indent=2) + "\n")
    lines = [f"# Benchmark: {DATASET}", "",
             f"{meta['rows']} English texts picked at random from [{DATASET}](https://huggingface.co/datasets/{DATASET}), "
             f"a public dataset this model was never trained on. Run on {meta['date']}.", "",
             "**Overlap** counts a find that touches the marked item (what matters for redaction). "
             "**Exact** needs the same characters.", ""]
    for name, res in all_results.items():
        lines += [f"## {name}", "", "| Type | Items | Found (recall) | Right (precision) | Overlap F1 | Exact F1 |",
                  "|---|---:|---:|---:|---:|---:|"]
        for t in TYPES + ["ALL"]:
            r = res[t]
            label = "**All six**" if t == "ALL" else t
            lines.append(f"| {label} | {r['items']} | {r['overlap_recall']:.0%} | {r['overlap_precision']:.0%} | "
                         f"{r['overlap_f1']:.3f} | {r['exact_f1']:.3f} |")
        lines.append("")
    lines += ["Dataset labels used: " + ", ".join(l for l in meta["labels"] if map_label(l)) + ".", "",
              "Labels ignored (this model doesn't look for them): " + ", ".join(l for l in meta["labels"] if not map_label(l)) + "."]
    (OUT / "ai4privacy.md").write_text("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append", required=True, help="HF id or local folder; repeat for several")
    ap.add_argument("--name", action="append", help="display name for each --model")
    ap.add_argument("--rows", type=int, default=2000)
    a = ap.parse_args()
    names = a.name or a.model
    prev = {}
    if (OUT / "ai4privacy.json").exists():
        prev = json.loads((OUT / "ai4privacy.json").read_text()).get("models", {})
    rows = labels = None
    for path, name in zip(a.model, names):
        tok, pii = load_model(path)
        if rows is None:
            rows, labels = load_rows(a.rows, 512, tok)
            print(f"{len(rows)} rows, {sum(len(g) for _, g in rows)} items to find")
        t0 = time.time()
        prev[name] = evaluate(pii, rows)
        print(name, f"({time.time() - t0:.0f} s)", json.dumps(prev[name]["ALL"]))
    write_report(prev, {"dataset": DATASET, "rows": len(rows), "date": date.today().isoformat(), "labels": labels})
    print((OUT / "ai4privacy.md").read_text())


if __name__ == "__main__":
    main()
