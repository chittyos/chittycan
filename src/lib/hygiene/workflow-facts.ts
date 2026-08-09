/**
 * Collect the git state that `policy.ts` decides on.
 *
 * Everything here is READ-ONLY. No command in this file stages, commits,
 * checks out, stashes, or writes a ref. That is a hard invariant: facts are
 * collected on session start against repos other sessions are actively using,
 * so collection itself must be incapable of disturbing them.
 *
 * `git` is the source of truth for every field. Nothing is inferred from
 * filenames or reimplemented — notably ignore-matching, which is delegated to
 * `git status` rather than parsed out of .gitignore, because trailing-slash
 * semantics are subtle enough to have caused two separate defects already.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-workflow-facts
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WorkflowFacts, BranchCredibility } from "./policy.js";

const exec = promisify(execFile);

interface GitResult {
  stdout: string;
  code: number;
}

/**
 * Run git and return output plus exit code.
 *
 * git uses non-zero exits as DATA, not just failure: `rev-parse` on a missing
 * upstream exits 128, `check-ignore` exits 1 for "no match". Throwing on
 * non-zero would turn ordinary answers into crashes, so callers inspect
 * `code`. A genuinely broken invocation still surfaces — see collect().
 */
async function git(root: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout } = await exec("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number };
    return { stdout: e.stdout ?? "", code: typeof e.code === "number" ? e.code : 1 };
  }
}

/** Which git operation is mid-flight, or null. */
async function inProgressOperation(root: string): Promise<string | null> {
  const dir = (await git(root, ["rev-parse", "--git-dir"])).stdout.trim();
  if (!dir) return null;
  const base = dir.startsWith("/") ? dir : `${root}/${dir}`;

  // Order matters only for the label; any one of these blocks automation.
  const markers: [string, string][] = [
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["MERGE_HEAD", "merge"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["BISECT_LOG", "bisect"],
  ];
  const { existsSync } = await import("node:fs");
  for (const [file, label] of markers) {
    if (existsSync(`${base}/${file}`)) return label;
  }
  return null;
}

/**
 * Porcelain v1 is parsed rather than v2 because its untracked/modified split
 * is unambiguous and stable. Renames are treated as modifications: for the
 * purpose of "is there work here that would be lost", a rename is work.
 */
function parseStatus(stdout: string): { modified: string[]; untracked: string[] } {
  const modified: string[] = [];
  const untracked: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (!path) continue;
    if (code === "??") untracked.push(path);
    else modified.push(path);
  }
  return { modified, untracked };
}

/** Refs under refs/wip/ — captures a prior session left behind. */
async function orphanedWipRefs(root: string, currentSession?: string): Promise<string[]> {
  const res = await git(root, ["for-each-ref", "--format=%(refname)", "refs/wip/"]);
  if (res.code !== 0) return [];
  return res.stdout
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => !currentSession || !r.endsWith(`/${currentSession}`));
}


/**
 * Which set of branches to judge.
 *
 * `local` is what a developer sees in `git branch`. `remote` is what the
 * scheduled fleet job sees: a fresh `actions/checkout` has exactly one local
 * branch, so a cron that judged local refs would always report "nothing to do"
 * while the remote accumulated hundreds of dead branches.
 */
export type BranchScope = "local" | "remote";

/**
 * Judge every branch in scope as a merge proposal.
 *
 * `merge-tree` is used rather than an actual trial merge: it computes the
 * result in memory and touches neither the index nor the working tree, so this
 * stays safe to run against a repo another session is using.
 */
async function branchCredibility(
  root: string,
  defaultBranch: string,
  scope: BranchScope = "local",
): Promise<BranchCredibility[]> {
  const base = `origin/${defaultBranch}`;
  if ((await git(root, ["rev-parse", "--verify", "--quiet", base])).code !== 0) {
    return [];
  }
  const remote = scope === "remote";
  const listed = await git(root, [
    "for-each-ref",
    "--format=%(refname:short)",
    remote ? "refs/remotes/origin/" : "refs/heads/",
  ]);
  // A remote-tracking ref is never checked out by definition, so the worktree
  // scan is skipped rather than run and ignored — in a fresh Actions checkout
  // it would report only the default branch anyway.
  const checkedOut = remote
    ? new Set<string>()
    : new Set(
        (await git(root, ["worktree", "list", "--porcelain"])).stdout
          .split("\n")
          .filter((l) => l.startsWith("branch "))
          .map((l) => l.replace("branch refs/heads/", "").trim()),
      );

  const names = listed.stdout
    .split("\n")
    .map((n) => n.trim())
    // for-each-ref on refs/remotes/origin/ yields `origin/<name>`; the rest of
    // the pipeline names branches without the remote, so strip it here and
    // resolve back to `origin/<name>` only when touching git.
    // `refs/remotes/origin/HEAD` shortens to `origin`, NOT `origin/HEAD`, so it
    // survives the prefix strip as the empty string and must be dropped before
    // it becomes a branch named "origin" that resolves to nothing.
    .filter((n) => !remote || n !== "origin")
    .map((n) => (remote && n.startsWith("origin/") ? n.slice("origin/".length) : n))
    .filter((n) => n && n !== defaultBranch && n !== "HEAD");

  const out: BranchCredibility[] = [];
  for (const name of names) {
    const ref = remote ? `origin/${name}` : name;
    const mb = await git(root, ["merge-base", ref, base]);
    if (mb.code !== 0) continue;
    const counts = await git(root, ["rev-list", "--left-right", "--count", `${base}...${ref}`]);
    const [behindRaw, uniqueRaw] = counts.stdout.trim().split(/\s+/);
    const tree = await git(root, ["merge-tree", mb.stdout.trim(), base, ref]);
    const conflicts = (tree.stdout.match(/^<<<<<<< /gm) ?? []).length;
    out.push({
      name,
      unique: Number(uniqueRaw) || 0,
      behind: Number(behindRaw) || 0,
      conflicts,
      checkedOut: checkedOut.has(name),
    });
  }
  return out;
}

