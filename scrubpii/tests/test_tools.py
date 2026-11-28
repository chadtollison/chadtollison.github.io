"""Tests for the log filter, the scanner and the LLM privacy proxy."""
import io
import json
import logging
import sys
import threading
import types
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import scrubpii
from scrubpii import ScrubFilter, find, redact, scrub_logs
from scrubpii.proxy import Scrubber, StreamRestorer, serve
from scrubpii.scan import report_html, report_markdown, scan
from scrubpii.scan import main as scan_main

SECRET = "Email jo@acme.com, card 4111 1111 1111 1111, SSN 123-45-6789, key sk_live_abcdefghijklmnop1234"


# ---------------------------------------------------------------- fast mode
def test_fast_finds_hard_identifiers_without_model():
    types_ = [e.type for e in find(SECRET, fast=True)]
    assert types_ == ["EMAIL", "CREDIT_CARD", "SSN", "API_KEY"]
    assert redact("call 662-634-1142", fast=True) == "call [PHONE]"


# ---------------------------------------------------------------- logs
def _logger(name):
    lg = logging.getLogger(name)
    lg.handlers.clear()
    lg.propagate = False
    buf = io.StringIO()
    h = logging.StreamHandler(buf)
    h.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    lg.addHandler(h)
    lg.setLevel(logging.INFO)
    return lg, buf


def test_log_filter_scrubs_message_and_args():
    lg, buf = _logger("t.args")
    scrub_logs(lg)
    lg.info("signup %s card %s", "jo@acme.com", "4111 1111 1111 1111")
    assert buf.getvalue().strip() == "INFO signup [EMAIL] card [CREDIT_CARD]"


def test_log_filter_scrubs_tracebacks_and_child_loggers():
    lg, buf = _logger("t.tb")
    scrub_logs(lg, mode="mask")
    child = logging.getLogger("t.tb.child")
    child.propagate = True
    try:
        raise ValueError("bad SSN 123-45-6789")
    except ValueError:
        child.exception("failed for jo@acme.com")
    out = buf.getvalue()
    assert "123-45-6789" not in out and "jo@acme.com" not in out
    assert "Traceback" in out and "█" in out


def test_log_filter_added_once():
    lg, _ = _logger("t.once")
    scrub_logs(lg)
    scrub_logs(lg)
    assert sum(isinstance(f, ScrubFilter) for f in lg.handlers[0].filters) == 1


def test_log_filter_model_mode_hides_names():
    lg, buf = _logger("t.model")
    scrub_logs(lg, fast=False)
    lg.info("Refund approved for Sarah Johnson")
    assert "Sarah Johnson" not in buf.getvalue()


# ---------------------------------------------------------------- scan
def _tree(tmp_path):
    (tmp_path / "exports").mkdir()
    (tmp_path / "exports" / "customers.csv").write_text("name,email\nAnn,ann@example.org\nBo,bo@example.org\n")
    (tmp_path / "app.log").write_text("ok\nok\npayment card 4111 1111 1111 1111 declined\n")
    (tmp_path / "clean.txt").write_text("nothing to see here\n")
    (tmp_path / "image.png").write_bytes(b"\x89PNG\x00\x00")
    (tmp_path / "blob.dat").write_bytes(b"\x00\x01binary jo@acme.com")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("email = dev@acme.com")
    return tmp_path


def test_scan_folder(tmp_path):
    rep = scan([str(_tree(tmp_path))], fast=True)
    by = {f["path"].split("/")[-1]: f for f in rep["files"]}
    assert set(by) == {"customers.csv", "app.log", "clean.txt"}        # no binaries, no .git
    assert by["customers.csv"]["counts"] == {"EMAIL": 2} and by["customers.csv"]["risk"] == "low"
    assert by["app.log"]["risk"] == "high" and by["app.log"]["samples"][0]["line"] == 3
    assert rep["total"] == 3 and rep["files_with_pii"] == 2
    assert rep["files"][0]["path"].endswith("app.log")                 # riskiest first
    dumped = json.dumps(rep) + report_html(rep) + report_markdown(rep)
    assert "ann@example.org" not in dumped and "4111 1111 1111 1111" not in dumped


def test_scan_include_exclude_and_cli_fail(tmp_path, capsys):
    root = str(_tree(tmp_path))
    rep = scan([root], fast=True, include=["*.csv"])
    assert [f["path"].split("/")[-1] for f in rep["files"]] == ["customers.csv"]
    report = tmp_path / "r.html"
    assert scan_main([root, "--fast", "--fail", "--report", str(report)]) == 1
    assert "PII scan report" in report.read_text()
    assert scan_main([root, "--fast", "--fail-on", "SSN"]) == 0
    assert scan_main([root, "--fast", "--fail-on", "CREDIT_CARD"]) == 1
    assert "item(s) of personal data" in capsys.readouterr().out


