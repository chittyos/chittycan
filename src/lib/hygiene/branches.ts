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
 * The same invariant holds in `remote` mode, with the archive written to and
 * read back from `origin`. Remote mode additionally refuses to delete at all:
 * it is the mode the scheduled job runs in, so it does the reversible half
 * (archive) unattended and reports the irreversible half as a proposal.
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
  /**
   * Remote mode only. The branch qualifies for deletion and its tip is safely
   * archived, but nothing was deleted — a human decides. Never set in local
   * mode, where `--prune-merged` deletes under a human who typed it.
   */
  proposedDelete?: boolean;
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
  /**
   * Operate on `origin/<name>` and archive to `refs/archive/<name>` ON THE
   * REMOTE. Deletion is unconditionally refused in this mode: it is the mode
   * a cron runs in, and unattended deletion of a remote branch is the one
   * operation in this file whose blast radius is not local to one machine.
   */
  remote?: boolean;
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
    // Remote mode archives both bands under one flag. Archiving is a pure ref
    // write there too, and the flag that would otherwise gate the merged band
    // (`--prune-merged`) means "delete" — which remote mode never does.
    const archiveBoth = Boolean(opts.remote) && !dryRun;
    if (!archiveBoth) {
      if (merged && !opts.pruneMerged && !dryRun) continue;
      if (gone && !merged && !opts.archiveGone && !dryRun) continue;
    }

    const why = refusal(b, defaultBranch);
    if (why) {
      actions.push({ branch: b.name, sha: "", archivedAs: null, deleted: false, refused: why });
      continue;
    }

    let sha = "";
    try {
      sha = (await git(root, ["rev-parse", opts.remote ? `origin/${b.name}` : b.name])).trim();
    } catch {
      actions.push({ branch: b.name, sha: "", archivedAs: null, deleted: false, refused: "unresolvable ref" });
      continue;
    }

    if (dryRun) {
      actions.push({
        branch: b.name, sha, archivedAs: null, deleted: false,
        // Carried in dry run too. It marks eligibility, not an action taken —
        // and a dry run that dropped it rendered a report with no branches in
        // any section, which reads as "nothing qualifies" rather than
        // "nothing was written".
        ...(opts.remote && merged ? { proposedDelete: true } : {}),
        refused: null,
      });
      continue;
    }

    const archiveRef = `refs/archive/${b.name}`;
    let readBack = "";
    try {
      if (opts.remote) {
        // Check BEFORE pushing. git only enforces fast-forward on refs/heads/*
        // and refs/tags/*; a plain push to refs/archive/* silently overwrites,
        // which would destroy a previously archived tip — the exact loss this
        // whole module exists to prevent. Verified by test, not assumed.
        const existing = (await git(root, ["ls-remote", "origin", archiveRef]))
          .trim().split(/\s+/)[0] ?? "";
        if (existing && existing !== sha) {
          actions.push({
            branch: b.name, sha, archivedAs: null, deleted: false,
            refused: `archive ref already holds ${existing.slice(0, 8)} — refusing to overwrite`,
          });
          continue;
        }
        // The ls-remote check above is advisory: another client can create the
        // ref in the gap before this push. An empty lease expectation makes the
        // guarantee atomic — the push is rejected unless the ref is still
        // absent on the server, so the check-then-write race cannot silently
        // clobber someone else's archive.
        const lease = existing
          ? `--force-with-lease=${archiveRef}:${existing}`
          : `--force-with-lease=${archiveRef}:`;
        // Read back from the REMOTE, not from a local ref that a
        // successful-looking push may not have created.
        await git(root, ["push", lease, "origin", `${sha}:${archiveRef}`]);
        const ls = await git(root, ["ls-remote", "origin", archiveRef]);
        readBack = ls.trim().split(/\s+/)[0] ?? "";
      } else {
        await git(root, ["update-ref", archiveRef, sha]);
        readBack = (await git(root, ["rev-parse", archiveRef])).trim();
      }
    } catch (e) {
      actions.push({
        branch: b.name, sha, archivedAs: null, deleted: false,
        refused: `archive failed: ${(e as Error).message.split("\n")[0]}`,
      });
      continue;
    }

    // Read back before trusting it. An archive that did not land turns the
    // subsequent delete from safe into destructive, and this is the only
    // place that distinction is enforced.
    if (readBack !== sha) {
      actions.push({
        branch: b.name, sha, archivedAs: null, deleted: false,
        refused: `archive read-back mismatch (${readBack || "missing"}) — refusing to delete`,
      });
      continue;
    }

    let deleted = false;
    if (merged && opts.pruneMerged && !opts.remote) {
      // -d, never -D: it refuses anything not fully merged, which is a second
      // independent check on the classification.
      await git(root, ["branch", "-d", b.name]);
      deleted = true;
    }

    actions.push({
      branch: b.name,
      sha,
      archivedAs: archiveRef,
      deleted,
      // Archived and eligible, but this mode never deletes. Surfacing it as a
      // proposal is the whole point: the cron does the reversible half and
      // leaves the irreversible half to a human.
      ...(opts.remote && merged ? { proposedDelete: true } : {}),
      refused: null,
    });
  }

  return {
    actions,
    dryRun,
    reversal: opts.remote
      // Two steps, not one: the archive ref exists only on the remote, and a
      // push refspec resolves its source LOCALLY. The one-step form fails with
      // "src refspec does not match any" — a reversal command that does not
      // run is the same as no reversal at all.
      ? `git -C ${root} fetch origin refs/archive/<name>:refs/archive/<name> && ` +
        `git -C ${root} push origin refs/archive/<name>:refs/heads/<name>   # restores any branch on the remote, tip intact`
      : `git -C ${root} branch <name> refs/archive/<name>   # restores any branch, tip intact`,
  };
}
