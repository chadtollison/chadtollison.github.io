"""Redact structured data: JSON-like objects, CSV text or files, pandas DataFrames.

All of them collect every string first and run the model once over the
batch, which is far faster than redacting value by value.
"""
from __future__ import annotations

import csv
import io
from typing import Any, Dict, Iterable, List, Optional

from . import MODEL_ID, _apply, find_many


def _redact_strings(values: List[str], mode: str, min_score: float, model: str,
                    key: Optional[Dict[str, str]]) -> List[str]:
    found = find_many(values, min_score, model)
    return [_apply(v, ents, mode, key)[0] for v, ents in zip(values, found)]


def redact_json(obj: Any, mode: str = "label", fields: Optional[Iterable[str]] = None, min_score: float = 0.5,
                model: str = MODEL_ID, key: Optional[Dict[str, str]] = None) -> Any:
    """Return a copy of a JSON-like object (dicts, lists, strings) with personal data redacted.

    fields: only redact string values under these keys (anywhere in the tree).
    Keys themselves and non-string values are left alone.
    """
    fields = set(fields) if fields else None
    paths, values = [], []

    def walk(x, path, field):
        if isinstance(x, dict):
            for k, v in x.items():
                walk(v, path + [k], k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, path + [i], field)
        elif isinstance(x, str) and (fields is None or field in fields):
            paths.append(path)
            values.append(x)

    walk(obj, [], None)
    import copy
    out = copy.deepcopy(obj)
    if key is None and mode == "token":
        key = {}
    for path, new in zip(paths, _redact_strings(values, mode, min_score, model, key)):
        if not path:
            return new
        target = out
        for p in path[:-1]:
            target = target[p]
        target[path[-1]] = new
    return out


def redact_csv(text: str, mode: str = "label", columns: Optional[Iterable[str]] = None, min_score: float = 0.5,
               model: str = MODEL_ID, key: Optional[Dict[str, str]] = None) -> str:
    """Redact CSV text. The header row is kept; `columns` limits which columns are redacted."""
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return text
    header, body = rows[0], rows[1:]
    cols = [i for i, h in enumerate(header) if columns is None or h in set(columns)]
    cells = [(r, c) for r in range(len(body)) for c in cols if c < len(body[r]) and body[r][c].strip()]
    if key is None and mode == "token":
        key = {}
    for (r, c), new in zip(cells, _redact_strings([body[r][c] for r, c in cells], mode, min_score, model, key)):
        body[r][c] = new
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows([header] + body)
    return buf.getvalue()


def redact_dataframe(df, columns: Optional[Iterable[str]] = None, mode: str = "label", min_score: float = 0.5,
                     model: str = MODEL_ID, key: Optional[Dict[str, str]] = None):
    """Return a copy of a pandas DataFrame with personal data redacted in text columns.

    columns: which columns to redact (default: every column of strings).
    """
    out = df.copy()
    if columns is None:
        from pandas.api.types import is_object_dtype, is_string_dtype
        columns = [c for c in out.columns if is_object_dtype(out[c]) or is_string_dtype(out[c])]
    if key is None and mode == "token":
        key = {}
    for c in columns:
        mask = out[c].map(lambda v: isinstance(v, str) and bool(v.strip()))
        vals = out.loc[mask, c].tolist()
        out.loc[mask, c] = _redact_strings(vals, mode, min_score, model, key)
    return out
