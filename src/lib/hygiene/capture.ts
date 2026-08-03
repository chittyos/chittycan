/**
 * Capture — make in-flight work survive a crash, without touching the tree.
 *
 * The problem this exists for: sessions die. Cold starts, disconnects,
 * hyperfocus abandonment, a killed agent, a machine restart. Whatever was
 * uncommitted at that moment has no reflog, no stash entry, and nothing to
 * recover from — one `git clean` from gone, and indistinguishable from
 * deliberate scratch work to whoever finds it next.
 *
 * The mechanism is the whole design:
 *
 *   GIT_INDEX_FILE=<temp> git read-tree HEAD
 *   GIT_INDEX_FILE=<temp> git add -- <paths>
 *   git write-tree → git commit-tree → git update-ref refs/wip/<id>
 *
 * A temporary index means HEAD, the real index, and the working tree are
 * never touched. Verified on a live repo mid-session: `git status` was
 * byte-identical before and after, while a real commit containing 12 files
 * appeared on a real ref.
 *
 * That property is what makes this safe to run unattended, on a session-start
 * path, against a repo three other sessions are actively editing. It cannot
 * destroy work even when its inputs are wrong — the worst failure is a
 * redundant ref. Nothing else in the automation gets to be that aggressive,
 * and nothing else needs to be.
 *
 * Deliberately NOT `git stash`: the stash is repository-global, so stashing
 * from one worktree can pop an entry another session is relying on.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-capture
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

export interface CaptureResult {
  /** Full ref written, e.g. "refs/wip/2026-08-03T00-30-a1b2c3". */
  ref: string;
  /** Commit sha of the snapshot. */
  sha: string;
  /** Paths included. */
  files: string[];
  /** True when nothing needed capturing. */
  noop: boolean;
  /** Command that removes it, for the caller to report. */
  reversal: string;
}

export interface CaptureOptions {
  /** Stable per-session id so re-captures replace rather than accumulate. */
  sessionId?: string;
  /** Restrict to these pathspecs. Default: everything uncommitted. */
  paths?: string[];
  /** Message body appended after the generated summary. */
  note?: string;
}

async function git(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  const { stdout } = await exec("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return stdout;
}

/** Uncommitted work: modified-tracked plus untracked-not-ignored. */
async function looseWork(root: string): Promise<string[]> {
  const out = await git(root, [
    "status", "--porcelain", "--untracked-files=normal",
  ]);
  return out
    .split("\n")
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

/**
 * Snapshot uncommitted work onto a ref.
 *
 * Refs live under `refs/wip/`, never `refs/heads/`. That distinction matters
 * more than it looks: a snapshot under refs/heads shows up in `git branch`,
 * in PR flows, and in every branch listing, where it reads as pending work
 * someone should merge. It is not a proposal — it is a floor. (A rescue ref
 * was created as a branch by hand earlier and immediately became a thing that
 * looked like it needed a decision.)
 */
export async function capture(
  root: string,
  opts: CaptureOptions = {},
): Promise<CaptureResult> {
  const files = await looseWork(root);
  const id =
    opts.sessionId ??
    (await git(root, ["rev-parse", "--short", "HEAD"])).trim() +
      "-" +
      Math.abs(hash(files.join("\n"))).toString(36);
  const ref = `refs/wip/${id}`;

  if (files.length === 0) {
    return { ref, sha: "", files: [], noop: true, reversal: "" };
  }

  const dir = await mkdtemp(join(tmpdir(), "chitty-capture-"));
  const indexFile = join(dir, "index");
  try {
    const env = { GIT_INDEX_FILE: indexFile };
    // Seed from HEAD so the snapshot is a full tree, not just the delta —
    // the result is a normal commit anyone can check out or diff.
    await git(root, ["read-tree", "HEAD"], env);
    await git(root, ["add", "--", ...(opts.paths ?? ["."])], env);
    const tree = (await git(root, ["write-tree"], env)).trim();

    const head = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = (
      await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "HEAD")
    ).trim();

    const message =
      `wip: capture ${files.length} uncommitted file(s) from ${branch}\n\n` +
      `Snapshot of work that had no reflog and no stash entry. Written with an\n` +
      `isolated GIT_INDEX_FILE — HEAD, the index, and the working tree were NOT\n` +
      `touched, and nothing was staged on anyone's behalf.\n\n` +
      `This ref is a floor, not a handoff. The working tree remains\n` +
      `authoritative; anything edited after this capture is not in it.\n\n` +
      files.slice(0, 40).map((f) => `  ${f}`).join("\n") +
      (files.length > 40 ? `\n  … and ${files.length - 40} more` : "") +
      (opts.note ? `\n\n${opts.note}` : "");

    const sha = (
      await git(root, ["commit-tree", tree, "-p", head, "-m", message])
    ).trim();
    await git(root, ["update-ref", ref, sha]);

    return {
      ref,
      sha,
      files,
      noop: false,
      reversal: `git -C ${root} update-ref -d ${ref}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Stable, dependency-free string hash for default ref ids. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export interface WipRef {
  ref: string;
  sha: string;
  subject: string;
  ageDays: number;
  fileCount: number;
}

/** Every capture in this repo, newest first. */
export async function listCaptures(root: string): Promise<WipRef[]> {
  const out = await git(root, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname)%09%(objectname)%09%(committerdate:unix)%09%(subject)",
    "refs/wip/",
  ]).catch(() => "");

  const now = Date.now() / 1000;
  const refs: WipRef[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [ref, sha, ts, ...rest] = line.split("\t");
    if (!ref || !sha) continue;
    let fileCount = 0;
    try {
      const stat = await git(root, [
        "diff", "--name-only", `${sha}^`, sha,
      ]);
      fileCount = stat.split("\n").filter(Boolean).length;
    } catch {
      // A capture whose parent is unreachable is still listable — reporting
      // it with an unknown count beats omitting it entirely.
      fileCount = -1;
    }
    refs.push({
      ref,
      sha,
      subject: rest.join("\t"),
      ageDays: Math.floor((now - Number(ts)) / 86400),
      fileCount,
    });
  }
  return refs;
}

/**
 * Restore a capture into a NEW branch, never over the current tree.
 *
 * Returns the command rather than running it: restoring is the one operation
 * here that can collide with live work, so it is the operator's to execute.
 */
export function restoreCommand(root: string, ref: string, branch: string): string {
  return `git -C ${root} branch ${branch} ${ref} && git -C ${root} wt ${branch}`;
}
