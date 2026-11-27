"""Your own rules, the allow list and the audit report (no model needed)."""
import json

import pytest

import scrubpii as cp
from test_rules import fake_model


@pytest.fixture(autouse=True)
def clean():
    cp.clear_rules()
    yield
    cp.clear_rules()


def test_add_rule_context_and_words(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([("PERSON", "Sarah Johnson", 0.99)]))
    cp.add_rule("employee id", r"\bEMP-\d{6}\b")
    cp.add_rule("MEMBER_ID", r"\b\d{8}\b", context=["member"])
    cp.add_rule("ticket", r"ticket #(\d+)", group=1, ignore_case=True)
    cp.add_words("CLIENT", ["Globex", "Initech Corp"])
    text = "Order 87654321: Sarah Johnson (EMP-004211), member 12345678, Ticket #991, initech corp."
    assert cp.redact(text) == ("Order 87654321: [PERSON] ([EMPLOYEE_ID]), member [MEMBER_ID], "
                               "Ticket #[TICKET], [CLIENT].")
    assert [r["type"] for r in cp.rules()] == ["EMPLOYEE_ID", "MEMBER_ID", "TICKET", "CLIENT"]
    safe, key = cp.tokenize(text)
    assert "<EMPLOYEE_ID_1>" in safe and cp.restore(safe, key) == text


def test_custom_rule_wins_over_model(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([("ID_NUMBER", "EMP-004211", 0.8)]))
    cp.add_rule("EMPLOYEE_ID", r"\bEMP-\d{6}\b")
    [e] = cp.find("badge EMP-004211")
    assert (e.type, e.source) == ("EMPLOYEE_ID", "custom")


def test_check_and_bad_args(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    cp.add_rule("CODE", r"\b\d{4}\b", check=lambda s: s.startswith("9"))
    assert cp.redact("1234 and 9876") == "1234 and [CODE]"
    with pytest.raises(ValueError):
        cp.add_rule("X", r"\d+", group=1)
    with pytest.raises(ValueError):
        cp.add_rule("123", r"\d+")


def test_allow(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    cp.allow("help@acme.com")
    cp.allow(pattern=r".+@acme\.org")
    assert cp.redact("a@b.com, help@acme.com, x@acme.org") == "[EMAIL], help@acme.com, x@acme.org"


def test_load_rules(tmp_path, monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    p = tmp_path / "rules.json"
    p.write_text(json.dumps({"rules": [{"type": "EMPLOYEE_ID", "pattern": r"\bEMP-\d{6}\b"}],
                             "words": {"CLIENT": ["Globex"]}, "allow": ["help@acme.com"]}))
    assert cp.load_rules(str(p)) == 3
    assert cp.redact("EMP-000001 at Globex, help@acme.com") == "[EMPLOYEE_ID] at [CLIENT], help@acme.com"


def test_audit(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([("PERSON", "Sarah Johnson", 0.83),
                                                           ("PERSON", "Tuesday", 0.31),
                                                           ("CREDIT_CARD", "1234 5678 9012 3456", 0.6)]))
    text = "Sarah Johnson paid on Tuesday with 1234 5678 9012 3456, email sj@example.com."
    rep = cp.audit(text)
    assert rep["redacted"] == "[PERSON] paid on Tuesday with 1234 5678 9012 3456, email [EMAIL]."
    assert rep["counts"] == {"EMAIL": 1, "PERSON": 1}
    by = {i["type"]: i for i in rep["items"]}
    assert by["PERSON"]["confidence"] == "medium" and by["PERSON"]["source"] == "model"
    assert by["EMAIL"]["source"] == "rule" and "email" in by["EMAIL"]["reason"]
    left = {i["preview"]: i["reason"] for i in rep["left_visible"]}
    assert any("below min_score" in r for r in left.values())
    assert any("Luhn" in r for r in left.values())
    assert "Sarah" not in json.dumps(rep).replace(rep["redacted"], "")     # no personal data unless asked
    assert cp.audit(text, include_values=True)["items"][0]["text"] == "Sarah Johnson"
    md = cp.audit_markdown(rep)
    assert "| PERSON |" in md and "Looked at, left visible" in md


def test_cli_audit(monkeypatch, capsys, tmp_path):
    from scrubpii import cli
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    p = tmp_path / "r.json"
    p.write_text(json.dumps({"rules": [{"type": "EMPLOYEE_ID", "pattern": r"EMP-\d+"}]}))
    cli.main(["--rules", str(p), "--audit", "EMP-12 wrote to a@b.com"])
    rep = json.loads(capsys.readouterr().out)
    assert rep["redacted"] == "[EMPLOYEE_ID] wrote to [EMAIL]"
    cli.main(["--audit", "--audit-format", "md", "a@b.com"])
    assert "# scrubpii audit" in capsys.readouterr().out
