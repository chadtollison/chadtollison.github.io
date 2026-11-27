"""Keep personal data out of prompts you send to an LLM (or any outside service).

    from chad_pii import Guard
    guard = Guard()
    safe = guard.scrub("Email Sarah Johnson at sarah.j@example.com about her refund")
    # "Email <PERSON_1> at <EMAIL_1> about her refund"   -> send this to the model
    reply = llm(safe)                                    # "Dear <PERSON_1>, ..."
    guard.restore(reply)                                 # "Dear Sarah Johnson, ..."

The guard remembers its key across calls, so a whole conversation uses the
same tokens. The key never leaves your process.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from . import MODEL_ID, find, _apply, restore


class Guard:
    def __init__(self, min_score: float = 0.5, model: str = MODEL_ID):
        self.min_score, self.model = min_score, model
        self.key: Dict[str, str] = {}

    def scrub(self, text: str) -> str:
        """Swap personal data for tokens like <PERSON_1>."""
        return _apply(text, find(text, self.min_score, self.model), "token", self.key)[0]

    def restore(self, text: str) -> str:
        """Put the real values back into text that contains this guard's tokens."""
        return restore(text, self.key)

    def wrap(self, fn: Callable[[str], str]) -> Callable[[str], str]:
        """Wrap a text -> text function (e.g. an LLM call): scrub the input, restore the output."""
        def wrapped(prompt: str, *args: Any, **kw: Any) -> str:
            return self.restore(fn(self.scrub(prompt), *args, **kw))
        return wrapped

    def langchain(self):
        """Return (scrub, restore) as LangChain runnables:  chain = scrub | prompt | llm | parser | restore"""
        from langchain_core.runnables import RunnableLambda
        return RunnableLambda(self.scrub), RunnableLambda(self.restore)
