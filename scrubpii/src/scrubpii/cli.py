"""scrubpii on the command line.

  scrubpii "Call Sarah at 662-634-1142"          -> Call [PERSON] at [PHONE]
  cat notes.txt | scrubpii --mode mask            -> redacts standard input
  scrubpii --file customers.csv -o safe.csv       -> CSV, JSON, JSONL or text files
  scrubpii --find "..."                           -> what it found, as JSON
  scrubpii --audit "..."                          -> redacted text plus why each item was flagged (JSON)
  scrubpii --audit --audit-format md --file x.txt -> the same as a Markdown report
  scrubpii --rules my_rules.json "..."            -> add your own patterns (see scrubpii.load_rules)
  scrubpii serve --port 8000                      -> local HTTP API (needs scrubpii[server])
"""
import argparse
import json
import sys
from pathlib import Path

from . import MODES, __version__, audit, audit_markdown, find, load_rules, redact, redact_csv, redact_json, tokenize


def _file(path, mode, min_score, columns):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    ext = p.suffix.lower()
    if ext == ".csv":
        return redact_csv(text, mode, columns, min_score)
    if ext == ".json":
        return json.dumps(redact_json(json.loads(text), mode, columns, min_score), indent=2, ensure_ascii=False) + "\n"
    if ext == ".jsonl":
        lines = [json.loads(l) for l in text.splitlines() if l.strip()]
        return "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in redact_json(lines, mode, columns, min_score))
    return redact(text, mode, min_score)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["serve"]:
        sp = argparse.ArgumentParser(prog="scrubpii serve")
        sp.add_argument("--host", default="127.0.0.1")
        sp.add_argument("--port", type=int, default=8000)
        s = sp.parse_args(argv[1:])
        from .server import run
        return run(s.host, s.port)
    ap = argparse.ArgumentParser(prog="scrubpii", description="Find and redact personal data in text.")
    ap.add_argument("text", nargs="?", help="text to redact (default: read standard input)")
    ap.add_argument("--file", help="redact a .csv, .json, .jsonl or text file")
    ap.add_argument("-o", "--output", help="write here instead of standard output")
    ap.add_argument("--columns", help="CSV columns / JSON fields to redact, comma separated (default: all)")
    ap.add_argument("--mode", choices=MODES, default="label", help="how to replace what it finds (default: label)")
    ap.add_argument("--min-score", type=float, default=0.5, help="model confidence needed (default: 0.5)")
    ap.add_argument("--find", action="store_true", help="print what it found as JSON instead of redacting")
    ap.add_argument("--audit", action="store_true", help="print a report: redacted text and why each item was flagged")
    ap.add_argument("--audit-format", choices=("json", "md"), default="json", help="audit report format (default: json)")
    ap.add_argument("--show-values", action="store_true", help="put the real values in the audit report (off by default)")
    ap.add_argument("--rules", action="append", default=[], help="JSON file of your own rules; can repeat")
    ap.add_argument("--version", action="version", version=f"scrubpii {__version__}")
    a = ap.parse_args(argv)
    cols = a.columns.split(",") if a.columns else None
    for path in a.rules:
        load_rules(path)
    if a.audit:
        text = Path(a.file).read_text(encoding="utf-8") if a.file else a.text if a.text is not None else sys.stdin.read()
        rep = audit(text, a.mode if a.mode != "token" else "label", a.min_score, include_values=a.show_values)
        out = audit_markdown(rep) + "\n" if a.audit_format == "md" else json.dumps(rep, indent=2, ensure_ascii=False) + "\n"
    elif a.file:
        out = _file(a.file, a.mode, a.min_score, cols)
    else:
        text = a.text if a.text is not None else sys.stdin.read()
        if a.find:
            out = json.dumps([e.as_dict() for e in find(text, a.min_score)], indent=2, ensure_ascii=False) + "\n"
        elif a.mode == "token":
            out, key = tokenize(text, a.min_score)
            out += "\n"
            print(json.dumps(key, indent=2, ensure_ascii=False), file=sys.stderr)
        else:
            out = redact(text, a.mode, a.min_score) + "\n"
    if a.output:
        Path(a.output).write_text(out, encoding="utf-8")
    else:
        sys.stdout.write(out)


if __name__ == "__main__":
    main()
