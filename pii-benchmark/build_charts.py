"""Rebuild every scrubpii-vs-Presidio chart from one benchmark results file.

The charts on this benchmark page are generated from privacy-tools/benchmarks/compare.json, so the numbers can't drift
apart. Each chart lives between <!-- chart:NAME --> and <!-- /chart:NAME --> markers.

Usage (from the portfolio repo, with privacy-tools checked out next to it):
    python pii-benchmark/build_charts.py ../privacy-tools/benchmarks/compare.json
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ME, THEM = "scrubpii", "Microsoft Presidio"

# dataset key in compare.json -> (label, note shown beside the label)
SETS = [
    ("ai4privacy (English)", "ai4privacy, English", ""),
    ("ai4privacy (Spanish)", "ai4privacy, Spanish", "Presidio in English mode"),
    ("ai4privacy (French)", "ai4privacy, French", "Presidio in English mode"),
    ("ai4privacy (German)", "ai4privacy, German", "Presidio in English mode"),
    ("ai4privacy (Italian)", "ai4privacy, Italian", "Presidio in English mode"),
    ("Gretel PII (English)", "Gretel PII", ""),
    ("Medical records (Nemotron-PII test split)", "Medical records", ""),
    ("Support tickets, emails, transcripts (Nemotron-PII test split)", "Support tickets, emails, chats", ""),
    ("Logs and config files (Nemotron-PII test split)", "Logs &amp; config files", ""),
    ("Gretel finance (English, never trained on)", "Finance documents", "source never seen in training"),
]
TYPES = [("PERSON", "Names"), ("ADDRESS", "Street addresses"), ("PHONE", "Phone numbers"),
         ("ID_NUMBER", "ID numbers"), ("EMAIL", "Emails")]


def pct(x):
    if x < 1 and round(x * 100) == 100:  # never show 100% unless it is
        return f"{x * 100:.1f}%"
    return f"{x * 100:.0f}%"


def row(label, note, a, b, indent):
    em = f" <em>{note}</em>" if note else ""
    return (f'{indent}<div class="brow" style="--a:{a * 100:.1f}%;--b:{b * 100:.1f}%"><span>{label}{em}</span>'
            f'<div><i class="me"><b>{pct(a)}</b></i><i class="them"><b>{pct(b)}</b></i></div></div>')


def sets_rows(res, keys, indent):
    out = []
    for key, label, note in SETS:
        if keys and key not in keys:
            continue
        r = res[key]
        out.append(row(label, note, r[ME]["fully_hidden"], r[THEM]["fully_hidden"], indent))
    return "\n".join(out)


def type_rows(res, indent):
    eng = res["ai4privacy (English)"]
    out = []
    for t, label in TYPES:
        a, b = eng[ME]["by_type"][t], eng[THEM]["by_type"][t]
        out.append(row(label, f'{a["items"]} items', a["fully_hidden"], b["fully_hidden"], indent))
    return "\n".join(out)


def put(path, name, body):
    text = path.read_text()
    pat = re.compile(rf"(<!-- chart:{name} -->).*?(\n\s*<!-- /chart:{name} -->)", re.S)
    new, n = pat.subn(lambda m: m.group(1) + "\n" + body + m.group(2), text)
    if n != 1:
        sys.exit(f"{path}: marker chart:{name} not found")
    path.write_text(new)
    print(f"updated {path.name} chart:{name}")


def main():
    data = json.loads(Path(sys.argv[1]).read_text())
    res = data["results"]
    put(HERE / "index.html", "score", sets_rows(res, None, " " * 10))
    put(HERE / "index.html", "types", type_rows(res, " " * 10))


if __name__ == "__main__":
    main()
