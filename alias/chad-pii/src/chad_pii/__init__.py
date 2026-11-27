"""chad-pii was renamed to scrubpii. This module re-exports scrubpii."""
import warnings

from scrubpii import *  # noqa: F401,F403
from scrubpii import __all__, __version__  # noqa: F401

warnings.warn("chad_pii is now scrubpii: use `import scrubpii` (pip install scrubpii).", DeprecationWarning, stacklevel=2)
