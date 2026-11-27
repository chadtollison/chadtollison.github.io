"""Look at nvidia/Nemotron-PII: license, formats, labels, and samples by kind."""
import ast
import json
import re
from collections import Counter

from datasets import load_dataset
from huggingface_hub import HfApi

info = HfApi().dataset_info("nvidia/Nemotron-PII")
print("license:", info.card_data.get("license") if info.card_data else None, [t for t in info.tags if "license" in t])
ds = load_dataset("nvidia/Nemotron-PII", split="test")
print("document_format", Counter(ds["document_format"]).most_common())
dt = Counter(ds["document_type"])
for kw in ("chat", "log", "code", "config", "json", "sql", "xml", "csv", "yaml", "transcript", "message", "ticket",
           "medical", "patient", "clinic", "health", "prescription", "discharge", "lab"):
    print(kw, sum(v for k, v in dt.items() if kw in k.lower()), [k for k, _ in dt.most_common() if kw in k.lower()][:12])
labels = Counter()
for sp in ds.select(range(20000))["spans"]:
    for m in ast.literal_eval(sp):
        labels[m["label"]] += 1
print("labels", labels.most_common())
for fmt in Counter(ds["document_format"]):
    r = ds.filter(lambda x: x["document_format"] == fmt).select(range(1))[0]
    print(f"\n--- {fmt} / {r['document_type']} / {r['domain']}\n{r['text'][:900]}\n{r['spans'][:500]}")