def test_scan_s3_and_gcs(monkeypatch):
    objects = {"logs/a.txt": b"reach me at jo@acme.com", "logs/b.bin": b"\x00\x00", "logs/": b""}

    class Body:
        def __init__(self, b): self.b = b
        def read(self): return self.b

    class S3:
        def get_paginator(self, _):
            return types.SimpleNamespace(paginate=lambda **kw: [{"Contents": [{"Key": k, "Size": len(v)} for k, v in objects.items()]}])
        def get_object(self, Bucket, Key): return {"Body": Body(objects[Key])}

    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=lambda name: S3()))

    class Blob:
        def __init__(self, name, data): self.name, self.size, self.data = name, len(data), data
        def download_as_bytes(self): return self.data

    storage = types.SimpleNamespace(Client=lambda: types.SimpleNamespace(
        list_blobs=lambda bucket, prefix=None: [Blob("x/ssn.txt", b"SSN 123-45-6789")]))
    google = types.ModuleType("google"); cloud = types.ModuleType("google.cloud"); cloud.storage = storage
    google.cloud = cloud
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.cloud", cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.storage", storage)

    rep = scan(["s3://bkt/logs/", "gs://g/x"], fast=True)
    paths = {f["path"]: f for f in rep["files"]}
    assert paths["s3://bkt/logs/a.txt"]["counts"] == {"EMAIL": 1}
    assert paths["gs://g/x/ssn.txt"]["counts"] == {"SSN": 1}
    assert "s3://bkt/logs/b.bin" not in paths


# ---------------------------------------------------------------- proxy
def test_scrubber_walks_openai_and_anthropic_shapes():
    s = Scrubber(fast=True)
    body = {"model": "gpt-x", "messages": [{"role": "user", "content": "mail jo@acme.com"},
                                           {"role": "user", "content": [{"type": "text", "text": "again jo@acme.com"}]}],
            "system": "card 4111 1111 1111 1111"}
    out = s.scrub(body)
    assert out["model"] == "gpt-x" and out["messages"][0]["role"] == "user"
    assert out["messages"][0]["content"] == "mail <EMAIL_1>"
    assert out["messages"][1]["content"][0]["text"] == "again <EMAIL_1>"   # same value, same token
    assert out["system"] == "card <CREDIT_CARD_1>"
    assert s.restore({"x": ["Dear <EMAIL_1>"]}) == {"x": ["Dear jo@acme.com"]}


def test_stream_restorer_handles_split_tokens():
    s = Scrubber(fast=True)
    s.scrub_text("write to jo@acme.com")
    sr = StreamRestorer(s)
    chunks = ["Hi <EM", "AIL_", "1>, thanks", " <"]
    lines = []
    for c in chunks:
        lines += sr.event(json.dumps({"choices": [{"index": 0, "delta": {"content": c}, "finish_reason": None}]}))
    lines += sr.event(json.dumps({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}))
    lines += sr.event("[DONE]")
    text = "".join(json.loads(l[6:])["choices"][0]["delta"].get("content", "") for l in lines if l != "data: [DONE]")
    assert text == "Hi jo@acme.com, thanks <"
    assert lines[-1] == "data: [DONE]"


class _Upstream(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a): pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        _Upstream.seen.append((self.path, self.headers.get("Authorization"), body))
        prompt = body["messages"][-1]["content"]
        tok = prompt[prompt.index("<"):prompt.index(">") + 1]
        if body.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for piece in ["Sure, ", tok[:4], tok[4:], " is noted."]:
                ev = {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": piece}}
                self.wfile.write(f"event: content_block_delta\ndata: {json.dumps(ev)}\n\n".encode())
            self.wfile.write(b'event: message_stop\ndata: {"type": "message_stop"}\n\n')
            return
        out = json.dumps({"choices": [{"message": {"role": "assistant", "content": f"I will email {tok}."}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


@pytest.fixture
def proxy():
    up = ThreadingHTTPServer(("127.0.0.1", 0), _Upstream)
    threading.Thread(target=up.serve_forever, daemon=True).start()
    logs = []
    px = serve(f"http://127.0.0.1:{up.server_port}", port=0, fast=True, log=logs.append)
    threading.Thread(target=px.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{px.server_port}", logs
    px.shutdown(); up.shutdown()


def _post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer sk-test"})
    return urllib.request.urlopen(req, timeout=10)


def test_proxy_round_trip(proxy):
    base, logs = proxy
    _Upstream.seen.clear()
    r = _post(base + "/v1/chat/completions", {"model": "m", "messages": [{"role": "user", "content": "Email jo@acme.com"}]})
    answer = json.loads(r.read())["choices"][0]["message"]["content"]
    path, auth, sent = _Upstream.seen[-1]
    assert path == "/v1/chat/completions" and auth == "Bearer sk-test"
    assert sent["messages"][0]["content"] == "Email <EMAIL_1>"           # the provider never sees it
    assert answer == "I will email jo@acme.com."                         # the app gets it back
    assert "jo@acme.com" not in " ".join(logs) and "EMAIL 1" in logs[-1]


def test_proxy_streaming(proxy):
    base, _ = proxy
    r = _post(base + "/v1/messages", {"model": "m", "stream": True, "messages": [{"role": "user", "content": "card 4111 1111 1111 1111"}]})
    raw = r.read().decode()
    text = "".join(json.loads(l[6:])["delta"]["text"] for l in raw.splitlines()
                   if l.startswith("data: ") and '"content_block_delta"' in l)
    assert text == "Sure, 4111 1111 1111 1111 is noted."
    assert "message_stop" in raw
