"""
Rifft × Claude Code integration.

Hooks into Claude Code's lifecycle events (PreToolUse, PostToolUse, Stop)
to produce a full trace of every session — tool calls, timings, errors —
sent automatically to Rifft when the session ends.

Setup (one command):
    pip install rifft-sdk
    rifft-claude init --project-id YOUR_PROJECT_ID --api-key YOUR_API_KEY

Then use Claude Code normally. Each session appears as a trace in Rifft
with MAST classification applied automatically.

Architecture:
    PreToolUse  → append start-time record to ~/.rifft/sessions/{session}.jsonl
    PostToolUse → append end-time + response to same file
    Stop        → read file, pair pre/post events into spans, POST to Rifft, clean up
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Paths ──────────────────────────────────────────────────────────────────────

_RIFFT_DIR = Path.home() / ".rifft"
_SESSIONS_DIR = _RIFFT_DIR / "sessions"
_CONFIG_FILE = _RIFFT_DIR / "config.json"
_CLAUDE_SETTINGS = Path.home() / ".claude" / "settings.json"

_MAX_VALUE_LEN = 512


# ── Config ─────────────────────────────────────────────────────────────────────

def _load_config() -> Dict[str, str]:
    """Load credentials: env vars override ~/.rifft/config.json."""
    cfg: Dict[str, str] = {}
    if _CONFIG_FILE.exists():
        try:
            cfg = json.loads(_CONFIG_FILE.read_text())
        except Exception:
            pass
    return {
        "project_id": os.getenv("RIFFT_PROJECT_ID") or cfg.get("project_id", ""),
        "api_key": os.getenv("RIFFT_API_KEY") or cfg.get("api_key", ""),
        "endpoint": os.getenv("RIFFT_ENDPOINT") or cfg.get("endpoint", "https://ingest.rifft.dev"),
    }


def _save_config(project_id: str, api_key: str, endpoint: str) -> None:
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_FILE.write_text(json.dumps({
        "project_id": project_id,
        "api_key": api_key,
        "endpoint": endpoint,
    }, indent=2))
    _CONFIG_FILE.chmod(0o600)  # credentials only readable by owner


# ── Session file helpers ────────────────────────────────────────────────────────

def _session_file(session_id: str) -> Path:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return _SESSIONS_DIR / f"{session_id}.jsonl"


def _append_event(session_id: str, event: Dict[str, Any]) -> None:
    with _session_file(session_id).open("a") as fh:
        fh.write(json.dumps(event) + "\n")


def _read_events(session_id: str) -> List[Dict[str, Any]]:
    f = _session_file(session_id)
    if not f.exists():
        return []
    events: List[Dict[str, Any]] = []
    for line in f.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                events.append(json.loads(line))
            except Exception:
                pass
    return events


def _delete_session(session_id: str) -> None:
    try:
        _session_file(session_id).unlink()
    except Exception:
        pass


# ── Helpers ────────────────────────────────────────────────────────────────────

def _trunc(value: Any, max_len: int = _MAX_VALUE_LEN) -> str:
    s = value if isinstance(value, str) else json.dumps(value, default=str)
    return s[:max_len] + "…" if len(s) > max_len else s


def _hex(n_bytes: int) -> str:
    return os.urandom(n_bytes).hex()


def _kv(key: str, value: Any) -> Dict[str, Any]:
    if isinstance(value, bool):
        v: Any = {"boolValue": value}
    elif isinstance(value, int):
        v = {"intValue": str(value)}
    elif isinstance(value, float):
        v = {"doubleValue": value}
    else:
        v = {"stringValue": "" if value is None else str(value)}
    return {"key": key, "value": v}


# ── Hook handlers ──────────────────────────────────────────────────────────────

def handle_pre(event: Dict[str, Any]) -> None:
    """PreToolUse — record start timestamp for this tool call."""
    _append_event(event.get("session_id", "unknown"), {
        "type": "pre",
        "tool_name": event.get("tool_name", "unknown"),
        "input": event.get("tool_input", {}),
        "ts_ns": time.time_ns(),
        "cwd": os.getcwd(),
    })


def handle_post(event: Dict[str, Any]) -> None:
    """PostToolUse — record end timestamp, output, and any error."""
    response = event.get("tool_response") or {}
    if isinstance(response, str):
        response = {"output": response}

    # Normalise the many shapes of tool_response across tool types
    output = (
        response.get("output")
        or response.get("stdout")
        or response.get("content")
        or ""
    )
    error = (
        response.get("error")
        or response.get("stderr")
        or (
            response.get("exitCode") not in (None, 0)
            and f"exit code {response.get('exitCode')}"
        )
        or ""
    )

    _append_event(event.get("session_id", "unknown"), {
        "type": "post",
        "tool_name": event.get("tool_name", "unknown"),
        "input": event.get("tool_input", {}),
        "output": _trunc(str(output)) if output else "",
        "error": _trunc(str(error)) if error else "",
        "ts_ns": time.time_ns(),
    })


def handle_stop(event: Dict[str, Any]) -> None:
    """Stop — build trace from accumulated events, flush to Rifft, clean up."""
    session_id = event.get("session_id", "unknown")
    events = _read_events(session_id)
    if not events:
        return

    cfg = _load_config()
    if not cfg["project_id"] or not cfg["api_key"]:
        print(
            "rifft: no credentials — run `rifft-claude init` to set up.",
            file=sys.stderr,
        )
        return

    spans = _build_spans(session_id, events, cfg["project_id"])
    if spans:
        _flush(spans, cfg)
    _delete_session(session_id)


# ── Span building ──────────────────────────────────────────────────────────────

def _build_spans(
    session_id: str,
    events: List[Dict[str, Any]],
    project_id: str,
) -> List[Dict[str, Any]]:
    """
    Pair pre/post events (FIFO per tool_name) into child spans.
    Wrap everything in a root claude-code.session span.
    """
    trace_id = _hex(16)
    root_span_id = _hex(8)

    all_ts = [e["ts_ns"] for e in events if "ts_ns" in e]
    session_start = min(all_ts) if all_ts else time.time_ns()
    session_end = max(all_ts) if all_ts else time.time_ns()
    cwd = next((e.get("cwd", "") for e in events if e.get("type") == "pre"), "")

    # FIFO queues: pending pre-events indexed by tool_name
    pending: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    tool_spans: List[Dict[str, Any]] = []
    has_error = False

    for e in events:
        if e["type"] == "pre":
            pending[e["tool_name"]].append(e)

        elif e["type"] == "post":
            tool_name = e["tool_name"]
            pre = pending[tool_name].pop(0) if pending[tool_name] else None
            start_ns = pre["ts_ns"] if pre else (e["ts_ns"] - 1_000_000)  # 1 ms fallback
            end_ns = e["ts_ns"]

            is_error = bool(e.get("error"))
            if is_error:
                has_error = True

            attrs = [
                _kv("agent_id", "claude-code"),
                _kv("framework", "claude-code"),
                _kv("project_id", project_id),
                _kv("tool.name", tool_name),
                _kv("tool.input", _trunc(e.get("input", {}))),
            ]
            if e.get("output"):
                attrs.append(_kv("tool.output", e["output"]))
            if is_error:
                attrs.append(_kv("tool.error", e["error"]))
            if pre and pre.get("cwd"):
                attrs.append(_kv("tool.cwd", pre["cwd"]))

            tool_spans.append({
                "traceId": trace_id,
                "spanId": _hex(8),
                "parentSpanId": root_span_id,
                "name": f"tool.{tool_name}",
                "startTimeUnixNano": str(start_ns),
                "endTimeUnixNano": str(end_ns),
                "attributes": attrs,
                "events": [],
                "status": {"code": 2 if is_error else 1},
            })

    if not tool_spans:
        return []

    root_attrs = [
        _kv("agent_id", "claude-code"),
        _kv("framework", "claude-code"),
        _kv("project_id", project_id),
        _kv("session.id", session_id),
        _kv("session.tool_count", len(tool_spans)),
    ]
    if cwd:
        root_attrs.append(_kv("session.cwd", cwd))

    root_span: Dict[str, Any] = {
        "traceId": trace_id,
        "spanId": root_span_id,
        "parentSpanId": None,
        "name": "claude-code.session",
        "startTimeUnixNano": str(session_start),
        "endTimeUnixNano": str(session_end),
        "attributes": root_attrs,
        "events": [],
        "status": {"code": 2 if has_error else 1},
    }

    return [root_span] + tool_spans


# ── Flush ──────────────────────────────────────────────────────────────────────

def _flush(spans: List[Dict[str, Any]], cfg: Dict[str, str]) -> None:
    endpoint = cfg["endpoint"].rstrip("/") + "/v1/traces"
    envelope = {
        "resourceSpans": [{
            "resource": {
                "attributes": [
                    _kv("service.name", "rifft-claude-code"),
                    _kv("project_id", cfg["project_id"]),
                ],
            },
            "scopeSpans": [{"spans": spans}],
        }]
    }
    body = json.dumps(envelope).encode()
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            tool_count = len(spans) - 1  # exclude root span
            if 200 <= resp.status < 300:
                print(f"rifft: ✓ trace sent ({tool_count} tool calls)", file=sys.stderr)
            else:
                print(f"rifft: ingest returned HTTP {resp.status}", file=sys.stderr)
    except Exception as exc:
        print(f"rifft: failed to send trace — {exc}", file=sys.stderr)


# ── CLI: rifft-claude hook ─────────────────────────────────────────────────────

def _cmd_hook(subcommand: str) -> None:
    """Called by Claude Code hooks. Reads JSON event from stdin."""
    try:
        raw = sys.stdin.read()
        event = json.loads(raw) if raw.strip() else {}
    except Exception:
        event = {}

    if subcommand == "pre":
        handle_pre(event)
    elif subcommand == "post":
        handle_post(event)
    elif subcommand == "stop":
        handle_stop(event)
    else:
        print(f"rifft-claude hook: unknown subcommand {subcommand!r}", file=sys.stderr)
        sys.exit(1)


# ── CLI: rifft-claude init ─────────────────────────────────────────────────────

def _patch_claude_settings() -> None:
    """Add rifft-claude hook commands to ~/.claude/settings.json."""
    _CLAUDE_SETTINGS.parent.mkdir(parents=True, exist_ok=True)

    settings: Dict[str, Any] = {}
    if _CLAUDE_SETTINGS.exists():
        try:
            settings = json.loads(_CLAUDE_SETTINGS.read_text())
        except Exception:
            pass

    hooks: Dict[str, Any] = settings.setdefault("hooks", {})

    def _ensure_hook(event_name: str, command: str) -> None:
        entries: List[Any] = hooks.setdefault(event_name, [])
        # Avoid duplicates
        for entry in entries:
            if isinstance(entry, dict):
                for h in entry.get("hooks", []):
                    if h.get("command") == command:
                        return
        hook_entry: Dict[str, Any] = {
            "hooks": [{"type": "command", "command": command}]
        }
        if event_name != "Stop":
            hook_entry["matcher"] = ".*"
        entries.append(hook_entry)

    _ensure_hook("PreToolUse", "rifft-claude hook pre")
    _ensure_hook("PostToolUse", "rifft-claude hook post")
    _ensure_hook("Stop", "rifft-claude hook stop")

    _CLAUDE_SETTINGS.write_text(json.dumps(settings, indent=2))


def _cmd_init(args: List[str]) -> None:
    """Save credentials and register hooks in ~/.claude/settings.json."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="rifft-claude init",
        description="Connect Claude Code sessions to Rifft.",
    )
    parser.add_argument("--project-id", default=None, help="Your Rifft project ID")
    parser.add_argument("--api-key", default=None, help="Your Rifft API key")
    parser.add_argument(
        "--endpoint",
        default=None,
        help="Ingest endpoint (default: https://ingest.rifft.dev)",
    )
    parsed = parser.parse_args(args)

    existing = _load_config()

    project_id = (
        parsed.project_id
        or existing.get("project_id")
        or input("Project ID (from rifft.dev → Settings): ").strip()
    )
    api_key = (
        parsed.api_key
        or existing.get("api_key")
        or input("API key (from rifft.dev → Settings): ").strip()
    )
    endpoint = parsed.endpoint or existing.get("endpoint") or "https://ingest.rifft.dev"

    if not project_id or not api_key:
        print("Error: project ID and API key are required.", file=sys.stderr)
        sys.exit(1)

    _save_config(project_id, api_key, endpoint)
    print(f"✓ Credentials saved to {_CONFIG_FILE}")

    _patch_claude_settings()
    print(f"✓ Hooks registered in {_CLAUDE_SETTINGS}")
    print()
    print("All done. Start a Claude Code session — traces appear in Rifft automatically.")


