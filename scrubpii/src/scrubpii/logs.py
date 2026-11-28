"""Keep personal data and secrets out of your logs.

    import logging, scrubpii
    logging.basicConfig(level=logging.INFO)
    scrubpii.scrub_logs()                       # every handler on the root logger
    logging.info("signup from %s, card %s", "jo@acme.com", "4111 1111 1111 1111")
    # INFO:root:signup from [EMAIL], card [CREDIT_CARD]

By default only the rules run (fast=True): emails, phones, SSNs, cards (Luhn),
IBANs (checksum), IPs, API keys and your own rules, in microseconds per line.
fast=False also runs the model, which finds names and addresses too but adds
a few milliseconds per line. Exception tracebacks are scrubbed as well.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from . import MODEL_ID, _apply, find


class ScrubFilter(logging.Filter):
    """A logging filter that redacts each record before any handler writes it.

    Add it to a handler (handler.addFilter(ScrubFilter())) so it also covers
    records from child loggers, or use scrub_logs() to add it everywhere.
    """

    def __init__(self, mode: str = "label", fast: bool = True, min_score: float = 0.5,
                 model: str = MODEL_ID, name: str = ""):
        super().__init__(name)
        self.mode, self.fast, self.min_score, self.model = mode, fast, min_score, model

    def scrub(self, text: str) -> str:
        return _apply(text, find(text, self.min_score, self.model, self.fast), self.mode)[0]

    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "_scrubpii", False):         # already done by another handler's filter
            return True
        try:
            msg = record.getMessage()
        except Exception:                               # a bad format string: log it as given
            msg = str(record.msg)
        record.msg, record.args = self.scrub(msg), None
        if record.exc_info and not record.exc_text:
            record.exc_text = logging.Formatter().formatException(record.exc_info)
        if record.exc_text:
            record.exc_text = self.scrub(record.exc_text)
        if record.stack_info:
            record.stack_info = self.scrub(record.stack_info)
        record._scrubpii = True
        return True


def scrub_logs(logger: Optional[logging.Logger] = None, handlers: Optional[Iterable[logging.Handler]] = None,
               **kw) -> ScrubFilter:
    """Add one ScrubFilter to every handler of `logger` (default: the root logger).

    Call it after your handlers are set up (e.g. after logging.basicConfig()).
    If the logger has no handlers yet, a StreamHandler is added. Keyword
    arguments go to ScrubFilter (mode, fast, min_score, model).
    """
    logger = logger or logging.getLogger()
    f = ScrubFilter(**kw)
    hs = list(handlers) if handlers is not None else list(logger.handlers)
    if not hs:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter(logging.BASIC_FORMAT))
        logger.addHandler(h)
        hs = [h]
    for h in hs:
        if not any(isinstance(x, ScrubFilter) for x in h.filters):
            h.addFilter(f)
    return f
