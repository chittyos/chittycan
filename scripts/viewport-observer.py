#!/usr/bin/env python3
"""ChittyContext viewport Phase 1 shadow observer (PRODUCER).

Scans real AI-assistant transcript locations on this machine and emits one
JSONL record per discovered transcript to ~/.claude/chittycontext/shadow.jsonl.

Shadow mode = OBSERVE ONLY:
  * reads filesystem metadata and (optionally) counts newlines
  * never copies transcript contents
  * never transmits anything off-box
  * writes only to the shadow.jsonl output path (atomically)

Consumer contract (src/commands/viewport.ts): each line is a JSON object whose
"source" field is exactly one of "claude", "codex", "gemini".
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
OUTPUT_PATH = HOME / ".claude" / "chittycontext" / "shadow.jsonl"

# (source, root directory, glob pattern)
KINDS = ("session", "archived", "subagent")

SOURCES = [
    ("claude", HOME / ".claude" / "projects", "**/*.jsonl"),
    ("codex", HOME / ".codex" / "sessions", "**/*.jsonl"),
    ("codex", HOME / ".codex", "history.jsonl"),
    ("gemini", HOME / ".gemini" / "antigravity-cli", "history.jsonl"),
]


def iso_mtime(st: os.stat_result) -> str:
    return datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()


def count_lines(path: Path) -> int | None:
    """Cheap newline count. Returns None if unreadable."""
    try:
        total = 0
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 1024)
                if not chunk:
                    break
                total += chunk.count(b"\n")
        return total
    except OSError:
        return None


def session_id_for(path: Path) -> str:
    """Session identifier derived from the path (no content read)."""
    return path.stem


def project_id_for(path: Path, root: Path) -> str:
    """Project identifier derived from the path (no content read)."""
    try:
        rel = path.relative_to(root)
    except ValueError:
        return root.name
    if len(rel.parts) > 1:
        return rel.parts[0]
    return root.name


def kind_for(path: Path, root: Path) -> str:
    """Classify a discovered transcript by its path. Never drops anything.

    The consumer (src/commands/viewport.ts) counts entries per source; it
    filters on `kind` so headline counts reflect live sessions while the
    shadow state stays a complete, honest picture of what is on disk.

      "archived"  -> under a dot-directory component (e.g. `.ingested/`)
      "subagent"  -> under a `subagents/` directory
      "session"   -> live project/session transcript
    """
    try:
        parts = path.relative_to(root).parts[:-1]
    except ValueError:
        parts = ()
    if any(part.startswith(".") for part in parts):
        return "archived"
    if "subagents" in parts:
        return "subagent"
    return "session"


def discover(line_count_mode: str = "sessions"):
    """Walk every configured source. `line_count_mode` is one of:
    "none" (never count), "sessions" (count only kind == "session"),
    "all" (count every discovered transcript).
    When a count is not computed the `line_count` field is omitted entirely —
    it is never guessed or defaulted.
    """
    seen: set[str] = set()
    records = []
    for source, root, pattern in SOURCES:
        if not root.is_dir():
            continue  # missing source dir -> skip, no crash
        try:
            candidates = sorted(root.glob(pattern))
        except OSError:
            continue
        for path in candidates:
            try:
                if not path.is_file():
                    continue
                st = path.stat()
            except OSError:
                continue
            resolved = str(path.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            record = {
                "source": source,
                "kind": kind_for(path, root),
                "path": resolved,
                "size_bytes": st.st_size,
                "mtime": iso_mtime(st),
                "project": project_id_for(path, root),
                "session": session_id_for(path),
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "mode": "shadow",
            }
            if line_count_mode == "all" or (
                line_count_mode == "sessions" and record["kind"] == "session"
            ):
                lines = count_lines(path)
                if lines is not None:
                    record["line_count"] = lines
            records.append(record)
    return records


def write_atomic(records, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(out_path.parent), prefix=".shadow-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            for record in records:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, out_path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="ChittyContext viewport shadow observer (observe-only).")
    parser.add_argument("--dry-run", action="store_true", help="print records to stdout, write nothing")
    parser.add_argument(
        "--no-line-count",
        action="store_true",
        help="omit line_count entirely (metadata only; the field is left out, never guessed)",
    )
    parser.add_argument(
        "--line-count-all",
        action="store_true",
        help="also count lines for archived/subagent transcripts (slow: reads every byte on disk)",
    )
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="output shadow.jsonl path")
    args = parser.parse_args(argv)

    if args.no_line_count and args.line_count_all:
        parser.error("--no-line-count and --line-count-all are mutually exclusive")
    if args.no_line_count:
        mode = "none"
    elif args.line_count_all:
        mode = "all"
    else:
        mode = "sessions"

    records = discover(line_count_mode=mode)

    if args.dry_run:
        try:
            for record in records:
                print(json.dumps(record, ensure_ascii=False))
            sys.stdout.flush()
        except BrokenPipeError:
            # downstream closed the pipe (e.g. `| head`) — not an error
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return 0

    write_atomic(records, Path(args.output))

    by_source: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for record in records:
        by_source[record["source"]] = by_source.get(record["source"], 0) + 1
        by_kind[record["kind"]] = by_kind.get(record["kind"], 0) + 1
    src = ", ".join(f"{k}={by_source.get(k, 0)}" for k in ("claude", "codex", "gemini"))
    knd = ", ".join(f"{k}={by_kind.get(k, 0)}" for k in KINDS)
    print(f"wrote {len(records)} records to {args.output}", file=sys.stderr)
    print(f"  by source: {src}", file=sys.stderr)
    print(f"  by kind:   {knd}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
