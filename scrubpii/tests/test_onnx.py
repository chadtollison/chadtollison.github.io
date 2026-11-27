"""The ONNX backend on the real 8-bit model, if the repo copy is present."""
from pathlib import Path

import pytest

import scrubpii

MODEL = Path(__file__).resolve().parents[2] / "models" / "pii-distilbert-v3"
pytestmark = pytest.mark.skipif(not (MODEL / "onnx" / "model_quantized.onnx").exists(), reason="no local model")


def test_onnx_backend(monkeypatch):
    pytest.importorskip("onnxruntime")
    monkeypatch.setenv("SCRUBPII_BACKEND", "onnx")
    text = "Hi, I'm Sarah Johnson. Email sarah.j@example.com, password Tr0ub4dor&3."
    found = {(e.type, e.text) for e in scrubpii.find(text, model=str(MODEL))}
    assert ("PERSON", "Sarah Johnson") in found and ("EMAIL", "sarah.j@example.com") in found
    assert ("PASSWORD", "Tr0ub4dor&3") in found
    long = "Nothing to see here. " * 200 + "Call Priya Raman at 917-555-0133."
    assert scrubpii.redact(long, model=str(MODEL)).endswith("Call [PERSON] at [PHONE].")
    many = scrubpii.find_many([text, "", long], model=str(MODEL))
    assert len(many) == 3 and many[1] == [] and many[0]
