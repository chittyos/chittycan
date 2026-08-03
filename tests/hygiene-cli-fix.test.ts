/**
 * Consumer tests for `can hygiene --fix` (src/commands/hygiene.ts).
 *
 * Same style as tests/hygiene-cli.test.ts: the built CLI is SPAWNED, against
 * real temp git repositories with real files and real commits. Exit codes are
 * the contract under test, and capturing them in-process would mean spying on
 * process.exit — faking the thing being asserted. No vi.mock anywhere.
 *
 * What these pin, and why each one exists:
 *   - dirty tree  -> exit 2 and NOT ONE BYTE written. This is what makes the
 *     resulting diff provably the fixer's own.
 *   - `--fix --min-severity high` still applies the low-severity fixers. Both
 *     auto-fixable rules are `low`; if the threshold were applied before the
 *     fixer ran, the CI gate (which runs at `high`) would fix nothing forever.
 *   - a remaining unfixable `high` finding still drives exit 1 after fixing.
 *   - the --json shape the autofix workflow parses.
 *   - a second --fix is a no-op: idempotence, asserted on disk, not claimed.
 *   - no `--fix` leaves the fixture byte-identical: the gate path is read-only.
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
 * A repo that fires BOTH fixable rules and nothing else that is fixable:
 * no commit-msg lint config, no hook layer, and a byte-canonical package.json
 * the fixer is allowed to edit.
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

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
  expect(fs.existsSync(CLI)).toBe(true);
}, 600_000);

describe("can hygiene --fix", () => {
  it("refuses to run on a dirty worktree: exit 2, nothing written", () => {
    const repo = newFixableRepo("dirty");
    fs.appendFileSync(path.join(repo, "README.md"), "probe\n");
    const before = snapshot(repo);

    const r = run(["hygiene", repo, "--fix"]);

    expect(r.code).toBe(2);
    expect(snapshot(repo)).toEqual(before);
    expect(fs.existsSync(path.join(repo, ".githooks"))).toBe(false);
  });

  it("applies the low-severity fixers even under --min-severity high", () => {
    const repo = newFixableRepo("gate-high");

    const r = run(["hygiene", repo, "--fix", "--min-severity", "high", "--json"]);

    const payload = JSON.parse(r.stdout);
    expect(Array.isArray(payload.fixes)).toBe(true);
    expect(payload.fixes.length).toBeGreaterThan(0);

    const hook = path.join(repo, ".githooks", "commit-msg");
    expect(fs.existsSync(hook)).toBe(true);
    // Executable on disk — a 0644 hook satisfies the detector and does nothing.
    expect(fs.statSync(hook).mode & 0o111).not.toBe(0);

    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
    expect(pkg.scripts.prepare).toContain("core.hooksPath .githooks");

    // The hook must accept the very subjects the stated reversal produces,
    // or `git revert` would be rejected by the artifact it reverts.
    for (const subject of ['Revert "chore(x): y"', "Merge branch main", "fixup! chore(x): y"]) {
      const msgFile = path.join(repo, ".commit-msg-probe");
      fs.writeFileSync(msgFile, subject + "\n");
      const probe = spawnSync(hook, [msgFile], { encoding: "utf8" });
      expect(probe.status).toBe(0);
      fs.unlinkSync(msgFile);
    }
  });

  it("clears both fixable rules once the writes are committed", () => {
    const repo = newFixableRepo("cleared");
    run(["hygiene", repo, "--fix"]);
    // The rules read TRACKED paths (git ls-files), and --fix deliberately does
    // not stage. So clearance lands at commit time, not at write time — this
    // asserts the state the autofix PR actually merges, not an intermediate one.
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore(hygiene): apply auto-fixable repo-hygiene remediation");

    const r = run(["hygiene", repo, "--min-severity", "low", "--json"]);
    const ids = JSON.parse(r.stdout).findings.map((f: any) => f.id);
    expect(ids.some((i: string) => i.startsWith("no-commit-msg-lint"))).toBe(false);
    expect(ids.some((i: string) => i.startsWith("no-local-hook-layer"))).toBe(false);
  });

  it("still exits 1 when an unfixable finding remains after fixing", () => {
    const repo = newFixableRepo("unfixable");
    fs.mkdirSync(path.join(repo, "dist"));
    fs.writeFileSync(path.join(repo, "dist", "index.js"), "console.log(1);\n");
    fs.writeFileSync(path.join(repo, "dist", "index.js.map"), "{}\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "track build output");

    const r = run(["hygiene", repo, "--fix", "--min-severity", "high", "--json"]);

    expect(r.code).toBe(1);
    const payload = JSON.parse(r.stdout);
    expect(payload.findings.length).toBeGreaterThan(0);
    // The fixer never touches the unfixable rule: no `git rm`, no deletion.
    expect(fs.existsSync(path.join(repo, "dist", "index.js"))).toBe(true);
    // Findings ids are scoped (`tracked-build-artifact:dist/`), so match the rule prefix.
    expect(
      payload.findings.some((f: any) => String(f.id).startsWith("tracked-build-artifact"))
    ).toBe(true);
  });

  it("emits the documented --fix --json shape", () => {
    const repo = newFixableRepo("json");
    const r = run(["hygiene", repo, "--fix", "--json"]);
    const payload = JSON.parse(r.stdout);

    expect(payload).toHaveProperty("repo");
    expect(payload).toHaveProperty("scanned_at");
    expect(Array.isArray(payload.findings)).toBe(true);
    expect(Array.isArray(payload.skipped)).toBe(true);

    for (const fix of payload.fixes) {
      expect(typeof fix.id).toBe("string");
      expect(Array.isArray(fix.rule_ids)).toBe(true);
      expect(Array.isArray(fix.files_written)).toBe(true);
      expect(fix.files_written.length).toBeGreaterThan(0);
      expect(typeof fix.reversal).toBe("string");
      expect(fix.reversal.length).toBeGreaterThan(0);
    }
  });

  it("prints the applied plan and its reversal in text mode", () => {
    const repo = newFixableRepo("text");
    const r = run(["hygiene", repo, "--fix"]);
    expect(r.stdout).toContain("fixed:");
    expect(r.stdout).toContain(".githooks/commit-msg");
    // The `undo:` line is the string a human copy-pastes, so assert what
    // follows it — not merely that the label was printed. Verified by hand to
    // round-trip a fixed clone back to an empty `git status --porcelain`.
    const undo = r.stdout.split("\n").find((l) => l.includes("undo:"));
    expect(undo).toBeDefined();
    expect(undo).toContain("git checkout -- package.json");
    expect(undo).toContain("rm -f .githooks/commit-msg");
    expect(undo).toContain("git config --unset core.hooksPath");
  });

  it("is idempotent: a second --fix reports no fixes and writes nothing", () => {
    const repo = newFixableRepo("idempotent");
    run(["hygiene", repo, "--fix"]);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore(hygiene): apply auto-fixable repo-hygiene remediation");

    const before = snapshot(repo);
    const r = run(["hygiene", repo, "--fix", "--min-severity", "low", "--json"]);

    expect(JSON.parse(r.stdout).fixes).toEqual([]);
    expect(snapshot(repo)).toEqual(before);
    expect(git(repo, "status", "--porcelain").trim()).toBe("");
  });
});

describe("can hygiene without --fix", () => {
  it("is read-only: the fixture is byte-identical afterwards", () => {
    const repo = newFixableRepo("readonly");
    const before = snapshot(repo);

    const r = run(["hygiene", repo, "--min-severity", "low"]);

    expect(r.code).toBe(1); // the fixable rules still fire — nothing was applied
    expect(snapshot(repo)).toEqual(before);
    expect(git(repo, "status", "--porcelain").trim()).toBe("");
  });

  it("omits fixes/skipped from --json, keeping the gate payload unchanged", () => {
    const repo = newFixableRepo("json-readonly");
    const payload = JSON.parse(run(["hygiene", repo, "--json"]).stdout);
    expect(Object.keys(payload).sort()).toEqual(["findings", "repo", "scanned_at"]);
  });
});
