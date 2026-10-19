/**
 * Real git repository fixtures for the repo-hygiene detector tests.
 *
 * No mocking of anything: every repository here is created by a real `git init`
 * on a real temp directory, with real files written to disk and real
 * `git add` / `git commit` invocations. The detector runs real `git ls-files`
 * and real `git check-ignore` against them, which is the entire point — the
 * rules are checkout facts, so a fake checkout would prove nothing.
 *
 * Isolation notes (these are correctness requirements, not tidiness):
 *
 *   - `core.excludesFile=/dev/null` is set LOCALLY on every fixture repo. Git's
 *     global excludes file lives under $HOME and commonly lists `dist`, `out`,
 *     `build`. Without this, `git check-ignore dist` returns "ignored" on a
 *     developer machine and "not ignored" on a bare CI runner, so the rule-2
 *     positive case would pass in one environment and fail in the other.
 *   - `commit.gpgsign=false` locally: a global signing config would make
 *     `git commit` fail or hang on a runner with no key.
 *   - `user.email` / `user.name` locally: a bare runner has no identity, and
 *     `git commit` refuses without one.
 *   - `git init -b main`: never depend on the ambient `init.defaultBranch`.
 *
 * Nothing here touches global git config or the operator's $HOME.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const created: string[] = [];

export interface RepoSpec {
  /** Files written and then committed. Keys are repo-relative paths. */
  committed?: Record<string, string>;
  /** Files written to disk but deliberately NOT added to git. */
  untracked?: Record<string, string>;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

/**
 * Create a real git repository in a fresh temp directory.
 *
 * When `committed` is non-empty the files are written and committed in a single
 * real commit, so `git ls-files` reports them and rules that key on tracked
 * state (1, 3, 4, 6) see them. When it is empty the repository has no commits
 * at all, which is itself a case the detector must survive.
 */
export function createRepo(spec: RepoSpec = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-hygiene-"));
  created.push(root);

  git(root, ["init", "-b", "main", "--quiet"]);
  git(root, ["config", "--local", "user.email", "ci@chitty.cc"]);
  git(root, ["config", "--local", "user.name", "ChittyCan CI"]);
  git(root, ["config", "--local", "commit.gpgsign", "false"]);
  git(root, ["config", "--local", "core.excludesFile", "/dev/null"]);

  const committed = spec.committed ?? {};
  if (Object.keys(committed).length > 0) {
    writeFiles(root, committed);
    git(root, ["add", "--", ...Object.keys(committed)]);
    git(root, ["commit", "--quiet", "-m", "chore: fixture checkout"]);
  }

  if (spec.untracked) writeFiles(root, spec.untracked);

  // macOS resolves /var -> /private/var; the detector reports paths relative to
  // `git rev-parse --show-toplevel`, so return the same view git will.
  return git(root, ["rev-parse", "--show-toplevel"]).trim();
}

/** Write a real binary-ish build artifact (a .tgz) and commit it. */
export function commitFile(root: string, rel: string, content: string): void {
  writeFiles(root, { [rel]: content });
  git(root, ["add", "--", rel]);
  git(root, ["commit", "--quiet", "-m", `chore: add ${rel}`]);
}

/** Remove every repository this module created. Call from afterEach. */
export function cleanupRepos(): void {
  while (created.length > 0) {
    const dir = created.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
