/**
 * Remote branch mode — real bare remote, real pushes, real read-back.
 *
 * These do not reuse the local-mode fixtures: the whole risk of remote mode is
 * that a ref write goes somewhere other than where the read-back looks, and a
 * fixture that shares one directory for "local" and "origin" cannot catch that.
 * Every test here has a genuinely separate bare repo as `origin`.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBranches } from "../src/lib/hygiene/branches.js";
import { collectRemoteBranchFacts } from "../src/lib/hygiene/workflow-facts.js";

/**
 * Git subprocesses must not read the developer's or runner's ~/.gitconfig.
 * This repo sets commit.gpgsign=true; inheriting it makes every fixture commit
 * depend on a signing key being present, so the suite passes here and fails on
 * a machine without one.
 */
const HERMETIC = {
  ...process.env,
  HOME: tmpdir(),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const git = (d: string, ...a: string[]) =>
  execFileSync("git", ["-C", d, ...a], { encoding: "utf8", env: HERMETIC }).trim();

/** A clone with a real bare origin behind it. Returns both paths. */
function cloned(): { work: string; origin: string } {
  const origin = mkdtempSync(join(tmpdir(), "hyg-rem-origin-"));
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin], { env: HERMETIC });

  const seed = mkdtempSync(join(tmpdir(), "hyg-rem-seed-"));
  execFileSync("git", ["init", "-q", "-b", "main", seed], { env: HERMETIC });
  git(seed, "config", "user.name", "t");
  git(seed, "config", "user.email", "t@t");
  writeFileSync(join(seed, "f.txt"), "v1");
  git(seed, "add", "f.txt");
  git(seed, "commit", "-qm", "base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");

  const work = mkdtempSync(join(tmpdir(), "hyg-rem-work-"));
  execFileSync("git", ["clone", "-q", origin, work], { env: HERMETIC });
  git(work, "config", "user.name", "t");
  git(work, "config", "user.email", "t@t");
  rmSync(seed, { recursive: true, force: true });
  return { work, origin };
}

/** Push a branch to origin that is fully contained in main (nothing unique). */
function pushMerged(work: string, name: string): string {
  git(work, "checkout", "-qb", name);
  git(work, "push", "-q", "origin", name);
  git(work, "checkout", "-q", "main");
  git(work, "branch", "-D", name);
  return git(work, "rev-parse", `origin/${name}`);
}

