"""chad-pii on the command line.

  chad-pii "Call Sarah at 662-634-1142"        -> Call [PERSON] at [PHONE]
  cat notes.txt | chad-pii --mode mask          -> redacts standard input
  chad-pii --find "..."                         -> lists what it found as JSON
"""
import argparse
import json
import sys

from . import MODES, find, redact, tokenize


def main(argv=None):
    ap = argparse.ArgumentParser(prog="chad-pii", description="Find and redact personal data in text.")
    ap.add_argument("text", nargs="?", help="text to redact (default: read standard input)")
    ap.add_argument("--mode", choices=MODES, default="label", help="how to replace what it finds (default: label)")
    ap.add_argument("--min-score", type=float, default=0.5, help="model confidence needed (default: 0.5)")
    ap.add_argument("--find", action="store_true", help="print what it found as JSON instead of redacting")
    a = ap.parse_args(argv)
    text = a.text if a.text is not None else sys.stdin.read()
    if a.find:
        print(json.dumps([e.as_dict() for e in find(text, a.min_score)], indent=2, ensure_ascii=False))
    elif a.mode == "token":
        out, key = tokenize(text, a.min_score)
        print(out)
        print(json.dumps(key, indent=2, ensure_ascii=False), file=sys.stderr)
    else:
        print(redact(text, a.mode, a.min_score))


if __name__ == "__main__":
    main()
