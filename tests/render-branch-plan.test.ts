/**
 * The branch-hygiene issue renderer.
 *
 * Exercised through the real script on real `planBranches` output — the shape
 * it consumes is produced here by the actual planner against a real remote,
 * not by a hand-written fixture that can drift from what the CLI emits.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBranches } from "../src/lib/hygiene/branches.js";
import { collectRemoteBranchFacts } from "../src/lib/hygiene/workflow-facts.js";

const SCRIPT = join(process.cwd(), "scripts", "render-branch-plan.mjs");
const git = (d: string, ...a: string[]) =>
  execFileSync("git", ["-C", d, ...a], { encoding: "utf8" }).trim();

function cloned(): { work: string; origin: string } {
  const origin = mkdtempSync(join(tmpdir(), "rbp-origin-"));
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const seed = mkdtempSync(join(tmpdir(), "rbp-seed-"));
  execFileSync("git", ["init", "-q", "-b", "main", seed]);
  git(seed, "config", "user.name", "t");
  git(seed, "config", "user.email", "t@t");
  writeFileSync(join(seed, "f.txt"), "v1");
  git(seed, "add", "f.txt");
  git(seed, "commit", "-qm", "base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");
  git(seed, "checkout", "-qb", "feat/landed");
  git(seed, "push", "-q", "origin", "feat/landed");
  const work = mkdtempSync(join(tmpdir(), "rbp-work-"));
  execFileSync("git", ["clone", "-q", origin, work]);
  git(work, "config", "user.name", "t");
  git(work, "config", "user.email", "t@t");
  git(work, "fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*");
  rmSync(seed, { recursive: true, force: true });
  return { work, origin };
}

/** Runs the script exactly as the workflow does. Returns body + count. */
function render(dir: string, plan: unknown): { body: string; count: string } {
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan));
  execFileSync("node", [SCRIPT, "plan.json", "body.md", "count.txt"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, RUN_URL: "https://example.invalid/run/1" },
  });
  return {
    body: readFileSync(join(dir, "body.md"), "utf8"),
    count: readFileSync(join(dir, "count.txt"), "utf8"),
  };
}

describe("render-branch-plan", () => {
  it("renders a real plan with a runnable delete command and a runnable undo", async () => {
    const { work, origin } = cloned();
    try {
      const { branches, defaultBranch } = await collectRemoteBranchFacts(work);
      const plan = await planBranches(work, branches, defaultBranch, {
        remote: true,
        archiveGone: true,
      });

      const { body, count } = render(work, plan);

      expect(count).toBe("1");
      expect(body).toContain("**1** branch holds nothing");
      expect(body).toContain("--delete 'feat/landed'");
      // The undo must be the two-step form; the one-step version fails with
      // "src refspec does not match any" because the archive is remote-only.
      expect(body).toContain("fetch origin refs/archive/<name>");
      expect(body).toContain("push origin refs/archive/<name>:refs/heads/<name>");
      expect(body).toContain("https://example.invalid/run/1");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(origin, { recursive: true, force: true });
    }
  });

  it("shell-quotes branch names, so a hostile ref cannot execute on paste", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-inject-"));
    try {
      // git accepts `$` and `;` in ref names, so whoever can push a branch
      // chooses this text — and a maintainer is invited to paste it.
      const hostile = "feat/x';id;'";
      execFileSync("git", ["check-ref-format", "--branch", hostile]); // it really is valid
      const { body } = render(d, {
        dryRun: false,
        reversal: "x",
        actions: [
          { branch: hostile, sha: "abc12345", archivedAs: `refs/archive/${hostile}`,
            deleted: false, proposedDelete: true, refused: null },
        ],
      });
      expect(body).toContain(`--delete 'feat/x'\\''`);
      // The unquoted form is what would have executed.
      expect(body).not.toContain("--delete feat/x';id;'");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("leases the delete to the archived sha", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-lease-"));
    try {
      const { body } = render(d, {
        dryRun: false,
        reversal: "x",
        actions: [
          { branch: "feat/x", sha: "abc12345", archivedAs: "refs/archive/feat/x",
            deleted: false, proposedDelete: true, refused: null },
        ],
      });
      // Without the lease, commits pushed after this run — which the archive
      // does not contain — would be destroyed by the paste.
      expect(body).toContain("--force-with-lease='feat/x':abc12345");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("rejects an action missing its branch instead of rendering `undefined`", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-partial-"));
    try {
      writeFileSync(
        join(d, "plan.json"),
        JSON.stringify({ dryRun: false, reversal: "x", actions: [{ proposedDelete: true }] }),
      );
      expect(() =>
        execFileSync("node", [SCRIPT, "plan.json", "body.md", "count.txt"], { cwd: d, stdio: "pipe" }),
      ).toThrow();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("counts refusals, so a run that only refused still reports", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-refuse-"));
    try {
      const { body, count } = render(d, {
        dryRun: false,
        reversal: "x",
        actions: [
          {
            branch: "feat/x",
            sha: "abc12345def",
            archivedAs: null,
            deleted: false,
            refused: "archive ref already holds deadbeef — refusing to overwrite",
          },
        ],
      });
      // A silent run here would mean an archive failure is indistinguishable
      // from a clean remote.
      expect(count).toBe("1");
      expect(body).toContain("Left alone");
      expect(body).toContain("refusing to overwrite");
      expect(body).toContain("**0** branches hold nothing");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("marks a dry run so an unwritten archive is never read as written", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-dry-"));
    try {
      const { body } = render(d, {
        dryRun: true,
        reversal: "x",
        actions: [
          { branch: "feat/x", sha: "abc12345", archivedAs: null, deleted: false, refused: null },
        ],
      });
      expect(body).toContain("Dry run — no archive refs were written.");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("fails loudly on malformed input rather than emitting an empty report", () => {
    const d = mkdtempSync(join(tmpdir(), "rbp-bad-"));
    try {
      writeFileSync(join(d, "plan.json"), JSON.stringify({ nope: true }));
      expect(() =>
        execFileSync("node", [SCRIPT, "plan.json", "body.md", "count.txt"], {
          cwd: d,
          stdio: "pipe",
        }),
      ).toThrow();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
