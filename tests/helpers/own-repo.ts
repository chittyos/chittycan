import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Throw unless `dir` is under the OS temp directory and git resolves its
 * repository inside `dir`. Call right after `git init` / `git clone`, before
 * anything else writes to the repo: if a GIT_DIR from a git hook leaked through,
 * git resolves the real repository instead, and the next `git config` or
 * `git commit` would write there (issue #190).
 */
export function assertOwnRepo(dir: string): void {
  const root = fs.realpathSync(dir);
  const tmp = fs.realpathSync(os.tmpdir());
  if (!root.startsWith(tmp + path.sep)) {
    throw new Error(`fixture repo ${root} is not under the temp directory ${tmp}`);
  }
  const gitDir = fs.realpathSync(
    execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim(),
  );
  if (gitDir !== root && !gitDir.startsWith(root + path.sep)) {
    throw new Error(`fixture repo ${root} resolves to git dir ${gitDir}, outside the fixture`);
  }
}