function cleanup(...dirs: string[]) {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe("remote branch mode", () => {
  it("judges origin/* when the local checkout has only the default branch", async () => {
    const { work, origin } = cloned();
    try {
      pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");

      // Exactly the situation a fresh actions/checkout is in.
      expect(git(work, "for-each-ref", "--format=%(refname:short)", "refs/heads/")).toBe("main");

      const facts = await collectRemoteBranchFacts(work);
      expect(facts.defaultBranch).toBe("main");
      expect(facts.branches.map((b) => b.name)).toEqual(["feat/landed"]);
      // origin/HEAD is a symref, not a proposal.
      expect(facts.branches.map((b) => b.name)).not.toContain("HEAD");
      expect(facts.branches[0]!.unique).toBe(0);
    } finally {
      cleanup(work, origin);
    }
  });

  it("drops origin/HEAD, which for-each-ref shortens to bare `origin`", async () => {
    const { work, origin } = cloned();
    try {
      // A real clone always has it; asserting its shape is the point, because
      // the obvious `n !== "HEAD"` filter does not match it.
      git(work, "remote", "set-head", "origin", "-a");
      const shorts = git(work, "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/")
        .split("\n").map((s) => s.trim());
      expect(shorts).toContain("origin");

      pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");

      const { branches } = await collectRemoteBranchFacts(work);
      // Not merely absent from the plan — absent from the facts, so it can
      // never be silently skipped downstream and read as "handled".
      expect(branches.map((b) => b.name)).toEqual(["feat/landed"]);
    } finally {
      cleanup(work, origin);
    }
  });

  it("resolves a default branch that is neither main nor master", async () => {
    // The failure this guards: with origin/HEAD unset (which is the normal
    // state under actions/checkout), a main/master fallback resolves nothing
    // on a `trunk` repo, branchCredibility returns [], and the scheduled run
    // reports a clean remote having examined no branches at all.
    const origin = mkdtempSync(join(tmpdir(), "hyg-trunk-origin-"));
    execFileSync("git", ["init", "-q", "--bare", "-b", "trunk", origin], { env: HERMETIC });
    const seed = mkdtempSync(join(tmpdir(), "hyg-trunk-seed-"));
    execFileSync("git", ["init", "-q", "-b", "trunk", seed], { env: HERMETIC });
    git(seed, "config", "user.name", "t");
    git(seed, "config", "user.email", "t@t");
    writeFileSync(join(seed, "f.txt"), "v1");
    git(seed, "add", "f.txt");
    git(seed, "commit", "-qm", "base");
    git(seed, "remote", "add", "origin", origin);
    git(seed, "push", "-q", "origin", "trunk");
    git(seed, "checkout", "-qb", "feat/landed");
    git(seed, "push", "-q", "origin", "feat/landed");

    // Initialised and fetched rather than cloned — so origin/HEAD is absent.
    const work = mkdtempSync(join(tmpdir(), "hyg-trunk-work-"));
    execFileSync("git", ["init", "-q", "-b", "trunk", work], { env: HERMETIC });
    git(work, "remote", "add", "origin", origin);
    git(work, "fetch", "-q", "origin", "+refs/heads/*:refs/remotes/origin/*");
    try {
      expect(() => git(work, "rev-parse", "--abbrev-ref", "origin/HEAD")).toThrow();

      const facts = await collectRemoteBranchFacts(work);
      expect(facts.defaultBranch).toBe("trunk");
      expect(facts.branches.map((b) => b.name)).toEqual(["feat/landed"]);
    } finally {
      cleanup(work, origin, seed);
    }
  });

  it("archives to the remote and never deletes, even for merged branches", async () => {
    const { work, origin } = cloned();
    try {
      const tip = pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");
      const { branches, defaultBranch } = await collectRemoteBranchFacts(work);

      const plan = await planBranches(work, branches, defaultBranch, {
        remote: true,
        // The flag that means "delete" in local mode must not delete here.
        pruneMerged: true,
      });

      const a = plan.actions[0]!;
      expect(a.refused).toBeNull();
      expect(a.archivedAs).toBe("refs/archive/feat/landed");
      expect(a.deleted).toBe(false);
      expect(a.proposedDelete).toBe(true);

      // The archive is on the REMOTE, at the right sha.
      expect(git(work, "ls-remote", "origin", "refs/archive/feat/landed").split(/\s+/)[0]).toBe(tip);
      // And the branch itself is untouched on the remote.
      expect(git(work, "ls-remote", "origin", "refs/heads/feat/landed").split(/\s+/)[0]).toBe(tip);
    } finally {
      cleanup(work, origin);
    }
  });

  it("restores a branch on the remote from its archive ref", async () => {
    const { work, origin } = cloned();
    try {
      const tip = pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");
      const { branches, defaultBranch } = await collectRemoteBranchFacts(work);
      await planBranches(work, branches, defaultBranch, { remote: true, archiveGone: true });

      // Simulate the human acting on the proposal.
      git(work, "push", "-q", "origin", "--delete", "feat/landed");
      expect(git(work, "ls-remote", "origin", "refs/heads/feat/landed")).toBe("");

      // The reversal string the plan prints, executed literally — including
      // the fetch, without which the push has no local source ref.
      git(work, "fetch", "-q", "origin", "refs/archive/feat/landed:refs/archive/feat/landed");
      git(work, "push", "-q", "origin", "refs/archive/feat/landed:refs/heads/feat/landed");
      expect(git(work, "ls-remote", "origin", "refs/heads/feat/landed").split(/\s+/)[0]).toBe(tip);
    } finally {
      cleanup(work, origin);
    }
  });

  it("refuses rather than overwrites when an archive ref already holds another sha", async () => {
    const { work, origin } = cloned();
    try {
      pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");

      // A stale archive at an unrelated sha — the case where a silent force
      // push would destroy a previously archived tip.
      const other = git(work, "rev-parse", "main");
      writeFileSync(join(work, "g.txt"), "x");
      git(work, "add", "g.txt");
      git(work, "commit", "-qm", "other");
      const stale = git(work, "rev-parse", "HEAD");
      git(work, "reset", "-q", "--hard", other);
      git(work, "push", "-q", "origin", `${stale}:refs/archive/feat/landed`);

      const { branches, defaultBranch } = await collectRemoteBranchFacts(work);
      const plan = await planBranches(work, branches, defaultBranch, { remote: true, archiveGone: true });

      const a = plan.actions[0]!;
      expect(a.refused).toMatch(/archive/);
      expect(a.archivedAs).toBeNull();
      expect(a.proposedDelete).toBeUndefined();
      // The pre-existing archive is intact.
      expect(git(work, "ls-remote", "origin", "refs/archive/feat/landed").split(/\s+/)[0]).toBe(stale);
    } finally {
      cleanup(work, origin);
    }
  });

  it("writes nothing on a dry run", async () => {
    const { work, origin } = cloned();
    try {
      pushMerged(work, "feat/landed");
      git(work, "fetch", "-q", "origin");
      const { branches, defaultBranch } = await collectRemoteBranchFacts(work);

      const plan = await planBranches(work, branches, defaultBranch, { remote: true, dryRun: true });

      expect(plan.dryRun).toBe(true);
      expect(plan.actions[0]!.archivedAs).toBeNull();
      expect(git(work, "ls-remote", "origin", "refs/archive/feat/landed")).toBe("");
    } finally {
      cleanup(work, origin);
    }
  });
});
