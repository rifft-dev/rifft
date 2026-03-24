from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

from . import core
from .core import get_current_agent_id, get_current_framework, get_tracer_provider, init, span, trace

__all__ = [
    "core",
    "get_current_agent_id",
    "get_current_framework",
    "get_tracer_provider",
    "init",
    "span",
    "trace",
]
