"""JSON, CSV, pandas, Guard, batching and the HTTP API, with a fake model."""
import json
import re

import pytest

import chad_pii as cp

NAMES = ["Sarah Johnson", "Raj Patel"]


class FakePipeline:
    """Tags the known names as PERSON; emails are left to the model too."""
    def _one(self, text):
        out = []
        for n in NAMES:
            for m in re.finditer(re.escape(n), text):
                out.append({"entity_group": "PERSON", "start": m.start(), "end": m.end(), "score": 0.99})
        for m in re.finditer(r"\S+@\S+\.\w+", text):
            out.append({"entity_group": "EMAIL", "start": m.start(), "end": m.end(), "score": 0.98})
        return sorted(out, key=lambda i: i["start"])

    def __call__(self, x, batch_size=None):
        return [self._one(t) for t in x] if isinstance(x, list) else self._one(x)


@pytest.fixture(autouse=True)
def fake(monkeypatch):
    monkeypatch.setattr(cp, "_get_pipeline", lambda model: FakePipeline())


def test_find_many_matches_find():
    texts = ["Call Sarah Johnson at 6626341142.", "", "Raj Patel: raj@x.com"]
    many = cp.find_many(texts)
    assert [[(e.type, e.text) for e in f] for f in many] == [[(e.type, e.text) for e in cp.find(t)] for t in texts]
    assert cp.redact_many(texts) == ["Call [PERSON] at [PHONE].", "", "[PERSON]: [EMAIL]"]


def test_json():
    data = {"user": {"name": "Sarah Johnson", "email": "sarah@x.com", "age": 41}, "notes": ["Raj Patel called", 3]}
    out = cp.redact_json(data)
    assert out == {"user": {"name": "[PERSON]", "email": "[EMAIL]", "age": 41}, "notes": ["[PERSON] called", 3]}
    assert data["user"]["name"] == "Sarah Johnson"          # original untouched
    only = cp.redact_json(data, fields=["email"])
    assert only["user"] == {"name": "Sarah Johnson", "email": "[EMAIL]", "age": 41}


def test_csv_tokens_shared_key():
    text = 'name,email,order\nSarah Johnson,sarah@x.com,88213\n"Patel, Raj",raj@x.com,77120\nSarah Johnson,sarah@x.com,1\n'
    out = cp.redact_csv(text, mode="token")
    lines = out.splitlines()
    assert lines[0] == "name,email,order"
    assert lines[1] == "<PERSON_1>,<EMAIL_1>,88213"
    assert lines[3] == "<PERSON_1>,<EMAIL_1>,1"            # same value, same token across cells
    assert cp.redact_csv(text, columns=["email"]).splitlines()[1] == "Sarah Johnson,[EMAIL],88213"


def test_dataframe():
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame({"name": ["Sarah Johnson", None], "n": [1, 2]})
    out = cp.redact_dataframe(df)
    assert out["name"].tolist()[0] == "[PERSON]" and out["n"].tolist() == [1, 2] and df["name"][0] == "Sarah Johnson"


def test_guard_keeps_tokens_across_turns():
    g = cp.Guard()
    a = g.scrub("Email Sarah Johnson at sarah@x.com")
    b = g.scrub("Also cc Raj Patel and Sarah Johnson")
    assert a == "Email <PERSON_1> at <EMAIL_1>" and b == "Also cc <PERSON_2> and <PERSON_1>"
    echo = g.wrap(lambda p: "Reply to " + p)
    assert echo("Ask Sarah Johnson") == "Reply to Ask Sarah Johnson"


def test_tokenize_with_existing_key():
    _, key = cp.tokenize("Sarah Johnson")
    safe, key = cp.tokenize("Raj Patel and Sarah Johnson", key=key)
    assert safe == "<PERSON_2> and <PERSON_1>"


def test_new_type_fakes():
    for t in ("ADDRESS", "ID_NUMBER", "DATE_OF_BIRTH", "USERNAME", "PASSWORD"):
        f = cp.fake_for(cp.Entity(t, "x", 0, 1, 1.0))
        assert f and not f.startswith("[")


def test_server():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from chad_pii.server import app
    c = TestClient(app)
    assert c.get("/health").json()["ok"]
    r = c.post("/redact", json={"text": "Sarah Johnson, sarah@x.com", "mode": "token"}).json()
    assert r["text"] == "<PERSON_1>, <EMAIL_1>"
    assert c.post("/restore", json={"text": r["text"], "key": r["key"]}).json()["text"] == "Sarah Johnson, sarah@x.com"


def test_cli_file(tmp_path, capsys):
    from chad_pii.cli import main
    f = tmp_path / "x.json"
    f.write_text(json.dumps([{"who": "Sarah Johnson"}]))
    main(["--file", str(f)])
    assert json.loads(capsys.readouterr().out) == [{"who": "[PERSON]"}]
