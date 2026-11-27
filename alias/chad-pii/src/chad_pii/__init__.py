"""chad-pii was renamed to piiguard. This module re-exports piiguard."""
import warnings

from piiguard import *  # noqa: F401,F403
from piiguard import __all__, __version__  # noqa: F401

warnings.warn("chad_pii is now piiguard: use `import piiguard` (pip install piiguard).", DeprecationWarning, stacklevel=2)
