/**
 * Regression tests pinning `can hygiene` as REPORT-ONLY (src/commands/hygiene.ts).
 *
 * This file used to test `can hygiene --fix`. That flag is gone. It was REMOVED
 * rather than repaired, because its single fixer could damage a real repository
 * in two ways that are design defects in the fixer, not in this CLI surface:
 *
 *   1. it appended ` && git config core.hooksPath .githooks 2>/dev/null || true`
 *      to a pre-existing `prepare` script; `A && B || true` always exits 0 in
 *      POSIX sh, so a failing `npm run build` in prepare stopped failing
 *      `npm install`;
 *   2. its "already has a hook layer" precondition read only tracked files under
 *      .husky/ hooks/ githooks/ .githooks/ and package.json scripts — never
 *      `core.hooksPath`, never a tracked `.pre-commit-config.yaml` — so it
 *      silently disabled working hook layers it claimed to refuse to touch.
 *
 * So these tests assert the REMOVAL holds, and that removing it did not weaken
 * the detector. Same style as tests/hygiene-cli.test.ts: the built CLI is
 * SPAWNED against real temp git repositories with real files and real commits.
 * No vi.mock anywhere.
 *
 * What each one exists to catch:
 *   - `--fix` is rejected as an unknown flag on exit 2 (usage), never silently
 *     accepted and never confused with the findings gate (exit 1);
 *   - the rejected invocation writes NOTHING — no .githooks/, byte-identical
 *     package.json. This is the actual safety property; the exit code is not.
 *     A future re-add of the flag that reaches the old fixer fails here;
 *   - a repo whose `prepare` runs a REAL failing build still fails after a
 *     `--fix` attempt. That is defect (1) pinned as unreachable, and it is the
 *     branch the previous version of this file never exercised: every fixture
 *     it built had no `prepare` key at all;
 *   - the read-only --json payload has EXACTLY {repo, scanned_at, findings}.
 *     M4's gate parses it; `fixes`/`skipped` must not reappear;
 *   - `no-commit-msg-lint` and `no-local-hook-layer` still FIRE with remediation
 *     hints. They are intentionally report-only, not silenced.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "hygiene-test",
      GIT_AUTHOR_EMAIL: "hygiene-test@chitty.cc",
      GIT_COMMITTER_NAME: "hygiene-test",
      GIT_COMMITTER_EMAIL: "hygiene-test@chitty.cc",
    },
  });
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Byte-exact snapshot of every file in the worktree, .git excluded. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const child = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) walk(child);
      else out[child] = fs.readFileSync(path.join(dir, child), "utf8");
    }
  };
  walk("");
  return out;
}

/**
 * A repo that fires BOTH formerly-"fixable" rules: no commit-msg lint config
 * and no hook layer of any kind.
 */
function newFixableRepo(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chittycan-hygfix-${label}-`));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "hygiene-test@chitty.cc");
  git(dir, "config", "user.name", "hygiene-test");
  const pkg = { name: "fixture-repo", version: "1.0.0", scripts: { test: "vitest run" } };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# fixture\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

/**
 * A repo whose `prepare` runs a real build step that FAILS — the shape the
 * removed fixer damaged. `npm run prepare` must exit non-zero both before and
 * after a `--fix` attempt.
 */
function newPrepareRepo(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chittycan-hygprep-${label}-`));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "hygiene-test@chitty.cc");
  git(dir, "config", "user.name", "hygiene-test");
  const pkg = {
    name: "prepare-fixture",
    version: "1.0.0",
    scripts: { prepare: "node build.js", test: "vitest run" },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  // A real failing build, not a stub assertion about one.
  fs.writeFileSync(path.join(dir, "build.js"), "process.exit(2);\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# fixture\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
  expect(fs.existsSync(CLI)).toBe(true);
}, 600_000);

