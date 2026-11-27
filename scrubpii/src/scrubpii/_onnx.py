"""Run the model with ONNX Runtime: no PyTorch or transformers needed.

Downloads three files from the model's Hugging Face repo on first use (about
66 MB: the 8-bit ONNX model, its tokenizer and its config) and caches them,
so later runs start fast and work offline.

The result matches transformers' token-classification pipeline with
aggregation_strategy="max": each word takes the label of its most confident
piece, and B-/I- words of one type join into one item.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List

import numpy as np

ONNX_FILES = ("onnx/model_quantized.onnx", "onnx/model.onnx")


def _fetch(model: str, name: str) -> str:
    local = Path(model) / name
    if local.exists():
        return str(local)
    if Path(model).is_dir():
        raise FileNotFoundError(local)
    from huggingface_hub import hf_hub_download
    return hf_hub_download(model, name)


class OnnxTagger:
    """Callable like a transformers pipeline: tagger(text) or tagger([texts], batch_size=16)."""

    def __init__(self, model: str, window: int = 128, stride: int = 32):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.tok = Tokenizer.from_file(_fetch(model, "tokenizer.json"))
        self.tok.no_padding()
        self.tok.no_truncation()
        cfg = json.loads(Path(_fetch(model, "config.json")).read_text())
        self.labels = [cfg["id2label"][str(i)] for i in range(len(cfg["id2label"]))]
        path = None
        for name in ONNX_FILES:
            try:
                path = _fetch(model, name)
                break
            except Exception:
                continue
        if path is None:
            raise FileNotFoundError(f"no ONNX model in {model} (looked for {', '.join(ONNX_FILES)})")
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        threads = int(os.environ.get("SCRUBPII_THREADS", "0"))
        if threads:
            opts.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
        self.inputs = {i.name for i in self.sess.get_inputs()}
        self.cls = self.tok.token_to_id("[CLS]")
        self.sep = self.tok.token_to_id("[SEP]")
        self.pad = self.tok.token_to_id("[PAD]") or 0
        self.body = max(window - 2, 8)
        self.step = max(self.body - stride, 1)

    # ------------------------------------------------------------ public
    def __call__(self, texts, batch_size: int = 16):
        single = isinstance(texts, str)
        texts = [texts] if single else list(texts)
        encs = self.tok.encode_batch(texts, add_special_tokens=False)
        windows = []                       # (text index, start token, length)
        for t, enc in enumerate(encs):
            n = len(enc.ids)
            starts = list(range(0, max(n - self.body, 0) + 1, self.step))
            if starts and starts[-1] + self.body < n:
                starts.append(n - self.body)
            windows += [(t, s, min(self.body, n - s)) for s in (starts or [0]) if n]
        best = [dict() for _ in texts]     # token -> (centrality, probs)
        windows.sort(key=lambda w: w[2])   # similar lengths together: less padding
        for b in range(0, len(windows), batch_size):
            chunk = windows[b:b + batch_size]
            width = max(w[2] for w in chunk) + 2
            ids = np.full((len(chunk), width), self.pad, dtype=np.int64)
            mask = np.zeros((len(chunk), width), dtype=np.int64)
            for r, (t, s, L) in enumerate(chunk):
                ids[r, :L + 2] = [self.cls] + encs[t].ids[s:s + L] + [self.sep]
                mask[r, :L + 2] = 1
            feed = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self.inputs:
                feed["token_type_ids"] = np.zeros_like(ids)
            logits = self.sess.run(None, {k: v for k, v in feed.items() if k in self.inputs})[0]
            logits = logits - logits.max(-1, keepdims=True)
            probs = np.exp(logits)
            probs /= probs.sum(-1, keepdims=True)
            for r, (t, s, L) in enumerate(chunk):
                seen = best[t]
                for p in range(L):
                    central = min(p, L - 1 - p)
                    if (s + p) not in seen or central > seen[s + p][0]:
                        seen[s + p] = (central, probs[r, p + 1])
        out = [self._group(texts[t], encs[t], best[t]) for t in range(len(texts))]
        return out[0] if single else out

    # ------------------------------------------------------------ helpers
    def _group(self, text: str, enc, probs: Dict[int, tuple]) -> List[dict]:
        words = []                          # [start, end, label, score]
        current = None
        for i, w in enumerate(enc.word_ids):
            if i not in probs:
                continue
            p = probs[i][1]
            k = int(p.argmax())
            s, e = enc.offsets[i]
            if current is None or w is None or w != current[4]:
                current = [s, e, k, float(p[k]), w]
                words.append(current)
            else:
                current[1] = e
                if p[k] > current[3]:       # "max": the word's most confident piece decides
                    current[2], current[3] = k, float(p[k])
        items, group = [], None
        for s, e, k, score, _ in words:
            label = self.labels[k]
            if label == "O":
                group = None
                continue
            bi, typ = (label.split("-", 1) + [""])[:2] if "-" in label else ("I", label)
            if group is not None and group["entity_group"] == typ and bi != "B":
                group["end"] = e
                group["_scores"].append(score)
            else:
                group = {"entity_group": typ, "start": s, "end": e, "_scores": [score]}
                items.append(group)
        for g in items:
            sc = g.pop("_scores")
            g["score"] = sum(sc) / len(sc)
            g["word"] = text[g["start"]:g["end"]]
        return items
