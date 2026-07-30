/**
 * Consumer tests for `can viewport status` (src/commands/viewport.ts).
 *
 * Real behavior only: real temp directories, real shadow.jsonl files on disk,
 * real HOME redirection (os.homedir() reads process.env.HOME on POSIX).
 * No module mocking, no filesystem mocking.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import yargs from "yargs";
import { builder, handler } from "../src/commands/viewport";

const REAL_HOME = process.env.HOME;

let tmpHome: string;
let shadowPath: string;

function makeHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-viewport-"));
  fs.mkdirSync(path.join(dir, ".claude", "chittycontext"), { recursive: true });
  return dir;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

/** Run `viewport status` against the current HOME and return plain-text stdout. */
async function runStatus(): Promise<string> {
  const chunks: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
    chunks.push(args.map(String).join(" "));
  });
  const err = vi.spyOn(console, "error").mockImplementation((...args: any[]) => {
    chunks.push(args.map(String).join(" "));
  });
  try {
    await builder(yargs([]) as any).parseAsync(["status"]);
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
  return stripAnsi(chunks.join("\n"));
}

function iso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString().replace("Z", "+00:00");
}

function sessionRecord(over: Record<string, unknown> = {}) {
  return {
    source: "claude",
    kind: "session",
    path: "/home/ubuntu/.claude/projects/-home-ubuntu-projects-github-com-CHITTYOS-chittycan/8f2c41ae-0d19-4d76-9a3f-6b1c0f5e77a2.jsonl",
    size_bytes: 148223,
    mtime: iso(3 * 60 * 60 * 1000),
    project: "-home-ubuntu-projects-github-com-CHITTYOS-chittycan",
    session: "8f2c41ae-0d19-4d76-9a3f-6b1c0f5e77a2",
    observed_at: iso(0),
    mode: "shadow",
    line_count: 412,
    ...over,
  };
}

function writeShadow(records: unknown[], eol = "\n"): void {
  fs.writeFileSync(shadowPath, records.map((r) => JSON.stringify(r)).join(eol) + eol, "utf-8");
}

beforeEach(() => {
  tmpHome = makeHome();
  process.env.HOME = tmpHome;
  shadowPath = path.join(tmpHome, ".claude", "chittycontext", "shadow.jsonl");
});