describe("can hygiene has no auto-fix surface", () => {
  it("rejects --fix as an unknown flag on exit 2, not the findings gate", () => {
    const repo = newFixableRepo("unknown-flag");
    const r = run(["hygiene", repo, "--fix"]);
    // 2 = usage/environment. 1 would read as "defects found" and 0 as "clean";
    // either would let a caller believe --fix ran.
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/hygiene:/);
    expect(r.stderr).toMatch(/fix/);
  });

  it("writes nothing when --fix is attempted: no .githooks/, package.json byte-identical", () => {
    const repo = newFixableRepo("no-writes");
    const before = snapshot(repo);

    run(["hygiene", repo, "--fix"]);
    run(["hygiene", repo, "--fix", "--min-severity", "high", "--json"]);

    expect(snapshot(repo)).toEqual(before);
    expect(fs.existsSync(path.join(repo, ".githooks"))).toBe(false);
    // git agrees: no tracked modification, no untracked file.
    expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("leaves a failing `prepare` failing — the masked-build-failure damage is unreachable", () => {
    const repo = newPrepareRepo("prepare-mask");
    const beforePkg = fs.readFileSync(path.join(repo, "package.json"), "utf8");

    // Baseline: the pre-existing prepare really does fail.
    const baseline = spawnSync("npm", ["run", "prepare"], { cwd: repo, encoding: "utf8" });
    expect(baseline.status).not.toBe(0);

    run(["hygiene", repo, "--fix"]);

    expect(fs.readFileSync(path.join(repo, "package.json"), "utf8")).toBe(beforePkg);
    // Still fails. The removed fixer's ` && ... || true` append made this 0.
    const after = spawnSync("npm", ["run", "prepare"], { cwd: repo, encoding: "utf8" });
    expect(after.status).not.toBe(0);
  }, 120_000);

  it("does not accept --fix even alongside flags it does accept", () => {
    const repo = newFixableRepo("combined");
    const r = run(["hygiene", repo, "--json", "--min-severity", "low", "--fix"]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
  });
});

describe("can hygiene --json is the three-key interchange contract", () => {
  it("emits exactly { repo, scanned_at, findings } and no fix keys", () => {
    const repo = newFixableRepo("json-shape");
    const r = run(["hygiene", repo, "--json"]);
    // The fixture fires both report-only rules, so the gate fires.
    expect(r.code).toBe(1);
    const payload = JSON.parse(r.stdout);
    expect(Object.keys(payload).sort()).toEqual(["findings", "repo", "scanned_at"]);
    expect(payload).not.toHaveProperty("fixes");
    expect(payload).not.toHaveProperty("skipped");
    expect(Array.isArray(payload.findings)).toBe(true);
  });
});

describe("the two formerly-fixable rules remain reported, not silenced", () => {
  it("no-commit-msg-lint and no-local-hook-layer still fire with remediation hints", () => {
    const repo = newFixableRepo("still-fires");
    const r = run(["hygiene", repo, "--min-severity", "low", "--json"]);
    const findings: Array<{ id: string; remediation_hint?: string }> = JSON.parse(
      r.stdout,
    ).findings;
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("no-commit-msg-lint");
    expect(ids).toContain("no-local-hook-layer");
    // Report-only is only useful if the operator is told what to do by hand.
    for (const id of ["no-commit-msg-lint", "no-local-hook-layer"]) {
      const f = findings.find((x) => x.id === id)!;
      expect(typeof f.remediation_hint).toBe("string");
      expect(f.remediation_hint!.length).toBeGreaterThan(0);
    }
  });

  it("a plain scan is read-only: the fixture is byte-identical afterwards", () => {
    const repo = newFixableRepo("read-only");
    const before = snapshot(repo);

    const r = run(["hygiene", repo, "--min-severity", "low"]);

    expect(r.code).toBe(1); // the report-only rules fire; nothing was applied
    expect(snapshot(repo)).toEqual(before);
    expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
  });
});
