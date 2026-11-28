"""The browser tools (privacy-tools: engine.js and the Paste Guard extension) and
this package must find the same things in rules-only mode. The same
fixtures/rules.json runs in both test suites, so the two can't drift apart."""
import json
from pathlib import Path

import pytest

import scrubpii

CASES = json.loads((Path(__file__).parent / "fixtures" / "rules.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["text"][:40] for c in CASES])
def test_rules_match_the_browser(case):
    got = [[e.type, e.text] for e in scrubpii.find(case["text"], fast=True)]
    assert got == case["expect"]
