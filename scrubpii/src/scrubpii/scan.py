"""Find where personal data lives: folders, files, S3 and Google Cloud Storage.

    scrubpii scan ./exports s3://my-bucket/logs/ gs://other-bucket --report report.html

    from scrubpii.scan import scan, report_html
    result = scan(["./exports"])
    open("report.html", "w").write(report_html(result))

Files are read where they are and nothing is uploaded. Reports never contain
the values themselves, only short previews like "s*********m" and positions,
so they are safe to share. Binary files and anything over max_bytes are skipped.
S3 needs `pip install boto3` and GCS `pip install google-cloud-storage`; both
use your usual cloud credentials.
"""
from __future__ import annotations

import datetime
import fnmatch
import html
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Tuple

from . import MODEL_ID, __version__, _preview, find

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".idea", "dist", "build"}
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z",
            ".onnx", ".bin", ".pt", ".safetensors", ".parquet", ".so", ".dll", ".exe", ".woff", ".woff2", ".ttf",
            ".mp3", ".mp4", ".mov", ".pyc", ".class", ".jar", ".db", ".sqlite"}
# Types that are a risk wherever they show up. Names and similar model finds
# are reported too, but these decide the "high" risk band.
HIGH = {"SSN", "CREDIT_CARD", "IBAN", "API_KEY", "PASSWORD", "PRIVATE_KEY", "PASSPORT", "DRIVER_LICENSE", "ID_NUMBER"}


@dataclass
class FileResult:
    path: str
    size: int
    counts: Dict[str, int] = field(default_factory=dict)
    samples: List[dict] = field(default_factory=list)     # first few finds: type, line, preview
    skipped: str = ""

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    @property
    def risk(self) -> str:
        if not self.total:
            return "none"
        return "high" if any(t in HIGH for t in self.counts) else "medium" if self.total >= 5 else "low"

    def as_dict(self) -> dict:
        return {"path": self.path, "size": self.size, "total": self.total, "risk": self.risk,
                "counts": self.counts, "samples": self.samples, **({"skipped": self.skipped} if self.skipped else {})}


def _looks_binary(data: bytes) -> bool:
    return b"\x00" in data[:8192]


def _scan_text(path: str, size: int, text: str, fast: bool, min_score: float, model: str, max_samples: int) -> FileResult:
    r = FileResult(path, size)
    line_starts = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            line_starts.append(i + 1)
    # Read in chunks of lines so the model sees short pieces and memory stays flat.
    chunk, base = [], 0
    lines = text.splitlines(keepends=True)
    pos = 0
    for n, line in enumerate(lines):
        chunk.append(line)
        if sum(len(c) for c in chunk) >= 4000 or n == len(lines) - 1:
            block = "".join(chunk)
            for e in find(block, min_score, model, fast):
                r.counts[e.type] = r.counts.get(e.type, 0) + 1
                if len(r.samples) < max_samples:
                    at = base + e.start
                    line_no = _bisect(line_starts, at) + 1
                    r.samples.append({"type": e.type, "line": line_no, "preview": _preview(e.text)})
            base += len(block)
            chunk = []
        pos += len(line)
    return r


def _bisect(a: List[int], x: int) -> int:
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo - 1


def _local(root: str, include: Optional[List[str]], exclude: List[str]) -> Iterator[Tuple[str, int, callable]]:
    p = Path(root)
    files = [p] if p.is_file() else (f for f in sorted(p.rglob("*")) if f.is_file())
    for f in files:
        rel = str(f)
        if any(part in SKIP_DIRS for part in f.parts):
            continue
        if not _wanted(rel, include, exclude):
            continue
        yield rel, f.stat().st_size, f.read_bytes


def _wanted(name: str, include: Optional[List[str]], exclude: List[str]) -> bool:
    base = os.path.basename(name)
    if include and not any(fnmatch.fnmatch(name, g) or fnmatch.fnmatch(base, g) for g in include):
        return False
    return not any(fnmatch.fnmatch(name, g) or fnmatch.fnmatch(base, g) for g in exclude)


def _split_bucket(url: str) -> Tuple[str, str]:
    rest = url.split("://", 1)[1]
    bucket, _, prefix = rest.partition("/")
    return bucket, prefix