afterEach(() => {
  process.env.HOME = REAL_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

afterAll(() => {
  process.env.HOME = REAL_HOME;
});

describe("viewport status — session-only headline", () => {
  it("counts only kind=session in the headline; archived/subagent are reported separately", async () => {
    // Live-run shaped mix: 188 sessions, 3274 archived, 41 subagent = 3503 records.
    const records: unknown[] = [];
    for (let i = 0; i < 188; i++) {
      records.push(
        sessionRecord({
          source: i < 150 ? "claude" : i < 187 ? "codex" : "gemini",
          session: `session-live-${i}`,
        })
      );
    }
    for (let i = 0; i < 3274; i++) {
      records.push(
        sessionRecord({
          kind: "archived",
          path: `/home/ubuntu/.claude/projects/-home-ubuntu-projects/.ingested/arch-${i}.jsonl`,
          line_count: undefined,
        })
      );
    }
    for (let i = 0; i < 41; i++) {
      records.push(
        sessionRecord({
          kind: "subagent",
          path: `/home/ubuntu/.claude/projects/-home-ubuntu-projects/subagents/sub-${i}.jsonl`,
          line_count: undefined,
        })
      );
    }
    writeShadow(records);

    const out = await runStatus();
    // Regression: 3503 total records must not inflate the headline.
    expect(out).toContain("Active Transcripts Tracked: 188");
    expect(out).not.toContain("Active Transcripts Tracked: 3503");
    expect(out).toContain("Archived transcripts: 3274");
    expect(out).toContain("Subagent transcripts: 41");

    const claude = Number(/Claude: (\d+) sessions/.exec(out)![1]);
    const codex = Number(/Codex: (\d+) sessions/.exec(out)![1]);
    const gemini = Number(/Gemini: (\d+) sessions/.exec(out)![1]);
    expect(claude + codex + gemini).toBe(188);
  });

  it("tolerates records with no line_count (optional field)", async () => {
    const rec = sessionRecord();
    delete (rec as any).line_count;
    writeShadow([rec]);
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 1");
    expect(out).toContain("Claude: 1 sessions");
  });
});

describe("viewport status — classification edge cases", () => {
  it("surfaces records with missing or unrecognized kind as unclassified", async () => {
    const missing = sessionRecord({ session: "no-kind" });
    delete (missing as any).kind;
    writeShadow([
      sessionRecord(),
      missing,
      sessionRecord({ kind: "compacted", session: "weird-kind" }),
    ]);
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 1");
    expect(out).toMatch(/Unclassified records \(missing or unrecognized "kind"\): 2/);
  });

  it("surfaces sessions with an unrecognized source as unknown", async () => {
    writeShadow([
      sessionRecord(),
      sessionRecord({ source: "antigravity", session: "unknown-src" }),
    ]);
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 2");
    expect(out).toContain("Unknown source: 1 sessions");
  });

  it("skips malformed JSON lines, reports the count, and does not abort", async () => {
    fs.writeFileSync(
      shadowPath,
      [
        JSON.stringify(sessionRecord()),
        "{ this is not json",
        JSON.stringify(sessionRecord({ source: "codex", session: "rollout-2026-07-29" })),
        "",
        "]]",
      ].join("\n") + "\n",
      "utf-8"
    );
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 2");
    expect(out).toMatch(/Skipped 2 malformed line\(s\)/);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out).toContain('Run "can sync run"');
  });
});

describe("viewport status — line splitting regressions", () => {
  it("splits on real newlines, not a literal backslash-n", async () => {
    // A prior bug used split('\\n'). With that bug the whole file is one line
    // => 1 malformed record and 0 sessions.
    writeShadow([
      sessionRecord({ session: "a" }),
      sessionRecord({ session: "b" }),
      sessionRecord({ session: "c" }),
    ]);
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 3");
    expect(out).not.toMatch(/Skipped \d+ malformed/);
  });

  it("keeps a record intact when a JSON string value contains an escaped \\n", async () => {
    writeShadow([
      sessionRecord({ project: "-home-ubuntu-projects\\nchittycan", session: "escaped-newline" }),
      sessionRecord({ session: "plain" }),
    ]);
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 2");
    expect(out).not.toMatch(/Skipped \d+ malformed/);
  });

  it("handles CRLF line endings identically to LF", async () => {
    writeShadow([sessionRecord({ session: "a" }), sessionRecord({ session: "b" })], "\r\n");
    const out = await runStatus();
    expect(out).toContain("Active Transcripts Tracked: 2");
    expect(out).not.toMatch(/Skipped \d+ malformed/);
  });
});

describe("viewport status — liveness", () => {
  it("derives the liveness line from session mtimes only; frozen archived mtimes do not inflate it", async () => {
    writeShadow([
      sessionRecord({ session: "stale-live-session", mtime: iso((3 * 24 * 60 + 5 * 60) * 60 * 1000) }),
      sessionRecord({
        kind: "archived",
        session: "recently-ingested",
        mtime: iso(2 * 60 * 1000),
        path: "/home/ubuntu/.claude/projects/-home-ubuntu-projects/.ingested/recently-ingested.jsonl",
      }),
    ]);
    const out = await runStatus();
    expect(out).toMatch(/Newest active session activity: 3d 5h ago/);
    expect(out).toMatch(/Observer coverage, newest record of any kind: 2m ago/);
  });

  it("reports no liveness when there are no sessions with a parsable mtime", async () => {
    writeShadow([
      sessionRecord({
        kind: "archived",
        mtime: iso(60 * 60 * 1000),
        path: "/home/ubuntu/.claude/projects/-home-ubuntu-projects/.ingested/only-archived.jsonl",
      }),
    ]);
    const out = await runStatus();
    expect(out).toContain("Newest active session activity: none (no active sessions with a parsable mtime)");
  });
});

describe("viewport status — manual-observer notice", () => {
  it("prints the notice unconditionally when the snapshot is fresh (no staleness threshold)", async () => {
    writeShadow([sessionRecord()]);
    const out = await runStatus();
    expect(out).toMatch(/Snapshot from the last manual observer run, under a minute ago\./);
    expect(out).toContain("Nothing re-runs it automatically.");
    expect(out).toContain("Refresh with: python3 scripts/viewport-observer.py");
  });

  it("prints the same notice with the aged value when the snapshot is old", async () => {
    writeShadow([sessionRecord()]);
    const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 + 2 * 60) * 60 * 1000);
    fs.utimesSync(shadowPath, threeDaysAgo, threeDaysAgo);
    const out = await runStatus();
    expect(out).toMatch(/Snapshot from the last manual observer run, 3d 2h ago\./);
  });
});

describe("viewport status — missing shadow file", () => {
  it("prints guidance and returns without throwing", async () => {
    expect(fs.existsSync(shadowPath)).toBe(false);
    const out = await runStatus();
    expect(out).toContain(`Shadow state not found at ${shadowPath}`);
    expect(out).toContain("python3 scripts/viewport-observer.py");
    expect(out).not.toContain("Active Transcripts Tracked");
    expect(process.exitCode ?? 0).toBe(0);
  });
});

describe("viewport — command guard", () => {
  it("the top-level handler fails closed when no subcommand is given", () => {
    expect(() => handler()).toThrow(/must specify a viewport command/i);
  });
});
