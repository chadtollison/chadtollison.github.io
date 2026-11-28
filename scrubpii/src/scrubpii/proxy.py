"""A local privacy proxy for LLM APIs.

    scrubpii proxy --upstream https://api.openai.com          # listens on 127.0.0.1:8787
    export OPENAI_BASE_URL=http://127.0.0.1:8787/v1           # point your app or SDK at it

    scrubpii proxy --upstream https://api.anthropic.com
    export ANTHROPIC_BASE_URL=http://127.0.0.1:8787

Every request's prompt text is scrubbed before it leaves your machine: names,
emails, phones, cards and the rest become tokens like <PERSON_1>. The answer
comes back with the real values put back in, streaming included, so your app
sees normal text while the AI provider never sees the personal data.

It understands OpenAI Chat Completions and Responses, Anthropic Messages and
anything shaped like them (Azure OpenAI, OpenRouter, Ollama, vLLM...). Your API
key is passed through untouched. Only the standard library is used.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import MODEL_ID, _apply, find

# String fields that hold prompt text. Everything else (model, role, type, ids,
# settings) is passed through as is.
PROMPT_KEYS = {"content", "text", "system", "prompt", "input", "instructions", "arguments", "query"}
_TOKEN = re.compile(r"<[A-Z_]+_\d+>")
_PARTIAL = re.compile(r"<[A-Z_]*\d*$")          # the end of a chunk that may be the start of a token
PASS_HEADERS = {"authorization", "x-api-key", "api-key", "anthropic-version", "anthropic-beta", "openai-organization",
                "openai-project", "content-type", "accept", "user-agent", "x-stainless-arch", "x-stainless-lang"}


class Scrubber:
    """Scrubs one request and restores its answer. Holds the token key for that request."""

    def __init__(self, fast: bool = False, min_score: float = 0.5, model: str = MODEL_ID):
        self.fast, self.min_score, self.model = fast, min_score, model
        self.key: Dict[str, str] = {}
        self.found: Dict[str, int] = {}

    def scrub_text(self, text: str) -> str:
        ents = find(text, self.min_score, self.model, self.fast)
        for e in ents:
            self.found[e.type] = self.found.get(e.type, 0) + 1
        return _apply(text, ents, "token", self.key)[0]

    def scrub(self, obj: Any, key: Optional[str] = None) -> Any:
        if isinstance(obj, dict):
            return {k: self.scrub(v, k) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.scrub(v, key) for v in obj]
        if isinstance(obj, str) and key in PROMPT_KEYS:
            return self.scrub_text(obj)
        return obj

    def restore_text(self, text: str) -> str:
        return _TOKEN.sub(lambda m: self.key.get(m.group(), m.group()), text) if self.key else text

    def restore(self, obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: self.restore(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.restore(v) for v in obj]
        if isinstance(obj, str):
            return self.restore_text(obj)
        return obj


class StreamRestorer:
    """Restores tokens in a server-sent event stream, even when a token is split
    across two chunks ("<PERS" + "ON_1>"): the possible start of a token is held
    back until the next chunk shows how it ends."""

    def __init__(self, s: Scrubber):
        self.s = s
        self.held: Dict[Tuple, str] = {}
        self.last: Optional[Tuple[dict, Tuple]] = None      # last delta event, to flush into at the end

    @staticmethod
    def _delta_paths(obj: Any, path: Tuple = ()) -> List[Tuple]:
        """Paths of streamed text pieces: OpenAI delta.content, Anthropic delta.text, Responses "delta"."""
        out = []
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = path + (k,)
                if isinstance(v, str) and (k == "delta" or (path and path[-1] == "delta" and k in ("content", "text"))):
                    out.append(p)
                elif isinstance(v, (dict, list)):
                    out += StreamRestorer._delta_paths(v, p)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                out += StreamRestorer._delta_paths(v, path + (i,))
        return out

    @staticmethod
    def _get(obj, path):
        for p in path:
            obj = obj[p]
        return obj

    @staticmethod
    def _set(obj, path, value):
        for p in path[:-1]:
            obj = obj[p]
        obj[path[-1]] = value

    def _slot(self, path: Tuple) -> Tuple:
        return tuple(p for p in path if isinstance(p, int)) or ("_",)

    def _finishing(self, obj: Any) -> bool:
        if not isinstance(obj, dict):
            return False
        if obj.get("type") in ("content_block_stop", "message_delta", "message_stop", "response.output_text.done",
                               "response.completed"):
            return True
        return any(isinstance(c, dict) and c.get("finish_reason") for c in obj.get("choices") or [])

    def flush_events(self) -> List[str]:
        """Events carrying any held-back text, to send before the stream ends."""
        out = []
        if self.last and any(self.held.values()):
            tmpl, path = self.last
            for slot, text in list(self.held.items()):
                if text:
                    ev = json.loads(json.dumps(tmpl))
                    self._set(ev, path, self.s.restore_text(text))
                    out.append("data: " + json.dumps(ev, ensure_ascii=False))
                    self.held[slot] = ""
        return out

    def event(self, data: str) -> List[str]:
        """One `data:` payload in, the lines to send out."""
        if data.strip() == "[DONE]":
            return self.flush_events() + ["data: [DONE]"]
        try:
            obj = json.loads(data)
        except ValueError:
            return ["data: " + self.s.restore_text(data)]
        pre = self.flush_events() if self._finishing(obj) else []
        paths = self._delta_paths(obj)
        for path in paths:
            slot = self._slot(path)
            text = self.held.get(slot, "") + self._get(obj, path)
            m = _PARTIAL.search(text)
            keep = m.group() if m and len(m.group()) <= 40 else ""
            text = text[: len(text) - len(keep)] if keep else text
            self.held[slot] = keep
            self._set(obj, path, self.s.restore_text(text))
            self.last = (json.loads(json.dumps(obj)), path)
            self._set(self.last[0], path, "")
        # Whole strings outside the streamed deltas (e.g. a final "text") are restored as they are.
        if not paths:
            obj = self.s.restore(obj)
        return pre + ["data: " + json.dumps(obj, ensure_ascii=False)]


def make_handler(upstream: str, fast: bool = False, min_score: float = 0.5, model: str = MODEL_ID,
                 log: Callable[[str], None] = lambda m: print(m, file=sys.stderr, flush=True),
                 opener: Callable = urllib.request.urlopen):
    upstream = upstream.rstrip("/")

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):          # quiet; we log our own one-liners
            pass

        def _forward(self, method: str):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b""
            s = Scrubber(fast, min_score, model)
            if body and "json" in (self.headers.get("Content-Type") or "json"):
                try:
                    body = json.dumps(s.scrub(json.loads(body)), ensure_ascii=False).encode()
                except ValueError:
                    pass
            headers = {k: v for k, v in self.headers.items() if k.lower() in PASS_HEADERS}
            headers["Accept-Encoding"] = "identity"
            req = urllib.request.Request(upstream + self.path, data=body if method != "GET" else None,
                                         headers=headers, method=method)
            found = ", ".join(f"{t} {c}" for t, c in sorted(s.found.items())) or "nothing"
            log(f"{method} {self.path}: hid {sum(s.found.values())} item(s) ({found})")
            try:
                resp = opener(req, timeout=600)
            except urllib.error.HTTPError as e:
                resp = e
            except urllib.error.URLError as e:
                return self._send(502, {"error": {"message": f"scrubpii proxy could not reach {upstream}: {e.reason}"}})
            ctype = resp.headers.get("Content-Type", "")
            status = getattr(resp, "status", None) or resp.getcode()
            if "text/event-stream" in ctype:
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                sr = StreamRestorer(s)
                for raw in resp:
                    line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                    out = sr.event(line[5:].lstrip()) if line.startswith("data:") else [line]
                    self._chunk("\n".join(out) + "\n")
                self._chunk("")
                return
            data = resp.read()
            if "json" in ctype:
                try:
                    data = json.dumps(s.restore(json.loads(data)), ensure_ascii=False).encode()
                except ValueError:
                    pass
            else:
                data = s.restore_text(data.decode("utf-8", errors="replace")).encode()
            self.send_response(status)
            self.send_header("Content-Type", ctype or "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _chunk(self, text: str):
            b = text.encode()
            self.wfile.write(f"{len(b):x}\r\n".encode() + b + b"\r\n")
            self.wfile.flush()

        def _send(self, status: int, obj: dict):
            b = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_POST(self):
            self._forward("POST")

        def do_GET(self):
            if self.path in ("/", "/health"):
                return self._send(200, {"ok": True, "upstream": upstream, "service": "scrubpii proxy"})
            self._forward("GET")

    return Handler


def serve(upstream: str, host: str = "127.0.0.1", port: int = 8787, **kw) -> ThreadingHTTPServer:
    """Create the proxy server (call .serve_forever() on it)."""
    return ThreadingHTTPServer((host, port), make_handler(upstream, **kw))


def main(argv: List[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="scrubpii proxy", description="Hide personal data from LLM APIs.")
    ap.add_argument("--upstream", default="https://api.openai.com",
                    help="the real API, e.g. https://api.openai.com or https://api.anthropic.com")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--fast", action="store_true", help="rules only (no model): faster, but names are not hidden")
    ap.add_argument("--min-score", type=float, default=0.5)
    a = ap.parse_args(argv)
    srv = serve(a.upstream, a.host, a.port, fast=a.fast, min_score=a.min_score)
    base = f"http://{a.host}:{a.port}"
    print(f"scrubpii proxy on {base} -> {a.upstream}", file=sys.stderr)
    print(f"  OpenAI:    export OPENAI_BASE_URL={base}/v1", file=sys.stderr)
    print(f"  Anthropic: export ANTHROPIC_BASE_URL={base}", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
