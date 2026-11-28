"""The Presidio plug-in (skipped when presidio-analyzer isn't installed)."""
import pytest

pytest.importorskip("presidio_analyzer")

import scrubpii as cp  # noqa: E402
from scrubpii.presidio import ScrubpiiRecognizer, add_to  # noqa: E402
from test_rules import fake_model  # noqa: E402


def test_recognizer(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([("PERSON", "Sarah Johnson", 0.97)]))
    cp.clear_rules()
    cp.teach("redact any ###-RC as rc code")
    rec = ScrubpiiRecognizer()
    res = rec.analyze("Sarah Johnson, sarah@x.com, ref 123-RC", entities=[])
    got = {(r.entity_type, r.start, r.end) for r in res}
    assert ("PERSON", 0, 13) in got and ("EMAIL_ADDRESS", 15, 26) in got and ("RC_CODE", 32, 38) in got
    assert all("scrubpii" in r.analysis_explanation.textual_explanation for r in res)
    assert [r.entity_type for r in rec.analyze("Sarah Johnson, sarah@x.com", entities=["PERSON"])] == ["PERSON"]
    cp.clear_rules()


def test_add_to():
    class Reg:
        def __init__(self):
            self.recognizers = [type("SpacyRecognizer", (), {})(), type("EmailRecognizer", (), {})()]

        def add_recognizer(self, r):
            self.recognizers.append(r)

    class Engine:
        supported_languages = ["en", "xx"]
        registry = Reg()

    eng = add_to(Engine(), replace_ner=True)
    names = [type(r).__name__ for r in eng.registry.recognizers]
    assert names == ["EmailRecognizer", "ScrubpiiRecognizer"]
