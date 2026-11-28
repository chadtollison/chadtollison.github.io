"""The benchmark scorer must not reward unsafe redaction.

    cd training && python -m pytest test_compare.py
"""
import compare

TEXT = "Email maria.lopez@lopezdesign.co or call 312-555-0147 today."
GOLD = [(6, 31, "EMAIL"), (40, 52, "PHONE")]
ROWS = [(TEXT, GOLD)]


def run(fn):
    return compare.score(lambda t, lang="en": fn(t), ROWS)


def test_one_character_per_item_is_not_safe():
    r = run(lambda t: [(s, s + 1, ty) for s, _, ty in GOLD])
    assert r["touch_f1"] == 1.0          # the lenient score is fooled...
    assert r["fully_hidden"] == 0.0      # ...the strict one is not
    assert r["strict_f1"] == 0.0


def test_redacting_everything_is_not_precise():
    r = run(lambda t: [(0, len(t), "X")])
    assert r["fully_hidden"] == 1.0
    assert r["char_precision"] < 0.75
    assert r["strict_f1"] < 0.85


def test_perfect_redaction_scores_one():
    r = run(lambda t: list(GOLD))
    assert r["fully_hidden"] == r["char_precision"] == r["strict_f1"] == 1.0


def test_half_an_item_is_not_hidden():
    r = run(lambda t: [(6, 18, "EMAIL"), (40, 52, "PHONE")])
    assert r["fully_hidden"] == 0.5
    assert r["by_type"]["EMAIL"]["fully_hidden"] == 0.0


def test_nothing_found():
    r = run(lambda t: [])
    assert r["fully_hidden"] == r["strict_f1"] == r["caught"] == 0.0