# ── CLI: rifft-claude status ───────────────────────────────────────────────────

def _cmd_status() -> None:
    """Show current config and hook registration state."""
    cfg = _load_config()
    print(f"Config file : {_CONFIG_FILE}")
    print(f"Project ID  : {cfg['project_id'] or '(not set)'}")
    print(f"API key     : {'(set)' if cfg['api_key'] else '(not set)'}")
    print(f"Endpoint    : {cfg['endpoint']}")
    print()

    if _CLAUDE_SETTINGS.exists():
        try:
            settings = json.loads(_CLAUDE_SETTINGS.read_text())
            hooks = settings.get("hooks", {})
            registered = all(
                any(
                    h.get("command", "").startswith("rifft-claude hook")
                    for entry in hooks.get(event, [])
                    for h in (entry.get("hooks", []) if isinstance(entry, dict) else [])
                )
                for event in ("PreToolUse", "PostToolUse", "Stop")
            )
            print(f"Claude hooks: {'✓ registered' if registered else '✗ not registered — run `rifft-claude init`'}")
        except Exception:
            print(f"Claude hooks: could not read {_CLAUDE_SETTINGS}")
    else:
        print(f"Claude hooks: {_CLAUDE_SETTINGS} not found — is Claude Code installed?")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("Usage: rifft-claude <init | hook <pre|post|stop> | status>", file=sys.stderr)
        sys.exit(1)

    command = args[0]
    if command == "init":
        _cmd_init(args[1:])
    elif command == "hook":
        if len(args) < 2:
            print("Usage: rifft-claude hook <pre|post|stop>", file=sys.stderr)
            sys.exit(1)
        _cmd_hook(args[1])
    elif command == "status":
        _cmd_status()
    else:
        print(f"rifft-claude: unknown command {command!r}", file=sys.stderr)
        print("Usage: rifft-claude <init | hook <pre|post|stop> | status>", file=sys.stderr)
        sys.exit(1)
