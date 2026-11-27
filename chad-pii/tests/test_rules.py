"""Tests that don't need the model: a fake pipeline stands in for it."""
import chad_pii as cp


def fake_model(found):
    def run(text, model):
        out = []
        for typ, s, score in found:
            i = text.index(s)
            out.append(cp.Entity(typ, s, i, i + len(s), score))
        return out
    return run


def test_checks():
    assert cp.luhn_ok("4111 1111 1111 1111") and not cp.luhn_ok("1234 5678 9012 3456")
    assert cp.iban_ok("GB82 WEST 1234 5698 7654 32") and not cp.iban_ok("GB00 WEST 1234 5698 7654 32")
    assert cp.ssn_ok("123-45-6789") and not cp.ssn_ok("666-45-6789")
    assert cp.us_phone_ok("6626341142") and not cp.us_phone_ok("4567891234")


def test_rules_and_modes(monkeypatch):
    text = "Sarah Johnson: 6626341142, card 1234 5678 9012 3456, key AKIAIOSFODNN7EXAMPLE, IBAN GB82 WEST 1234 5698 7654 32."
    monkeypatch.setattr(cp, "_model_entities", fake_model([("PERSON", "Sarah Johnson", 0.99),
                                                           ("CREDIT_CARD", "1234 5678 9012 3456", 0.9)]))
    found = {(e.type, e.text) for e in cp.find(text)}
    assert found == {("PERSON", "Sarah Johnson"), ("PHONE", "6626341142"),
                     ("API_KEY", "AKIAIOSFODNN7EXAMPLE"), ("IBAN", "GB82 WEST 1234 5698 7654 32")}  # bad card dropped
    assert cp.redact(text) == "[PERSON]: [PHONE], card 1234 5678 9012 3456, key [API_KEY], IBAN [IBAN]."
    safe, key = cp.tokenize(text)
    assert "<PERSON_1>" in safe and cp.restore(safe, key) == text
    fake = cp.redact(text, mode="fake")
    assert "Sarah" not in fake and "6626341142" not in fake and "GB82 WEST" not in fake
    assert cp.redact(text, mode="mask").startswith("█" * 13 + ":")


def test_sure_model_overrides_failed_check(monkeypatch):
    text = "card 1234 5678 9012 3456"
    monkeypatch.setattr(cp, "_model_entities", fake_model([("CREDIT_CARD", "1234 5678 9012 3456", 0.99)]))
    assert cp.redact(text) == "card [CREDIT_CARD]"


def test_grow_partial_email(monkeypatch):
    text = "Email sarah.j@example.com now"
    monkeypatch.setattr(cp, "_model_entities", fake_model([("EMAIL", "sarah.j", 0.8)]))
    assert cp.redact(text) == "Email [EMAIL] now"


def test_card_and_ssn_rules_without_model(monkeypatch):
    text = ("Card 4111-1111-1111-1111, Amex 3782 822463 10005, order 1234567890123, "
            "SSN 219 09 9999, ssn: 078051120, ref 666-12-3456, zip 90210.")
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    found = {(e.type, e.text) for e in cp.find(text)}
    assert found == {("CREDIT_CARD", "4111-1111-1111-1111"), ("CREDIT_CARD", "3782 822463 10005"),
                     ("SSN", "219 09 9999"), ("SSN", "078051120")}
