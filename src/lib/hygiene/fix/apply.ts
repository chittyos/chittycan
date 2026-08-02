/**
 * Repo-hygiene auto-fix engine.
 *
 * Contract: `applyFixes(repoPath, findings)` writes to the WORKING TREE and
 * stops there. It never stages, never commits, never deletes file content,
 * never touches git config, and never runs `git rm` in any form. The only git
 * commands it issues are read-only (`status --porcelain`) plus `checkout --` on
 * its OWN writes when it has to roll itself back.
 *
 * Three properties make that safe rather than merely stated:
 *   1. it refuses to run on a dirty worktree, so the resulting diff is provably
 *      its own;
 *   2. every fixer declares an exact write-set, which is asserted against
 *      `git status --porcelain --untracked-files=all` afterwards;
 *   3. only rules on the fixable allowlist can drive a write — a fixer is
 *      selected by rule id, never by a Finding's prose `remediation_hint`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { collectGitFacts, type GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";
import { commitMsgHookFixer } from "./fixers/commit-msg-hook.js";
import { isFixSkip, type FixPlan, type FixResult, type Fixer } from "./types.js";

const execFileAsync = promisify(execFile);

/** The complete registry. Adding a fixer here is the only way to enable one. */
export const FIXERS: Fixer[] = [commitMsgHookFixer];

export class FixPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixPreconditionError";
  }
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Repo-relative paths reported as changed. `--untracked-files=all` is required,
 * not cosmetic: without it a brand-new `.githooks/` collapses to a single `??
 * .githooks/` directory entry, which would never match the declared write-set
 * `.githooks/commit-msg` and would make every run fail its own subset check.
 */
async function statusPaths(root: string): Promise<string[]> {
  const raw = await git(root, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
  ]);
  const tokens = raw.split("\0").filter((t) => t.length > 0);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    out.push(entry.slice(3));
    if (status[0] === "R" || status[0] === "C") i++; // consume origin path
  }
  return out;
}

async function revert(
  root: string,
  facts: GitFacts,
  plans: FixPlan[],
): Promise<void> {
  for (const plan of plans) {
    for (const w of plan.writes) {
      if (facts.tracked.has(w)) {
        // Restores the committed bytes. Never `git rm`, never `rm` of content
        // that existed before this process ran.
        await git(root, ["checkout", "--", w]).catch(() => undefined);
      } else {
        await unlink(join(root, w)).catch(() => undefined);
      }
    }
  }
}

export async function applyFixes(
  repoPath: string,
  findings: Finding[],
): Promise<FixResult> {
  const facts = await collectGitFacts(repoPath);
  const root = facts.root;

  const dirty = await statusPaths(root);
  if (dirty.length > 0) {
    throw new FixPreconditionError(
      "worktree is dirty; --fix refuses to run so its diff is provably its own " +
        `(${dirty.length} path(s), e.g. ${dirty[0]})`,
    );
  }

  const present = new Set(findings.map((f) => f.id));
  const applied: FixPlan[] = [];
  const skipped = [] as FixResult["skipped"];

  for (const fixer of FIXERS) {
    if (!fixer.rule_ids.every((r) => present.has(r))) continue;
    const outcome = await fixer.plan(facts, findings);
    if (outcome === null) continue;
    if (isFixSkip(outcome)) {
      skipped.push(outcome);
      continue;
    }
    await fixer.apply(root, outcome);
    applied.push(outcome);
  }

  if (applied.length > 0) {
    const allowed = new Set(applied.flatMap((p) => p.writes));
    const after = await statusPaths(root);
    const extra = after.filter((p) => !allowed.has(p));
    if (extra.length > 0) {
      await revert(root, facts, applied);
      throw new FixPreconditionError(
        "fix wrote outside its declared write-set and has been reverted: " +
          extra.join(", "),
      );
    }
  }

  return { applied, skipped };
}
