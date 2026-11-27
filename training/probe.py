"""Look at what scrubpii misses, and at candidate harder test sets.

1. Prints every PHONE / IP_ADDRESS item (and a sample of others) that
   scrubpii misses on the Gretel finance set, with context.
2. Prints the schema and a few rows of candidate test sets, so we can see
   whether they fit (license, labels, kinds of text).
"""
import json
import sys
from collections import Counter

import pii_data
import scrubpii

TYPES = sys.argv[1:] or ["PHONE", "IP_ADDRESS"]


def misses(name, rows):
    seen = Counter()
    print(f"\n===== misses: {name} =====")
    for text, gold in rows:
        finds = scrubpii.find(text)
        for s, e, t in gold:
            if t is None:
                continue
            if any(f.start < e and s < f.end for f in finds):
                continue
            seen[t] += 1
            if t in TYPES or seen[t] <= 3:
                over = [(f.type, f.text) for f in finds if f.start < e + 15 and s - 15 < f.end]
                print(f"[{t}] {text[s:e]!r}  ctx={text[max(0, s - 40):e + 25]!r}  near={over}")
    print("missed by type:", dict(seen))


misses("Gretel finance", pii_data.gretel_finance("test", n=1000, seed=7))
misses("Gretel PII", pii_data.gretel_en("test", n=1000, seed=7))

from datasets import load_dataset  # noqa: E402

for name, kw in [("nvidia/Nemotron-PII", {}), ("beki/privy", {"name": "small"}), ("beki/privy", {}),
                 ("gretelai/gretel-pii-masking-en-v1", {})]:
    print(f"\n===== dataset: {name} {kw} =====")
    try:
        ds = load_dataset(name, split="test" if "gretel" in name else None, **kw)
        print(ds)
        d = ds if "gretel" in name else ds[list(ds.keys())[0]]
        for col in d.column_names:
            if col in ("domain", "document_type", "type", "industry", "locale", "language", "format"):
                print(col, Counter(d[col]).most_common(40))
        for r in d.select(range(min(2, len(d)))):
            print(json.dumps({k: str(v)[:600] for k, v in r.items()}, ensure_ascii=False))
    except Exception as ex:  # noqa: BLE001
        print("FAILED:", type(ex).__name__, str(ex)[:300])
