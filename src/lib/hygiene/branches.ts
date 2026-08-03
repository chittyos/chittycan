/**
 * Branch lifecycle operations — archive before delete, always.
 *
 * `policy.ts` emits decisions naming `can wip branches --prune-merged` and
 * `--archive-gone`. Those commands did not exist: a decision printing a
 * command you cannot run is worse than no decision, and this repo has already
 * shipped that defect once.
 *
 * The invariant that makes deletion acceptable at all:
 *
 *   a branch is only ever deleted AFTER its tip is written to refs/archive/
 *   and that ref has been read back and confirmed to hold the same sha.
 *
 * Archiving is a pure ref write. Every commit stays permanently reachable via
 * `git log refs/archive/<name>`, while the branch leaves `git branch` and PR
 * flows — where a stale branch reads as a pending decision it can no longer
 * receive. Nothing is lost; it just stops asking.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-branches
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BranchCredibility } from "./policy.js";

const exec = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

export interface BranchAction {
  branch: string;
  sha: string;
  archivedAs: string | null;
  deleted: boolean;
  /** Populated when the branch was deliberately left alone. */
  refused: string | null;
}

export interface BranchPlan {
  actions: BranchAction[];
  dryRun: boolean;
  reversal: string;
}

export interface BranchOptions {
  /** Archive tips of branches that can no longer land. */
  archiveGone?: boolean;
  /** Archive AND delete branches holding nothing unique. */
  pruneMerged?: boolean;
  /** Default. Nothing is written. */
  dryRun?: boolean;
}

/**
 * Reasons a branch is never touched, regardless of classification.
 *
 * Returned rather than thrown so every refusal is reported — a silently
 * skipped branch is indistinguishable from a handled one in the output, and
 * that ambiguity is exactly what makes fleet operations untrustworthy.
 */
function refusal(
  b: BranchCredibility,
  defaultBranch: string,
): string | null {
  if (b.name === defaultBranch) return "default branch";
  if (b.checkedOut) return "checked out by a worktree";
  return null;
}

export async function planBranches(
  root: string,
  branches: BranchCredibility[],
  defaultBranch: string,
  opts: BranchOptions = {},
): Promise<BranchPlan> {
  const dryRun = opts.dryRun !== false && !opts.archiveGone && !opts.pruneMerged;
  const actions: BranchAction[] = [];

  for (const b of branches) {
    // `closing` branches are deliberately excluded from every mode: they are
    // the only band still cheap to rescue, and archiving them removes them
    // from view precisely when they most need to be seen.
    const merged = b.unique === 0;
    const gone = b.conflicts > 0 || b.behind >= 150;
    if (!merged && !gone) continue;
    if (merged && !opts.pruneMerged && !dryRun) continue;
    if (gone && !merged && !opts.archiveGone && !dryRun) continue;

    const why = refusal(b, defaultBranch);
    if (why) {
      actions.push({ branch: b.name, sha: "", archivedAs: null, deleted: false, refused: why });
      continue;
    }

    let sha = "";
    try {
      sha = (await git(root, ["rev-parse", b.name])).trim();
    } catch {
      actions.push({ branch: b.name, sha: "", archivedAs: null, deleted: false, refused: "unresolvable ref" });
      continue;
    }

    if (dryRun) {
      actions.push({ branch: b.name, sha, archivedAs: null, deleted: false, refused: null });
      continue;
    }

    const archiveRef = `refs/archive/${b.name}`;
    await git(root, ["update-ref", archiveRef, sha]);

    // Read back before trusting it. An archive that did not land turns the
    // subsequent delete from safe into destructive, and this is the only
    // place that distinction is enforced.
    const readBack = (await git(root, ["rev-parse", archiveRef]).catch(() => "")).trim();
    if (readBack !== sha) {
      actions.push({
        branch: b.name, sha, archivedAs: null, deleted: false,
        refused: `archive read-back mismatch (${readBack || "missing"}) — refusing to delete`,
      });
      continue;
    }

    let deleted = false;
    if (merged && opts.pruneMerged) {
      // -d, never -D: it refuses anything not fully merged, which is a second
      // independent check on the classification.
      await git(root, ["branch", "-d", b.name]);
      deleted = true;
    }

    actions.push({ branch: b.name, sha, archivedAs: archiveRef, deleted, refused: null });
  }

  return {
    actions,
    dryRun,
    reversal:
      `git -C ${root} branch <name> refs/archive/<name>   # restores any branch, tip intact`,
  };
}
