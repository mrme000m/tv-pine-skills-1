"""
tv_skill_parser.py — Deterministic parser for TradingView skill-runner stdout.

Usage:
    from tv_skill_parser import run_skill

    res = run_skill(
        script_path=Path("ema-atr-pro-engine.cjs"),
        symbol="BTCUSDT",
        timeframe="1h",
        bars=500,
    )
    print(res.payload)
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

START_DELIM = "<<<AGENT_JSON_START>>>"
END_DELIM = "<<<AGENT_JSON_END>>>"


@dataclass(frozen=True)
class SkillResult:
    raw_stdout: str
    raw_stderr: str
    payload: dict[str, Any] | None
    schema_hint: str | None
    exit_code: int
    parsed_via: str


def _extract_delimited(text: str) -> dict | None:
    start = text.find(START_DELIM)
    end = text.find(END_DELIM)
    if start == -1 or end == -1 or end <= start:
        return None
    json_text = text[start + len(START_DELIM) : end].strip()
    try:
        return json.loads(json_text)
    except json.JSONDecodeError:
        return None


def _extract_by_line(text: str) -> dict | None:
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] not in "{[":
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def _extract_by_brackets(text: str) -> dict | None:
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start : i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict) and len(parsed) > 2:
                        return parsed
                except json.JSONDecodeError:
                    pass
                start = -1
    return None


def extract_payload(text: str) -> tuple[dict | None, str]:
    """Return (payload, method_used)."""
    for method_name, extractor in [
        ("delimiter", _extract_delimited),
        ("line", _extract_by_line),
        ("bracket", _extract_by_brackets),
    ]:
        result = extractor(text)
        if result is not None:
            return result, method_name
    return None, "none"


def parse_meta_from_payload(payload: dict | None) -> str | None:
    """Infer which skill produced this payload."""
    if payload is None:
        return None
    if "_parserMeta" in payload:
        return payload["_parserMeta"].get("workflow")
    if "agentContext" in payload:
        return payload["agentContext"].get("workflow")
    keys = set(payload.keys())
    if "tqiBreakdown" in keys or ("tradePlan" in keys and "regime" in keys):
        return "adaptive-supertrend-quality"
    if "bosCount" in keys or ("active" in keys and "fvgCount" in keys):
        return "smart-money-concepts"
    if "grades" in keys or "emaFast" in keys:
        return "ema-confluence-sniper"
    if "trailTrend" in keys or "combinedTrend" in keys:
        return "ema-atr-structure"
    return None


def run_skill(
    script_path: Path,
    symbol: str,
    timeframe: str = "15m",
    bars: int = 500,
    extra_args: list[str] | None = None,
    timeout: int = 60,
) -> SkillResult:
    """
    Execute a skill runner deterministically.
    Always passes --silent --agent --json to guarantee clean stdout.
    """
    cmd = [
        "node",
        str(script_path),
        symbol,
        "--tf",
        timeframe,
        "--bars",
        str(bars),
        "--silent",
        "--agent",
        "--json",
    ]
    if extra_args:
        cmd.extend(extra_args)

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    payload, parsed_via = extract_payload(proc.stdout)
    schema_hint = parse_meta_from_payload(payload)

    return SkillResult(
        raw_stdout=proc.stdout,
        raw_stderr=proc.stderr,
        payload=payload,
        schema_hint=schema_hint,
        exit_code=proc.returncode,
        parsed_via=parsed_via,
    )
