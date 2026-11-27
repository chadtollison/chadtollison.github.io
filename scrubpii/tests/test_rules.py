"""Tests that don't need the model: a fake pipeline stands in for it."""
import scrubpii as cp


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


def test_date_of_birth_rule(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    for text, dob in [("Jordan, born 03/14/1986, called.", "03/14/1986"), ("DOB: March 14, 1986", "March 14, 1986"),
                      ("fecha de nacimiento: 14 de marzo de 1986", "14 de marzo de 1986")]:
        assert [(e.type, e.text) for e in cp.find(text)] == [("DATE_OF_BIRTH", dob)]
    assert cp.find("Meeting on 03/14/2026.") == []


def test_email_and_ip_rules(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    text = "Mail ana.ruiz@banco.es from 10.0.4.17 or 2001:db8::8a2e:370:7334; not 999.1.1.1, not 10:30:00."
    assert {(e.type, e.text) for e in cp.find(text)} == {("EMAIL", "ana.ruiz@banco.es"), ("IP_ADDRESS", "10.0.4.17"),
                                                        ("IP_ADDRESS", "2001:db8::8a2e:370:7334")}


def test_phone_formats(monkeypatch):
    monkeypatch.setattr(cp, "_model_entities", fake_model([]))
    for t in ["Emergency contact: 1-800-123-4567", "Phone Number: (123) 456-7890", "call us at +1-800-123-4567.",
              "Contact: [+44] 1234567890", "contact us at 800-123-4567 or", "Ring me on +44 20 7946 0958 today"]:
        assert "[PHONE]" in cp.redact(t), t
    for t in ["Order 123-456-7890 shipped", "Version 1.2.3, build 20231127", "Score went +12 points"]:
        assert cp.redact(t) == t, t