def _s3(url: str, include, exclude) -> Iterator[Tuple[str, int, callable]]:
    try:
        import boto3
    except ImportError as e:
        raise RuntimeError("scanning S3 needs boto3: pip install boto3") from e
    bucket, prefix = _split_bucket(url)
    s3 = boto3.client("s3")
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/") or not _wanted(key, include, exclude):
                continue
            yield f"s3://{bucket}/{key}", obj["Size"], (lambda k=key: s3.get_object(Bucket=bucket, Key=k)["Body"].read())


def _gcs(url: str, include, exclude) -> Iterator[Tuple[str, int, callable]]:
    try:
        from google.cloud import storage
    except ImportError as e:
        raise RuntimeError("scanning GCS needs google-cloud-storage: pip install google-cloud-storage") from e
    bucket, prefix = _split_bucket(url)
    client = storage.Client()
    for blob in client.list_blobs(bucket, prefix=prefix or None):
        if blob.name.endswith("/") or not _wanted(blob.name, include, exclude):
            continue
        yield f"gs://{bucket}/{blob.name}", blob.size or 0, blob.download_as_bytes


def _source(t: str, include, exclude):
    if t.startswith("s3://"):
        return _s3(t, include, exclude)
    if t.startswith("gs://"):
        return _gcs(t, include, exclude)
    if not Path(t).exists():
        raise FileNotFoundError(f"{t} does not exist")
    return _local(t, include, exclude)


def sources(targets: Iterable[str], include: Optional[List[str]] = None, exclude: Optional[List[str]] = None):
    """Every (name, size, read) for the given folders, files, s3:// and gs:// URLs."""
    exclude = list(exclude or [])
    for t in targets:
        yield from _source(t, include, exclude)


def scan(targets: Iterable[str], fast: bool = False, min_score: float = 0.5, model: str = MODEL_ID,
         include: Optional[List[str]] = None, exclude: Optional[List[str]] = None,
         max_bytes: int = 5_000_000, max_samples: int = 5, progress=None) -> dict:
    """Scan files for personal data and return a report dict (no raw values in it).

    fast=True runs only the rules (much quicker on big trees; no names or
    addresses). include/exclude are glob patterns like "*.csv" or "logs/*".
    """
    targets = list(targets)
    exclude = list(exclude or [])
    started = datetime.datetime.now(datetime.timezone.utc)
    files: List[FileResult] = []
    errors: List[dict] = []          # targets that could not be scanned at all
    ignored = 0                      # images, archives and other binary files (not text, not checked)

    def every():
        for t in targets:
            try:
                yield from _source(t, include, exclude)
            except Exception as e:  # missing folder, bucket we can't list, missing boto3...
                errors.append({"target": t, "error": str(e) or e.__class__.__name__})

    for name, size, read in every():
        ext = os.path.splitext(name)[1].lower()
        if ext in SKIP_EXT:
            ignored += 1
            continue
        if size > max_bytes:
            files.append(FileResult(name, size, skipped=f"larger than {max_bytes:,} bytes"))
            continue
        try:
            data = read()
        except Exception as e:  # unreadable object: note it and go on
            files.append(FileResult(name, size, skipped=f"could not read: {e.__class__.__name__}"))
            continue
        if _looks_binary(data):
            ignored += 1
            continue
        text = data.decode("utf-8", errors="replace")
        files.append(_scan_text(name, size, text, fast, min_score, model, max_samples))
        if progress:
            progress(name)
    counts: Dict[str, int] = {}
    for f in files:
        for t, n in f.counts.items():
            counts[t] = counts.get(t, 0) + n
    order = {"high": 0, "medium": 1, "low": 2, "none": 3}
    files.sort(key=lambda f: (order[f.risk], -f.total, f.path))
    return {
        "scrubpii": __version__, "created": started.isoformat(timespec="seconds"),
        "targets": targets, "mode": "rules only" if fast else "model + rules",
        "files_scanned": sum(1 for f in files if not f.skipped),
        "files_skipped": sum(1 for f in files if f.skipped),
        "files_ignored": ignored,
        "errors": errors,
        # True only when every target was reached and every text file was read.
        "complete": not errors and not any(f.skipped for f in files),
        "files_with_pii": sum(1 for f in files if f.total),
        "total": sum(counts.values()), "counts": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        "files": [f.as_dict() for f in files],
    }


