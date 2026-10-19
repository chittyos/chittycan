/**
 * Consumer tests for `can hygiene` (src/commands/hygiene.ts).
 *
 * These pin the exit-code contract M4 consumes:
 *   0 = no findings at or above --min-severity
 *   1 = findings at or above --min-severity
 *   2 = usage / environment error (bad flag, bad severity, not a repo)
 *
 * The command is exercised by SPAWNING the real built CLI, not by calling
 * handler() in-process: the contract under test is the process exit code, and
 * capturing that in-process would require spying on process.exit — i.e. faking
 * the exact thing being asserted. Real git repos, real files, real subprocess.
 *
 * beforeAll runs `npm run build` unconditionally. A staleness heuristic would
 * let a green suite run against a dist/ that is not the code under review.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "hygiene-test",
      GIT_AUTHOR_EMAIL: "hygiene-test@chitty.cc",
      GIT_COMMITTER_NAME: "hygiene-test",
      GIT_COMMITTER_EMAIL: "hygiene-test@chitty.cc",
    },
  });
}

function newRepo(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chittycan-hygiene-${label}-`));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "hygiene-test@chitty.cc");
  git(dir, "config", "user.name", "hygiene-test");
  return dir;
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A repo whose worst finding is `high` (tracked build artifacts under dist/). */
let highRepo: string;
/** A repo with a single empty commit: only `low` findings fire. */
let cleanRepo: string;
/** A repo with hundreds of tracked artifacts — a JSON payload larger than a pipe buffer. */
let bigRepo: string;

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
  expect(fs.existsSync(CLI)).toBe(true);

  cleanRepo = newRepo("clean");
  git(cleanRepo, "commit", "-q", "--allow-empty", "-m", "init");

  highRepo = newRepo("high");
  fs.mkdirSync(path.join(highRepo, "dist"));
  fs.writeFileSync(path.join(highRepo, "dist", "index.js"), "console.log(1);\n");
  fs.writeFileSync(path.join(highRepo, "dist", "index.js.map"), "{}\n");
  git(highRepo, "add", "-A");
  git(highRepo, "commit", "-q", "-m", "track build output");

  bigRepo = newRepo("big");
  fs.mkdirSync(path.join(bigRepo, "dist"));
  for (let i = 0; i < 400; i++) {
    fs.writeFileSync(path.join(bigRepo, "dist", `mod-${i}.js`), `export const n = ${i};\n`);
  }
  git(bigRepo, "add", "-A");
  git(bigRepo, "commit", "-q", "-m", "track build output");
}, 600_000);

describe("can hygiene — exit-code gate", () => {
  it("exits 0 when nothing meets the threshold", () => {
    const r = run(["hygiene", cleanRepo, "--min-severity", "high"]);
    expect(r.stdout).toContain("No findings at or above");
    expect(r.code).toBe(0);
  });

  it("exits 1 when findings meet the threshold", () => {
    const r = run(["hygiene", highRepo, "--min-severity", "high"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("HIGH");
    expect(r.stdout).toContain("tracked-build-artifact");
  });

  // Direction pair: a repo whose worst finding is `high`, gated at `critical`,
  // must report nothing. If the >= / <= comparison were inverted this passes
  // while the test above still passes, which is why both are needed.
  it("gates upward, not downward: high findings are excluded at --min-severity critical", () => {
    const r = run(["hygiene", highRepo, "--min-severity", "critical"]);
    expect(r.stdout).toContain("No findings at or above");
    expect(r.stdout).not.toContain("tracked-build-artifact");
    expect(r.code).toBe(0);
  });

  it("includes lower severities as the threshold drops", () => {
    const r = run(["hygiene", cleanRepo, "--min-severity", "low"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("LOW");
  });
});

describe("can hygiene — usage and environment errors exit 2", () => {
  it("rejects an unknown --min-severity value", () => {
    const r = run(["hygiene", cleanRepo, "--min-severity", "bogus"]);
    expect(r.code).toBe(2);
  });

  it("rejects an unknown flag", () => {
    const r = run(["hygiene", cleanRepo, "--nope"]);
    expect(r.code).toBe(2);
  });

  it("rejects a path that is not a directory", () => {
    const missing = path.join(os.tmpdir(), "chittycan-hygiene-does-not-exist-xyz");
    const r = run(["hygiene", missing]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not a directory");
  });

  it("rejects a directory that is not a git repository", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-hygiene-plain-"));
    const r = run(["hygiene", plain]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not a git repository");
  });

  it("prints help without triggering the failure path", () => {
    const r = run(["hygiene", "--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("min-severity");
  });
});

describe("can hygiene --json", () => {
  it("emits parseable JSON and nothing else on a clean scan", () => {
    const r = run(["hygiene", cleanRepo, "--min-severity", "high", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.findings).toEqual([]);
    expect(parsed.repo).toBe(fs.realpathSync(cleanRepo));
  });

  it("emits the gated findings, not the full set", () => {
    const r = run(["hygiene", highRepo, "--min-severity", "high", "--json"]);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.findings.length).toBeGreaterThan(0);
    for (const f of parsed.findings) {
      expect(["critical", "high"]).toContain(f.severity);
    }
  });

  it("does not crash when the consumer closes the pipe early (EPIPE)", () => {
    // 400 tracked artifacts produce a payload far larger than a pipe buffer, so
    // `head -c 32` really does close stdout mid-write. Asserting on the exit
    // code alone would not discriminate: an uncaught EPIPE and the findings
    // gate both exit 1. The stderr assertion is the discriminating one.
    const r = spawnSync(
      "sh",
      ["-c", `"$0" "$1" hygiene "$2" --json | head -c 32`, process.execPath, CLI, bigRepo],
      { encoding: "utf8" }
    );
    expect(r.stderr).not.toMatch(/EPIPE/);
    expect(r.stderr).not.toMatch(/Unhandled|node:internal/);
  }, 120_000);
});
