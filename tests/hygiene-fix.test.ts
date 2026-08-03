/**
 * Real-behaviour tests for the repo-hygiene auto-fix engine.
 *
 * Every repository here is a real `git init` on a real temp dir with real
 * files and real subprocesses. Nothing is mocked — a fixer that writes to a
 * fake filesystem proves nothing about the one class of bug that matters
 * (corrupting somebody's checkout).
 */

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRepo, cleanupRepos } from "./helpers/git-fixture.js";
import { scanRepo } from "../src/lib/hygiene/scan.js";
import { applyFixes, FixPreconditionError } from "../src/lib/hygiene/fix/apply.js";

afterEach(() => cleanupRepos());

const PKG = {
  name: "fixture-pkg",
  version: "1.0.0",
  scripts: { build: "tsc -p .", prepare: "npm run build" },
};

function pkgJson(indent = 2, obj: unknown = PKG): string {
  return JSON.stringify(obj, null, indent) + "\n";
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function trackedPaths(root: string): string[] {
  return git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
}

/** Baseline repo: both fixable rules fire, nothing else blocks the fixer. */
function bareRepo(files: Record<string, string> = {}): string {
  return createRepo({
    committed: {
      "package.json": pkgJson(),
      "src/index.ts": "export const x = 1;\n",
      ...files,
    },
  });
}

describe("applyFixes — the coupled commit-msg-hook fixer", () => {
  it("fires, fixes, and clears both rules on re-scan", async () => {
    const root = bareRepo();
    const before = await scanRepo(root);
    expect(before.map((f) => f.id)).toEqual(
      expect.arrayContaining(["no-commit-msg-lint", "no-local-hook-layer"]),
    );

    const result = await applyFixes(root, before);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].id).toBe("commit-msg-hook");
    expect(result.applied[0].writes.sort()).toEqual([
      ".githooks/commit-msg",
      "package.json",
    ]);
    expect(result.applied[0].reversal).toContain("git config --unset core.hooksPath");

    // The hook must be committable — stage it so ls-files sees it — and the
    // rules must stop firing on a real re-scan.
    git(root, ["add", "-A"]);
    const after = await scanRepo(root);
    expect(after.map((f) => f.id)).not.toContain("no-commit-msg-lint");
    expect(after.map((f) => f.id)).not.toContain("no-local-hook-layer");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    expect(pkg.scripts.prepare).toBe(
      "npm run build && { git config core.hooksPath .githooks 2>/dev/null || true; }",
    );
    // The deferred config mutation is outside `writes` by nature, so the
    // contract is that it is DECLARED rather than hidden.
    expect(result.applied[0].deferred_effects?.join(" ")).toMatch(
      /core\.hooksPath/,
    );
  });

  it("writes the hook executable (0o755 on disk)", async () => {
    const root = bareRepo();
    await applyFixes(root, await scanRepo(root));
    const mode = fs.statSync(path.join(root, ".githooks/commit-msg")).mode;
    expect(mode & 0o777).toBe(0o755);
  });

  it("installs a hook that accepts Conventional, Revert and Merge subjects and rejects junk", async () => {
    const root = bareRepo();
    await applyFixes(root, await scanRepo(root));
    const hook = path.join(root, ".githooks/commit-msg");
    const msg = path.join(root, "MSG");

    const run = (subject: string): number => {
      fs.writeFileSync(msg, subject + "\n");
      try {
        execFileSync(hook, [msg], { cwd: root, stdio: "pipe" });
        return 0;
      } catch (e: any) {
        return typeof e.status === "number" ? e.status : 1;
      }
    };

    expect(run("fix(scope): description")).toBe(0);
    expect(run("chore(hygiene): apply auto-fixable repo-hygiene remediation")).toBe(0);
    expect(run('Revert "chore(x): y"')).toBe(0);
    expect(run("Merge branch main")).toBe(0);
    expect(run("fixup! feat: thing")).toBe(0);
    expect(run("squash! feat: thing")).toBe(0);
    expect(run("")).toBe(0);
    expect(run("junk message")).toBe(1);
    expect(run("feat no colon")).toBe(1);
  });

  it("is idempotent: a second run applies nothing and leaves no new diff", async () => {
    const root = bareRepo();
    await applyFixes(root, await scanRepo(root));
    git(root, ["add", "-A"]);
    git(root, ["commit", "--quiet", "-m", "chore(hygiene): apply fix"]);

    const second = await applyFixes(root, await scanRepo(root));
    expect(second.applied).toHaveLength(0);
    expect(git(root, ["status", "--porcelain"]).trim()).toBe("");
  });

  it("refuses to run on a dirty worktree", async () => {
    const root = bareRepo();
    fs.writeFileSync(path.join(root, "src/index.ts"), "export const x = 2;\n");
    const findings = await scanRepo(root);
    await expect(applyFixes(root, findings)).rejects.toBeInstanceOf(
      FixPreconditionError,
    );
    expect(fs.existsSync(path.join(root, ".githooks/commit-msg"))).toBe(false);
  });

  it("does nothing when only one of the two rules fires (tracked hooks/pre-commit)", async () => {
    const root = bareRepo({ "hooks/pre-commit": "#!/bin/sh\nexit 0\n" });
    const findings = await scanRepo(root);
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("no-commit-msg-lint");
    expect(ids).not.toContain("no-local-hook-layer");

    const beforeBytes = fs.readFileSync(path.join(root, "hooks/pre-commit"));
    const result = await applyFixes(root, findings);
    expect(result.applied).toHaveLength(0);
    expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "hooks/pre-commit"))).toEqual(
      beforeBytes,
    );
    expect(git(root, ["status", "--porcelain"]).trim()).toBe("");
  });

  it("skips, with a stated reason, a package.json that is not byte-exact 2-space JSON", async () => {
    const root = createRepo({
      committed: {
        "package.json": pkgJson(4),
        "src/index.ts": "export const x = 1;\n",
      },
    });
    const before = fs.readFileSync(path.join(root, "package.json"));
    const result = await applyFixes(root, await scanRepo(root));
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/byte-exact 2-space JSON/);
    expect(fs.readFileSync(path.join(root, "package.json"))).toEqual(before);
    expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
  });

  it("skips when there is no root package.json — never a hook nothing installs", async () => {
    const root = createRepo({
      committed: { "src/index.ts": "export const x = 1;\n" },
    });
    const result = await applyFixes(root, await scanRepo(root));
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/no tracked root package.json/);
    expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
  });

  it("skips when a hook layer is already tracked under .husky/", async () => {
    const root = bareRepo({ ".husky/commit-msg": "#!/bin/sh\nexit 0\n" });
    const findings = await scanRepo(root);
    // Force the engine to consider the fixer even though the detector has
    // already gone quiet: the plan() guard is what must refuse.
    const forced = [
      ...findings,
      { id: "no-commit-msg-lint", severity: "low", title: "t", description: "d" },
      { id: "no-local-hook-layer", severity: "low", title: "t", description: "d" },
    ] as Awaited<ReturnType<typeof scanRepo>>;
    const result = await applyFixes(root, forced);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/already tracks a hook layer/);
  });

  /**
   * Regression fixtures for the three defects a review found by hand. Each one
   * damaged a real repository; none of them was caught by any test above,
   * because every test above asserts on the fixer's OWN artifact rather than on
   * what the artifact does to the repo it lands in.
   */
  describe("damage regressions", () => {
    it("does not swallow the exit status of the pre-existing prepare command", async () => {
      const root = bareRepo();
      await applyFixes(root, await scanRepo(root));
      const prepare = JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8"),
      ).scripts.prepare as string;

      // Run the composed script through a real /bin/sh with the repo's own
      // `npm run build` stood in for by a command that fails, exactly as a
      // broken build would. `(a && b) || true` returns 0 here; the brace group
      // returns the failure.
      const status = (script: string): number => {
        try {
          execFileSync("/bin/sh", ["-c", script], { cwd: root, stdio: "pipe" });
          return 0;
        } catch (e: any) {
          return typeof e.status === "number" ? e.status : 1;
        }
      };

      expect(status(prepare.replace("npm run build", "sh -c 'exit 2'"))).toBe(2);
      // ...while a failing `git config` alone is still tolerated.
      expect(
        status(prepare.replace("npm run build", "true").replace(
          "git config core.hooksPath .githooks",
          "git config --file /nonexistent/dir/x y z",
        )),
      ).toBe(0);
    });

    it("refuses when the hooks directory git consults already has a hook installed", async () => {
      // The Python `pre-commit` framework and `lefthook install` both work this
      // way: root config file, hook written into .git/hooks. Nothing about it is
      // tracked, so the detector cannot see it — the FIXER must veto.
      const root = bareRepo({ ".pre-commit-config.yaml": "repos: []\n" });
      const hooksDir = git(root, ["rev-parse", "--git-path", "hooks"]).trim();
      const abs = path.isAbsolute(hooksDir) ? hooksDir : path.join(root, hooksDir);
      fs.mkdirSync(abs, { recursive: true });
      const guard = path.join(abs, "pre-commit");
      fs.writeFileSync(guard, "#!/bin/sh\necho SECRET SCAN BLOCKED >&2\nexit 1\n");
      fs.chmodSync(guard, 0o755);

      const findings = await scanRepo(root);
      expect(findings.map((f) => f.id)).toEqual(
        expect.arrayContaining(["no-commit-msg-lint", "no-local-hook-layer"]),
      );

      const result = await applyFixes(root, findings);
      expect(result.applied).toHaveLength(0);
      expect(result.skipped[0].reason).toMatch(/already contains installed hook/);
      expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
      expect(git(root, ["status", "--porcelain"]).trim()).toBe("");

      // And the pre-existing hook still blocks a commit — it did not go silent.
      fs.writeFileSync(path.join(root, "src/index.ts"), "export const x = 3;\n");
      let blocked = false;
      try {
        git(root, ["commit", "-a", "--quiet", "-m", "feat(x): y"]);
      } catch {
        blocked = true;
      }
      expect(blocked).toBe(true);
    });

    it("refuses when core.hooksPath is already set — unset would not restore it", async () => {
      const root = bareRepo();
      git(root, ["config", "--local", "core.hooksPath", ".config/githooks"]);
      const result = await applyFixes(root, await scanRepo(root));
      expect(result.applied).toHaveLength(0);
      expect(result.skipped[0].reason).toMatch(/core\.hooksPath is already set/);
      expect(git(root, ["config", "--get", "core.hooksPath"]).trim()).toBe(
        ".config/githooks",
      );
      expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
    });

    it("refuses when the repository has linked worktrees (core.hooksPath is shared)", async () => {
      const root = bareRepo();
      const wt = path.join(root, "..", path.basename(root) + "-wt");
      git(root, ["worktree", "add", "--quiet", "-b", "side", wt]);
      try {
        const result = await applyFixes(root, await scanRepo(root));
        expect(result.applied).toHaveLength(0);
        expect(result.skipped[0].reason).toMatch(/worktrees/);
        expect(fs.existsSync(path.join(root, ".githooks"))).toBe(false);
      } finally {
        fs.rmSync(wt, { recursive: true, force: true });
      }
    });

    it("publishes a reversal that removes only its own file", async () => {
      const root = bareRepo();
      const result = await applyFixes(root, await scanRepo(root));
      expect(result.applied[0].reversal).toContain("rm -f .githooks/commit-msg");
      expect(result.applied[0].reversal).not.toContain("git clean");
    });
  });

  it("deletes nothing: every pre-existing tracked path still exists after a run", async () => {
    const root = bareRepo({ "README.md": "# fixture\n", "docs/a.md": "a\n" });
    const before = trackedPaths(root);
    expect(before.length).toBeGreaterThan(0);
    await applyFixes(root, await scanRepo(root));
    for (const p of before) {
      expect(fs.existsSync(path.join(root, p))).toBe(true);
    }
  });
});
