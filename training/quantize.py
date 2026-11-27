"""Make the small in-browser copy of the model and pick the 8-bit variant that
behaves most like the full model.

The full ONNX export is ~260 MB, too big for a web page, so it is quantized to
8 bits (~65 MB). Quantizing changes the model slightly, and how much depends
on the method, so several methods are tried and each is compared token by
token with the full model on a few hundred generated sentences, short and
long. The closest one under the size limit wins.

Usage: python training/quantize.py build/onnx models/pii-distilbert-v2/onnx/model_quantized.onnx
"""
import json
import random
import shutil
import sys
from pathlib import Path

import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
import retrain_pii  # noqa: E402  (sentence generator)

MAX_MB = 90


def texts(n=300):
    retrain_pii.R.seed(99)
    short = [retrain_pii.make_example(retrain_pii.TEST_TEMPLATES)[0] for _ in range(n)]
    rnd = random.Random(7)
    # Long texts too: quantization errors show up more over many tokens.
    long = [" ".join(rnd.sample(short, 8)) for _ in range(n // 6)]
    return short + long


def main(src_dir, dest):
    src = Path(src_dir) / "model.onnx"
    tok = AutoTokenizer.from_pretrained(src_dir)
    full = ort.InferenceSession(str(src))
    names = [i.name for i in full.get_inputs()]
    encs = [{k: v for k, v in tok(t, return_tensors="np", truncation=True, max_length=512).items() if k in names}
            for t in texts()]
    ref = [full.run(None, e)[0][0].argmax(-1) for e in encs]
    o = int(json.loads((Path(src_dir) / "config.json").read_text())["label2id"]["O"])
    total = sum(len(r) for r in ref)
    # Positions where the full model sees personal data matter most.
    ref_pii = sum(int((r != o).sum()) for r in ref)

    model = onnx.load(str(src))
    classifier = [n.name for n in model.graph.node if n.op_type in ("MatMul", "Gemm", "Add") and "classifier" in n.name]
    variants = {
        "qint8_per_channel": dict(weight_type=QuantType.QInt8, per_channel=True),
        "qint8_per_channel_keep_classifier": dict(weight_type=QuantType.QInt8, per_channel=True, nodes_to_exclude=classifier),
        "qint8_per_channel_reduce_range": dict(weight_type=QuantType.QInt8, per_channel=True, reduce_range=True),
        "quint8": dict(weight_type=QuantType.QUInt8),
        "qint8_matmul_only": dict(weight_type=QuantType.QInt8, per_channel=True, op_types_to_quantize=["MatMul"]),
    }
    best = None
    out_dir = Path(src_dir) / "variants"
    out_dir.mkdir(exist_ok=True)
    for name, kw in variants.items():
        out = out_dir / f"{name}.onnx"
        try:
            quantize_dynamic(str(src), str(out), **kw)
        except Exception as e:  # a variant this onnxruntime can't make is just skipped
            print(f"{name}: skipped ({e})")
            continue
        mb = out.stat().st_size / 1e6
        sess = ort.InferenceSession(str(out))
        preds = [sess.run(None, e)[0][0].argmax(-1) for e in encs]
        agree = sum(int((p == r).sum()) for p, r in zip(preds, ref))
        agree_pii = sum(int(((p == r) & (r != o)).sum()) for p, r in zip(preds, ref))
        print(f"{name}: {mb:.0f} MB, {agree / total:.2%} of tokens match, "
              f"{agree_pii / max(ref_pii, 1):.2%} of personal-data tokens match")
        if mb <= MAX_MB and (best is None or (agree_pii, agree) > best[1:]):
            best = (name, agree_pii, agree)
    print("Using", best[0])
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(out_dir / f"{best[0]}.onnx", dest)


if __name__ == "__main__":
    main(*sys.argv[1:3])