def report_markdown(rep: dict, limit: int = 200) -> str:
    """The scan as Markdown (good for a GitHub job summary or a ticket)."""
    out = ["# scrubpii scan", "",
           f"- Scanned {rep['files_scanned']} file(s) in {', '.join(f'`{t}`' for t in rep['targets'])} ({rep['mode']})",
           f"- **{rep['total']} item(s) of personal data in {rep['files_with_pii']} file(s)**", f"- {rep['created']}, scrubpii {rep['scrubpii']}", ""]
    if rep["counts"]:
        out += [", ".join(f"{t}: {n}" for t, n in rep["counts"].items()), ""]
    hits = [f for f in rep["files"] if f["total"]]
    if hits:
        out += ["| Risk | File | Items | Types | First lines |", "|---|---|---:|---|---|"]
        for f in hits[:limit]:
            types = ", ".join(f"{t} {n}" for t, n in f["counts"].items())
            lines = ", ".join(sorted({str(s["line"]) for s in f["samples"]}, key=int))
            out.append(f"| {f['risk']} | `{f['path']}` | {f['total']} | {types} | {lines} |")
        if len(hits) > limit:
            out.append(f"\n...and {len(hits) - limit} more file(s).")
    skipped = [f for f in rep["files"] if f.get("skipped")]
    if skipped:
        out += ["", f"**Not checked: {len(skipped)} file(s)** " + "; ".join(f"`{f['path']}` ({f['skipped']})" for f in skipped[:20])]
    for err in rep.get("errors", []):
        out += ["", f"**Couldn't scan `{err['target']}`:** {err['error']}"]
    if not rep.get("complete", True) or not rep["files_scanned"]:
        out += ["", "> This scan is incomplete, so \"no personal data found\" does not cover what wasn't checked."]
    return "\n".join(out) + "\n"


