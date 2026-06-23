from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

from . import claude_code, core
from .core import get_current_agent_id, get_current_framework, get_tracer_provider, init, set_eval_label, span, trace

__all__ = [
    "claude_code",
    "core",
    "get_current_agent_id",
    "get_current_framework",
    "get_tracer_provider",
    "init",
    "set_eval_label",
    "span",
    "trace",
]
