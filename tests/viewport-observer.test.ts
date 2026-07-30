/**
 * Producer tests for scripts/viewport-observer.py.
 *
 * Real behavior only: the real script is invoked via subprocess against a real
 * temporary HOME containing real transcript files. Output always goes to a path
 * inside the temp dir (belt and braces with HOME) so the developer's real
 * ~/.claude/chittycontext/shadow.jsonl is never touched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(__dirname, "..", "scripts", "viewport-observer.py");

let tmpHome: string;
let outPath: string;

interface Record_ {
  source: string;
  kind: string;
  path: string;
  size_bytes: number;
  mtime: string;
  project: string;
  session: string;
  observed_at: string;
  mode: string;
  line_count?: number;
}

function write(rel: string, content: string): string {
  const full = path.join(tmpHome, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return full;
}

function jsonlLines(n: number, tag: string): string {
  return (
    Array.from({ length: n }, (_, i) =>
      JSON.stringify({ type: i === 0 ? "user" : "assistant", uuid: `${tag}-${i}` })
    ).join("\n") + "\n"
  );
}

function run(args: string[] = []) {
  return spawnSync("python3", [SCRIPT, ...args], {
    env: { ...process.env, HOME: tmpHome },
    encoding: "utf-8",
  });
}

function readOut(): Record_[] {
  return fs
    .readFileSync(outPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-observer-"));
  outPath = path.join(tmpHome, ".claude", "chittycontext", "shadow.jsonl");

  // Claude: live session, archived (dot-directory), subagent.
  write(
    ".claude/projects/-home-ubuntu-projects-github-com-CHITTYOS-chittycan/8f2c41ae-0d19-4d76-9a3f-6b1c0f5e77a2.jsonl",
    jsonlLines(7, "chittycan")
  );
  write(
    ".claude/projects/-home-ubuntu-projects-github-com-CHITTYFOUNDATION-chittyid/2b90d7c4-15e8-4a02-8c31-9d4477ab1e60.jsonl",
    jsonlLines(3, "chittyid")
  );
  write(
    ".claude/projects/-home-ubuntu-projects-github-com-CHITTYOS-chittycan/.ingested/c1d0a67b-4e55-4f8a-9b2d-0e6f318cc744.jsonl",
    jsonlLines(50, "ingested")
  );
  write(
    ".claude/projects/-home-ubuntu-projects-github-com-CHITTYOS-chittycan/subagents/a4e7f21c-88b3-4d1e-b0aa-52c9d3f7e015.jsonl",
    jsonlLines(11, "subagent")
  );

  // Codex: sessions tree + top-level history.jsonl.
  write(".codex/sessions/2026/07/29/rollout-2026-07-29T14-22-08.jsonl", jsonlLines(5, "codex"));
  write(".codex/history.jsonl", jsonlLines(9, "codex-history"));

  // Gemini: antigravity CLI history.
  write(".gemini/antigravity-cli/history.jsonl", jsonlLines(2, "gemini-history"));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("viewport-observer.py — discovery and schema", () => {
  it("emits one record per transcript with all mandatory fields", () => {
    const r = run(["--output", outPath]);
    expect(r.status).toBe(0);
    const records = readOut();
    expect(records).toHaveLength(7);

    for (const rec of records) {
      expect(rec.source).toMatch(/^(claude|codex|gemini)$/);
      expect(rec.kind).toMatch(/^(session|archived|subagent)$/);
      expect(path.isAbsolute(rec.path)).toBe(true);
      expect(typeof rec.size_bytes).toBe("number");
      expect(rec.mtime.endsWith("+00:00")).toBe(true);
      expect(Number.isFinite(Date.parse(rec.mtime))).toBe(true);
      expect(rec.observed_at.endsWith("+00:00")).toBe(true);
      expect(rec.mode).toBe("shadow");
      expect(typeof rec.project).toBe("string");
      expect(typeof rec.session).toBe("string");
    }

    const bySource = records.reduce<Record<string, number>>((a, r2) => {
      a[r2.source] = (a[r2.source] || 0) + 1;
      return a;
    }, {});
    expect(bySource).toEqual({ claude: 4, codex: 2, gemini: 1 });

    const byKind = records.reduce<Record<string, number>>((a, r2) => {
      a[r2.kind] = (a[r2.kind] || 0) + 1;
      return a;
    }, {});
    expect(byKind).toEqual({ session: 5, archived: 1, subagent: 1 });
  });

  it("classifies dot-directory components as archived and subagents/ as subagent", () => {
    run(["--output", outPath]);
    const records = readOut();
    const archived = records.find((x) => x.path.includes("/.ingested/"))!;
    expect(archived.kind).toBe("archived");
    const sub = records.find((x) => x.path.includes("/subagents/"))!;
    expect(sub.kind).toBe("subagent");
  });

  it("derives session from the filename stem and project from the first path segment", () => {
    run(["--output", outPath]);
    const rec = readOut().find((x) => x.session === "8f2c41ae-0d19-4d76-9a3f-6b1c0f5e77a2")!;
    expect(rec.project).toBe("-home-ubuntu-projects-github-com-CHITTYOS-chittycan");
    expect(rec.kind).toBe("session");
  });

  it("skips missing source directories without crashing", () => {
    fs.rmSync(path.join(tmpHome, ".codex"), { recursive: true, force: true });
    fs.rmSync(path.join(tmpHome, ".gemini"), { recursive: true, force: true });
    const r = run(["--output", outPath]);
    expect(r.status).toBe(0);
    expect(readOut().map((x) => x.source)).toEqual(["claude", "claude", "claude", "claude"]);
  });
});

describe("viewport-observer.py — optional line_count", () => {
  it("includes line_count only for kind=session by default (never 0, never guessed)", () => {
    run(["--output", outPath]);
    for (const rec of readOut()) {
      if (rec.kind === "session") {
        expect(rec.line_count).toBeGreaterThan(0);
      } else {
        expect("line_count" in rec).toBe(false);
      }
    }
    const chittycan = readOut().find((x) => x.session === "8f2c41ae-0d19-4d76-9a3f-6b1c0f5e77a2")!;
    expect(chittycan.line_count).toBe(7);
  });

  it("--no-line-count omits the field entirely everywhere", () => {
    run(["--no-line-count", "--output", outPath]);
    for (const rec of readOut()) {
      expect("line_count" in rec).toBe(false);
    }
  });

  it("--line-count-all counts archived and subagent transcripts too", () => {
    run(["--line-count-all", "--output", outPath]);
    const records = readOut();
    for (const rec of records) {
      expect(rec.line_count).toBeGreaterThan(0);
    }
    expect(records.find((x) => x.kind === "archived")!.line_count).toBe(50);
    expect(records.find((x) => x.kind === "subagent")!.line_count).toBe(11);
  });

  it("rejects --no-line-count together with --line-count-all", () => {
    const r = run(["--no-line-count", "--line-count-all", "--output", outPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("mutually exclusive");
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

describe("viewport-observer.py — write semantics", () => {
  it("is idempotent: a second run produces identical records (modulo observed_at)", () => {
    run(["--output", outPath]);
    const first = readOut().map((r) => {
      const { observed_at, ...rest } = r;
      return rest;
    });
    run(["--output", outPath]);
    const second = readOut().map((r) => {
      const { observed_at, ...rest } = r;
      return rest;
    });
    expect(second).toEqual(first);
  });

  it("rewrites in full: records removed from disk disappear from the snapshot", () => {
    run(["--output", outPath]);
    expect(readOut()).toHaveLength(7);
    fs.rmSync(path.join(tmpHome, ".gemini/antigravity-cli/history.jsonl"));
    run(["--output", outPath]);
    const records = readOut();
    expect(records).toHaveLength(6);
    expect(records.some((x) => x.source === "gemini")).toBe(false);
  });

  it("leaves no temp files behind after an atomic write", () => {
    run(["--output", outPath]);
    const leftovers = fs
      .readdirSync(path.dirname(outPath))
      .filter((f) => f.startsWith(".shadow-") && f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("--dry-run prints records to stdout and writes nothing", () => {
    const r = run(["--dry-run", "--output", outPath]);
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPath)).toBe(false);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(7);
    expect(JSON.parse(lines[0]).mode).toBe("shadow");
  });

  it("reports by-source and by-kind tallies on stderr", () => {
    const r = run(["--output", outPath]);
    expect(r.stderr).toContain("wrote 7 records");
    expect(r.stderr).toContain("by source: claude=4, codex=2, gemini=1");
    expect(r.stderr).toContain("by kind:   session=5, archived=1, subagent=1");
  });

  it("copies no transcript content into the snapshot", () => {
    run(["--output", outPath]);
    const raw = fs.readFileSync(outPath, "utf-8");
    expect(raw).not.toContain("chittycan-0");
    expect(raw).not.toContain("assistant");
  });
});

describe("viewport-observer.py -> viewport status (producer/consumer contract)", () => {
  it("produces a snapshot whose session count matches what the consumer reports", () => {
    run(["--output", outPath]);
    const records = readOut();
    const sessions = records.filter((r) => r.kind === "session").length;
    expect(sessions).toBe(5);
    // Every record carries a source the consumer recognizes.
    for (const rec of records) {
      expect(["claude", "codex", "gemini"]).toContain(rec.source);
    }
  });
});
