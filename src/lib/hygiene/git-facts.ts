/**
 * Checkout facts, collected once per scan via real `git` subprocesses.
 *
 * Every git invocation uses child_process.execFile with an argv array and
 * cwd=repoPath. Never a shell string — repo paths and file names are untrusted
 * input and must never be word-split or glob-expanded by a shell.
 *
 * Notably we do NOT reimplement gitignore matching: `git check-ignore` is the
 * only thing that knows the real precedence of .gitignore / .git/info/exclude /
 * core.excludesFile / negations, so ignore questions are delegated to it.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;

interface GitResult {
  stdout: string;
  code: number;
}

async function git(
  repoPath: string,
  args: string[],
  input?: string,
): Promise<GitResult> {
  try {
    const child = execFileAsync("git", args, {
      cwd: repoPath,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
    });
    if (input !== undefined) {
      child.child.stdin?.end(input);
    }
    const { stdout } = await child;
    return { stdout, code: 0 };
  } catch (err: any) {
    // git uses non-zero exit codes as data (check-ignore: 1 = nothing matched,
    // config --get: 1 = key unset). Surface them instead of throwing.
    if (typeof err?.code === "number") {
      return { stdout: String(err.stdout ?? ""), code: err.code };
    }
    throw err;
  }
}

function splitNul(s: string): string[] {
  return s.split("\0").filter((x) => x.length > 0);
}

export interface GitFacts {
  /** Absolute repository root as reported by `git rev-parse --show-toplevel`. */
  root: string;
  /** Every tracked path, repo-relative, from `git ls-files -z`. */
  tracked: Set<string>;
  /** Sorted array view of `tracked`, for prefix scans. */
  trackedList: string[];
  /** Untracked files from `git status --porcelain -z --untracked-files=all`. */
  untracked: string[];
  /** `git config --get core.hooksPath`, or null when unset. LOCAL ONLY — never committed. */
  coreHooksPath: string | null;
  /**
   * Real gitignore semantics. Returns the subset of `paths` that git considers
   * ignored, via `git check-ignore -v --stdin`.
   */
  checkIgnored(paths: string[]): Promise<Set<string>>;
}

/**
 * Parse `git status --porcelain -z --untracked-files=all` into untracked paths.
 * In -z mode entries are NUL-separated; rename/copy statuses (R/C) emit an extra
 * NUL-separated origin path that must be consumed. Untracked entries ('??')
 * never carry one, but the skip keeps the cursor aligned.
 */
function parseUntracked(raw: string): string[] {
  const tokens = splitNul(raw);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status[0] === "R" || status[0] === "C") {
      i++; // consume the origin path
    }
    if (status === "??") out.push(path);
  }
  return out;
}

export async function collectGitFacts(repoPath: string): Promise<GitFacts> {
  const top = await git(repoPath, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0 || !top.stdout.trim()) {
    throw new Error(
      `hygiene: not a git repository (or git unavailable): ${repoPath}`,
    );
  }
  const root = top.stdout.trim();

  const [lsFiles, status, hooksPath] = await Promise.all([
    git(root, ["ls-files", "-z"]),
    git(root, ["status", "--porcelain", "-z", "--untracked-files=all"]),
    git(root, ["config", "--get", "core.hooksPath"]),
  ]);

  const trackedList = splitNul(lsFiles.stdout);

  const checkIgnoreCache = new Map<string, boolean>();

  async function checkIgnored(paths: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    const unknown: string[] = [];
    for (const p of paths) {
      const cached = checkIgnoreCache.get(p);
      if (cached === undefined) unknown.push(p);
      else if (cached) result.add(p);
    }
    if (unknown.length > 0) {
      // -v prints "<source>:<line>:<pattern>\t<path>" for each matched path.
      // Exit 1 simply means nothing matched.
      const res = await git(
        root,
        ["check-ignore", "-v", "--stdin"],
        unknown.join("\n") + "\n",
      );
      const matched = new Set<string>();
      for (const line of res.stdout.split("\n")) {
        const tab = line.lastIndexOf("\t");
        if (tab === -1) continue;
        matched.add(line.slice(tab + 1));
      }
      for (const p of unknown) {
        const isIgnored = matched.has(p);
        checkIgnoreCache.set(p, isIgnored);
        if (isIgnored) result.add(p);
      }
    }
    return result;
  }

  return {
    root,
    tracked: new Set(trackedList),
    trackedList,
    untracked: parseUntracked(status.stdout),
    coreHooksPath: hooksPath.code === 0 ? hooksPath.stdout.trim() || null : null,
    checkIgnored,
  };
}