export interface CollectOptions {
  /** Current session id, so its own capture is not reported as orphaned. */
  sessionId?: string;
}

/**
 * Judge the branches on `origin` rather than the ones checked out locally.
 *
 * Split out from `collectWorkflowFacts` because the scheduled job needs only
 * this one field: collecting the rest (status, wip refs, in-progress state)
 * describes a CI runner's throwaway working tree, which is never interesting.
 */
export async function collectRemoteBranchFacts(
  root: string,
): Promise<{ defaultBranch: string; branches: BranchCredibility[] }> {
  const repoRoot = (
    await git(root, ["rev-parse", "--show-toplevel"])
  ).stdout.trim();
  if (!repoRoot) throw new Error(`not a git repository: ${root}`);

  // Ask the REMOTE what its default branch is, rather than reading the local
  // `origin/HEAD` symref. `actions/checkout` does not create that symref, so in
  // the scheduled job it is normally absent — and the obvious fallback (assume
  // `main`, else `master`) is silently wrong on a repo whose default is
  // `trunk` or `develop`: `origin/<wrong>` fails to resolve, branchCredibility
  // returns [], and the run reports a clean remote having examined nothing.
  // That is the precise failure this whole program exists to prevent, so an
  // unresolvable default is thrown, never guessed.
  const symref = await git(repoRoot, ["ls-remote", "--symref", "origin", "HEAD"]);
  const advertised = symref.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m)?.[1];

  const local = await git(repoRoot, ["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const defaultBranch =
    advertised ??
    (local.code === 0 && local.stdout.trim()
      ? local.stdout.trim().replace(/^origin\//, "")
      : undefined);

  if (!defaultBranch) {
    throw new Error(
      "cannot determine origin's default branch: `git ls-remote --symref origin HEAD` " +
        "advertised none and origin/HEAD is not set locally. Refusing to guess — a " +
        "wrong base makes every branch look unlandable or every branch look clean.",
    );
  }

  return {
    defaultBranch,
    branches: await branchCredibility(repoRoot, defaultBranch, "remote"),
  };
}

/**
 * Throws only when `root` is not a git repository. Every other failure
 * degrades to a conservative value — a field that cannot be read must never
 * make a rule look SAFER than reality. Unknown upstream state reports
 * `noUpstream`, not `ahead: 0`, so no push/merge rule fires on a guess.
 */
export async function collectWorkflowFacts(
  root: string,
  opts: CollectOptions = {},
): Promise<WorkflowFacts> {
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    throw new Error(`not a git repository: ${root}`);
  }
  const repoRoot = top.stdout.trim();

  const [branchRes, statusRes, inProgress] = await Promise.all([
    git(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    // `all`, not `normal`: git collapses an untracked directory to a single
    // `?? big/` entry, so a repo with 96 loose files reported 21. A fleet
    // survey under-reporting protected work is the dangerous direction.
    git(repoRoot, ["status", "--porcelain", "--untracked-files=all"]),
    inProgressOperation(repoRoot),
  ]);

  // Non-zero here means detached HEAD, which is a real state, not an error.
  const branch = branchRes.code === 0 ? branchRes.stdout.trim() || null : null;

  // origin/HEAD is often unset on clones; fall back rather than assume "main".
  const headRef = await git(repoRoot, [
    "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD",
  ]);
  const defaultBranch =
    headRef.code === 0 && headRef.stdout.trim()
      ? headRef.stdout.trim().replace(/^origin\//, "")
      : (await git(repoRoot, ["rev-parse", "--verify", "--quiet", "refs/heads/main"])).code === 0
        ? "main"
        : "master";

  const { modified, untracked } = parseStatus(statusRes.stdout);

  // Counting requires an upstream. Absent one, report noUpstream and leave the
  // counts at 0 — every rule that reads them also checks noUpstream, so an
  // unknown upstream can never be mistaken for "in sync".
  const upstream = await git(repoRoot, [
    "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}",
  ]);
  const noUpstream = upstream.code !== 0 || !upstream.stdout.trim();

  let ahead = 0;
  let behind = 0;
  if (!noUpstream) {
    const counts = await git(repoRoot, [
      "rev-list", "--left-right", "--count", "@{u}...HEAD",
    ]);
    if (counts.code === 0) {
      const [b, a] = counts.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
      behind = b ?? 0;
      ahead = a ?? 0;
    }
  }

  const wipRefs = await orphanedWipRefs(repoRoot, opts.sessionId);
  const branches = await branchCredibility(repoRoot, defaultBranch);

  // Staleness is deliberately conservative: any loose work counts as stale
  // unless this session already captured it. Re-capturing costs one ref;
  // failing to capture costs the work.
  const ownCapture = opts.sessionId
    ? (await git(repoRoot, [
        "rev-parse", "--verify", "--quiet", `refs/wip/${opts.sessionId}`,
      ])).code === 0
    : false;

  return {
    root: repoRoot,
    branch,
    defaultBranch,
    modified,
    untracked,
    ahead,
    behind,
    noUpstream,
    inProgress,
    orphanedWipRefs: wipRefs,
    branches,
    captureIsStale: (modified.length > 0 || untracked.length > 0) && !ownCapture,
  };
}