def report_html(rep: dict) -> str:
    """A self-contained HTML report you can email or attach to a ticket."""
    e = html.escape
    rows = []
    for f in rep["files"]:
        if not f["total"]:
            continue
        chips = "".join(f'<span class="c">{e(t)} <b>{n}</b></span>' for t, n in f["counts"].items())
        samples = "".join(f'<li>line {s["line"]}: <code>{e(s["type"])}</code> {e(s["preview"])}</li>' for s in f["samples"])
        rows.append(f'<tr class="{f["risk"]}"><td><i>{f["risk"]}</i></td><td><code>{e(f["path"])}</code>'
                    f'<ul>{samples}</ul></td><td>{f["total"]}</td><td>{chips}</td></tr>')
    totals = "".join(f'<span class="c">{e(t)} <b>{n}</b></span>' for t, n in rep["counts"].items())
    gaps = [f"<li>Couldn't scan <code>{e(x['target'])}</code>: {e(x['error'])}</li>" for x in rep.get("errors", [])]
    gaps += [f"<li>Not checked: <code>{e(f['path'])}</code> ({e(f['skipped'])})</li>" for f in rep["files"] if f.get("skipped")][:50]
    warn = (f'<div class="warn"><b>This scan is incomplete.</b> "No personal data found" does not cover these:<ul>{"".join(gaps)}</ul></div>'
            if gaps or not rep["files_scanned"] else "")
    if not rep["files_scanned"] and not gaps:
        warn = '<div class="warn"><b>No text files were checked.</b></div>'
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PII scan report</title><style>
body{{font:15px/1.55 system-ui,sans-serif;margin:0;background:#f6f8fa;color:#14202b}}main{{max-width:1000px;margin:auto;padding:32px 18px}}
h1{{margin:0 0 4px;font-size:1.8rem}}.meta{{color:#5a6b7b;margin:0 0 20px}}.big{{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}}
.big div{{background:#fff;border:1px solid #dde3e9;border-radius:10px;padding:12px 16px}}.big b{{display:block;font-size:1.6rem}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dde3e9;border-radius:10px;overflow:hidden}}
th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid #eef1f4;vertical-align:top}}th{{font-size:.75rem;text-transform:uppercase;color:#5a6b7b}}
td ul{{margin:6px 0 0;padding-left:18px;color:#5a6b7b;font-size:.85rem}}.c{{display:inline-block;border:1px solid #dde3e9;border-radius:99px;padding:1px 9px;margin:2px;font-size:.8rem}}
tr.high td:first-child i{{background:#ffe1e1;color:#a40000}}tr.medium td:first-child i{{background:#fff1d6;color:#8a5a00}}tr.low td:first-child i{{background:#e6f6ef;color:#0b6b48}}
td:first-child i{{font-style:normal;font-weight:700;font-size:.75rem;border-radius:6px;padding:2px 8px}}code{{word-break:break-all}}
.warn{{background:#fff4e0;border:1px solid #f0c36b;border-radius:10px;padding:12px 16px;margin:0 0 18px}}.warn ul{{margin:6px 0 0}}
</style></head><body><main><h1>PII scan report</h1>
<p class="meta">{e(rep['created'])} · {e(', '.join(rep['targets']))} · {e(rep['mode'])} · scrubpii {e(rep['scrubpii'])}. Values are shown only as short previews.</p>
{warn}<div class="big"><div><b>{rep['total']}</b>items found</div><div><b>{rep['files_with_pii']}</b>files with personal data</div><div><b>{rep['files_scanned']}</b>files scanned</div></div>
<p>{totals}</p><table><thead><tr><th>Risk</th><th>File</th><th>Items</th><th>Types</th></tr></thead><tbody>{''.join(rows) or '<tr><td colspan="4">No personal data found in the files checked.</td></tr>'}</tbody></table>
</main></body></html>
"""


def main(argv: List[str]) -> int:
    import argparse
    import sys
    ap = argparse.ArgumentParser(prog="scrubpii scan", description="Find personal data in folders, files, S3 and GCS.")
    ap.add_argument("targets", nargs="+", help="folders, files, s3://bucket/prefix or gs://bucket/prefix")
    ap.add_argument("--fast", action="store_true", help="rules only: much faster, but no names or addresses")
    ap.add_argument("--include", action="append", help='only these files, e.g. "*.csv" (can repeat)')
    ap.add_argument("--exclude", action="append", default=[], help='skip these, e.g. "tests/*" (can repeat)')
    ap.add_argument("--min-score", type=float, default=0.5)
    ap.add_argument("--max-bytes", type=int, default=5_000_000, help="skip files bigger than this")
    ap.add_argument("--report", help="write a report: .html, .md or .json (by extension)")
    ap.add_argument("--format", choices=("text", "md", "json"), default="text", help="what to print (default: text)")
    ap.add_argument("--fail", action="store_true", help="exit with status 1 if anything is found (for CI)")
    ap.add_argument("--fail-on", help="only fail for these types, comma separated (e.g. SSN,CREDIT_CARD,API_KEY)")
    ap.add_argument("--allow-skipped", action="store_true",
                    help="with --fail: don't fail because some files were too big or unreadable")
    a = ap.parse_args(argv)
    rep = scan(a.targets, a.fast, a.min_score, include=a.include, exclude=a.exclude, max_bytes=a.max_bytes)
    if a.report:
        ext = os.path.splitext(a.report)[1].lower()
        body = report_html(rep) if ext in (".html", ".htm") else json.dumps(rep, indent=2) if ext == ".json" else report_markdown(rep)
        Path(a.report).write_text(body, encoding="utf-8")
    if a.format == "json":
        sys.stdout.write(json.dumps(rep, indent=2) + "\n")
    elif a.format == "md":
        sys.stdout.write(report_markdown(rep))
    else:
        for f in rep["files"]:
            if f["total"]:
                types = ", ".join(f"{t} {n}" for t, n in f["counts"].items())
                print(f"{f['risk']:>6}  {f['path']}  ({types})")
        print(f"{rep['total']} item(s) of personal data in {rep['files_with_pii']} of {rep['files_scanned']} file(s).")
    # "Checked and found nothing" is not the same as "couldn't check": say so, and fail CI for it.
    for e in rep["errors"]:
        print(f"scrubpii scan: couldn't scan {e['target']}: {e['error']}", file=sys.stderr)
    if rep["files_skipped"]:
        print(f"scrubpii scan: {rep['files_skipped']} file(s) were not checked (too big or unreadable); "
              f"see the report, or raise --max-bytes.", file=sys.stderr)
    if not rep["errors"] and not rep["files_scanned"]:
        print("scrubpii scan: no text files were checked.", file=sys.stderr)
    if rep["errors"]:
        return 2
    if a.fail or a.fail_on:
        bad = set(t.strip().upper() for t in a.fail_on.split(",")) if a.fail_on else None
        hit = any(t in bad for t in rep["counts"]) if bad else rep["total"] > 0
        if hit:
            return 1
        if not rep["files_scanned"] or (rep["files_skipped"] and not a.allow_skipped):
            return 2
    return 0
