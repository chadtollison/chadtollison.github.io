"""Rules written in plain English."""
import pytest

import scrubpii as cp
from scrubpii._english import parse
from test_rules import fake_model


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    cp.clear_rules()
    yield
    cp.clear_rules()


def test_chads_example():
    cp.teach("redact any ###-#####-##-RC as a rc code")
    assert cp.redact("Ref 123-45678-90-RC and 123-45678-90-rc, not 12-45678-90-RC") == \
        "Ref [RC_CODE] and [RC_CODE], not 12-45678-90-RC"


@pytest.mark.parametrize("rule,text,out", [
    ("hide codes like AB-1234 as order number", "order AB-9921 sent", "order [ORDER_NUMBER] sent"),
    ('redact 8 digit numbers after "member" as member id', "member no. 12345678, order 87654321",
     "member no. [MEMBER_ID], order 87654321"),
    ("redact anything starting with EMP- as employee id", "by EMP-0042x today", "by [EMPLOYEE_ID] today"),
    ("redact Globex, Initech and Umbrella as client", "Globex and initech", "[CLIENT] and [CLIENT]"),
    ("mask @@-#### as plate", "plate KX-4411", "plate [PLATE]"),
    ("redact 6 to 8 digit numbers near account or acct as account", "acct 1234567; id 1234567",
     "acct [ACCOUNT]; id 1234567"),
    ("Redact any ???-### as ticket.", "see A1B-123", "see [TICKET]"),
    ("redact any ## ## ## as code", "code 12 34 56 ok", "code [CODE] ok"),
])
def test_rules(rule, text, out):
    cp.teach(rule)
    assert cp.redact(text) == out


def test_allow_rules():
    cp.teach("never redact support@acme.com", "don't redact emails at acme.org")
    assert cp.redact("a@b.com, support@acme.com, x@acme.org") == "[EMAIL], support@acme.com, x@acme.org"


def test_explain_and_errors():
    assert "3 digits" in cp.understand("redact any ###-#####-##-RC as an RC code")
    assert "[RC_CODE]" in cp.understand("redact any ###-#####-##-RC as an RC code")
    assert parse("redact any #### as pin").type == "PIN"
    r = cp.teach("redact any ###-## as small code")
    assert r.explain and cp.rules()[0]["explain"]
    with pytest.raises(ValueError):
        cp.teach("redact")
    assert cp.add_rule("redact any ##-RC as rc").type == "RC"     # add_rule takes English too


def test_cli_rule(capsys):
    from scrubpii import cli
    cli.main(["--rule", "redact any ###-#####-##-RC as an RC code", "Ref 123-45678-90-RC"])
    cap = capsys.readouterr()
    assert cap.out.strip() == "Ref [RC_CODE]" and "3 digits" in cap.err


def test_load_rules_say(tmp_path):
    import json
    p = tmp_path / "r.json"
    p.write_text(json.dumps({"say": ["redact any ###-RC as rc code"]}))
    cp.load_rules(str(p))
    assert cp.redact("x 123-RC") == "x [RC_CODE]"
