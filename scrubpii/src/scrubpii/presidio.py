"""Use scrubpii inside Microsoft Presidio.

    from presidio_analyzer import AnalyzerEngine
    from scrubpii.presidio import add_to

    analyzer = AnalyzerEngine()
    add_to(analyzer)                     # scrubpii now runs with Presidio's own recognizers
    results = analyzer.analyze(text, language="en")

Results use Presidio's entity names (PERSON, EMAIL_ADDRESS, PHONE_NUMBER,
US_SSN ...), so Presidio's anonymizer and the rest of your setup keep working.
add_to(analyzer, replace_ner=True) also removes Presidio's spaCy name finder,
which is where most of its false alarms come from; scrubpii finds names instead.
Your own scrubpii rules (teach, add_rule ...) come through too.
"""
from __future__ import annotations

from typing import List, Optional

from presidio_analyzer import AnalysisExplanation, EntityRecognizer, RecognizerResult

from . import MODEL_ID, find

# scrubpii type -> Presidio entity name. Types not listed keep their own name.
TO_PRESIDIO = {
    "PERSON": "PERSON", "EMAIL": "EMAIL_ADDRESS", "PHONE": "PHONE_NUMBER", "SSN": "US_SSN",
    "CREDIT_CARD": "CREDIT_CARD", "IP_ADDRESS": "IP_ADDRESS", "IBAN": "IBAN_CODE", "PASSPORT": "US_PASSPORT",
    "DRIVER_LICENSE": "US_DRIVER_LICENSE", "ADDRESS": "LOCATION", "ID_NUMBER": "ID_NUMBER",
    "DATE_OF_BIRTH": "DATE_TIME", "USERNAME": "USERNAME", "PASSWORD": "PASSWORD", "API_KEY": "API_KEY",
    "PRIVATE_KEY": "PRIVATE_KEY", "MAC_ADDRESS": "MAC_ADDRESS", "PROFILE_URL": "URL",
}
LANGUAGES = ("en", "es", "fr", "de", "it")


class ScrubpiiRecognizer(EntityRecognizer):
    """A Presidio recognizer backed by scrubpii's model and checks."""

    def __init__(self, language: str = "en", model: str = MODEL_ID, min_score: float = 0.5,
                 entities: Optional[List[str]] = None):
        self.model, self.min_score = model, min_score
        super().__init__(supported_entities=entities or sorted(set(TO_PRESIDIO.values())),
                         name=f"ScrubpiiRecognizer_{language}", supported_language=language)

    def load(self) -> None:          # the model loads lazily on first use
        pass

    def analyze(self, text: str, entities: List[str], nlp_artifacts=None) -> List[RecognizerResult]:
        out = []
        for e in find(text, self.min_score, self.model):
            name = TO_PRESIDIO.get(e.type, e.type)
            if entities and name not in entities:
                continue
            why = AnalysisExplanation(recognizer=self.name, original_score=e.score,
                                      textual_explanation=f"scrubpii: {e.reason or e.source}")
            out.append(RecognizerResult(name, e.start, e.end, e.score, why,
                                        {RecognizerResult.RECOGNIZER_NAME_KEY: self.name,
                                         RecognizerResult.RECOGNIZER_IDENTIFIER_KEY: self.id}))
        return out


def add_to(analyzer, languages=None, replace_ner: bool = False, **kw):
    """Add scrubpii to a Presidio AnalyzerEngine for each of its languages."""
    langs = languages or [l for l in getattr(analyzer, "supported_languages", ["en"]) if l in LANGUAGES] or ["en"]
    if replace_ner:
        for r in list(analyzer.registry.recognizers):
            if type(r).__name__ in ("SpacyRecognizer", "StanzaRecognizer", "TransformersRecognizer"):
                analyzer.registry.recognizers.remove(r)
    for lang in langs:
        analyzer.registry.add_recognizer(ScrubpiiRecognizer(language=lang, **kw))
    return analyzer
