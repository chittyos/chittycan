/**
 * Git workflow policy — what to do, given the state of a repo and an event.
 *
 * This file is deliberately a TABLE, not logic. The operator is not a git
 * expert and should be able to read this and say "no, not that" without
 * reading any other file. Every rule states: what it looks at, what it does,
 * how to undo it, and who is allowed to trigger it.
 *
 * @canonical-uri chittycanon://core/libraries/hygiene-policy
 *
 * ## Tiers
 *
 * The tier decides WHO may execute a decision, not how bad the situation is.
 *
 *   auto     Non-destructive and reversible. Runs unattended, no confirmation.
 *            Hard requirement: cannot lose work even if the facts are wrong.
 *   propose  Reversible but visible. A synth may run it; it is announced.
 *   review   Needs a separated adversarial review first (reviewer != author).
 *   human    Needs the operator. Irreversible, or requires judgement no rule has.
 *   alarm    Automation must NOT act. State is inconsistent; acting could
 *            destroy work. Report and stop.
 *
 * The `auto` tier is the load-bearing one: it is what runs when a session dies
 * at 3am and nobody is watching. Nothing enters `auto` unless applying it to a
 * repo whose facts were MISREAD still leaves every byte recoverable.
 */

export type Tier = "auto" | "propose" | "review" | "human" | "alarm";

/** What caused policy evaluation. Rules may fire on some triggers only. */
export type Trigger =
  | "session_start"
  | "session_end"
  | "command"
  | "pre_commit"
  | "pull_request";

/** Who is asking. Synths may not execute `human`-tier decisions. */
export type Actor = "human" | "synth";

/** Observable git state. Every field is read-only and cheap to collect. */
export interface WorkflowFacts {
  root: string;
  /** Current branch, or null when HEAD is detached. */
  branch: string | null;
  /** The repo's default branch (origin/HEAD), e.g. "main". */
  defaultBranch: string;
  /** Tracked files with uncommitted modifications. */
  modified: string[];
  /** Untracked, non-ignored files. These have no reflog and no stash entry. */
  untracked: string[];
  /** Commits on the current branch not on its upstream. */
  ahead: number;
  /** Commits on the upstream not on the current branch. */
  behind: number;
  /** True when the branch has no upstream configured. */
  noUpstream: boolean;
  /** A git operation is mid-flight: merge, rebase, cherry-pick, revert, bisect. */
  inProgress: string | null;
  /** Refs that look like captured work from a session that never came back. */
  orphanedWipRefs: string[];
  /** Whether the last capture of this working tree is still current. */
  captureIsStale: boolean;
  /** Every local branch, judged as a merge proposal. */
  branches: BranchCredibility[];
}

/**
 * A branch's standing as a PROPOSAL TO CHANGE the default branch — which is
 * the only job a branch has.
 *
 * Age is deliberately not a field. A two-day-old branch whose diff no longer
 * applies is dead; a sixty-day-old branch that still merges cleanly and whose
 * assumptions hold is alive. Age is a proxy that misclassifies both.
 */
export interface BranchCredibility {
  name: string;
  /** Commits on this branch that are not on the default branch. */
  unique: number;
  /** Commits on the default branch that are not here. */
  behind: number;
  /** Conflict hunks a merge into the current default branch would produce. */
  conflicts: number;
  /** True when a worktree currently has it checked out — never touch these. */
  checkedOut: boolean;
}

/**
 * Drift is a CLOSING WINDOW, not a binary.
 *
 * The cost of rescuing a branch rises far faster than its distance: at 20
 * behind it is one `git merge`; at 300 it is archaeology against assumptions
 * that expired months ago. So the useful signal is not "is this stale" but
 * "how much longer can this still be caught cheaply" — and the action has to
 * escalate before the window shuts, not after.
 *
 * Bands are defaults, calibrated against measured data: across 43 branches in
 * chittyentity the live set sat at 0-128 behind and the abandoned set at
 * 160-328, with a clean gap between and — notably — ZERO conflicts anywhere.
 * That work was never contradicted, only stranded. Repos with a different
 * commit rate need different numbers, so these are configurable.
 */
export type DriftBand = "current" | "drifting" | "closing" | "gone";

export interface DriftThresholds {
  /** Below this, drift is normal and needs no action. */
  drifting: number;
  /** Past this, the window is closing — act now or accept losing it. */
  closing: number;
}

export const DRIFT_DEFAULTS: DriftThresholds = { drifting: 25, closing: 150 };

/**
 * Conflicts collapse the window immediately regardless of distance: a diff
 * that no longer applies cannot be rescued by merging harder.
 */
export function driftBand(
  b: BranchCredibility,
  t: DriftThresholds = DRIFT_DEFAULTS,
): DriftBand {
  if (b.conflicts > 0) return "gone";
  if (b.behind >= t.closing) return "gone";
  if (b.behind >= t.drifting) return "closing";
  if (b.behind > 0) return "drifting";
  return "current";
}

export interface Decision {
  /** Stable id — used to suppress, audit, and test individual rules. */
  id: string;
  tier: Tier;
  /** One sentence, addressed to the operator, no git jargon where avoidable. */
  summary: string;
  /** Why this fired, in terms of the facts. */
  because: string;
  /** The exact command that performs it. Never hidden. */
  command: string;
  /** The exact command that undoes it, or null when nothing was changed. */
  reversal: string | null;
}

/**
 * Rules are evaluated in order and ALL matching rules fire. They are not
 * mutually exclusive: a dirty tree on the default branch legitimately produces
 * both "capture the work" and "get off the default branch".
 */
interface Rule {
  id: string;
  tier: Tier;
  triggers: Trigger[];
  when: (f: WorkflowFacts) => boolean;
  decide: (f: WorkflowFacts) => Omit<Decision, "id" | "tier">;
}

const hasLooseWork = (f: WorkflowFacts) =>
  f.modified.length > 0 || f.untracked.length > 0;

export const RULES: Rule[] = [
  // ── alarm ─────────────────────────────────────────────────────────────
  // Checked first. When state is inconsistent, no other rule should run:
  // a capture during an unfinished merge records a half-merged tree as if it
  // were intentional work.
  {
    id: "operation-in-progress",
    tier: "alarm",
    triggers: ["session_start", "session_end", "command", "pre_commit"],
    when: (f) => f.inProgress !== null,
    decide: (f) => ({
      summary: `A ${f.inProgress} is half-finished in this repo. Automation has stopped.`,
      because:
        `git reports an in-progress ${f.inProgress}. The working tree is a ` +
        `partial result, not a state anyone chose. Capturing or branching it ` +
        `would record that partial state as if it were intended.`,
      command: `git -C ${f.root} status`,
      reversal: null,
    }),
  },
  {
    id: "detached-head-with-work",
    tier: "alarm",
    triggers: ["session_start", "session_end", "command"],
    when: (f) => f.branch === null && hasLooseWork(f),
    decide: (f) => ({
      summary:
        "There is uncommitted work on a detached HEAD — it belongs to no branch.",
      because:
        `HEAD is detached and ${f.modified.length + f.untracked.length} ` +
        `file(s) are uncommitted. Checking out any branch from here discards ` +
        `them silently.`,
      command: `git -C ${f.root} status`,
      reversal: null,
    }),
  },

  // ── auto ──────────────────────────────────────────────────────────────
  // Everything here is additive. It writes new refs and never moves HEAD,
  // never stages, never deletes. Safe to run against a repo another session
  // is actively using.
  {
    id: "capture-loose-work",
    tier: "auto",
    triggers: ["session_start", "session_end", "command"],
    when: (f) => f.inProgress === null && hasLooseWork(f) && f.captureIsStale,
    decide: (f) => ({
      summary: `Saving ${f.modified.length + f.untracked.length} uncommitted file(s) to a recovery ref.`,
      because:
        `Untracked and uncommitted files have no reflog and no stash entry. ` +
        `If this session dies, or another session runs 'git clean', they are ` +
        `unrecoverable. This writes them to a ref without touching your index ` +
        `or working tree.`,
      command: `can wip capture ${f.root}`,
      reversal: `git -C ${f.root} update-ref -d refs/wip/<ref>`,
    }),
  },
  {
    id: "surface-orphaned-work",
    tier: "auto",
    triggers: ["session_start"],
    when: (f) => f.orphanedWipRefs.length > 0,
    decide: (f) => ({
      summary: `${f.orphanedWipRefs.length} recovery ref(s) from a session that never finished.`,
      because:
        `These were captured by a session that exited without cleaning up. ` +
        `Reporting them is the whole point — work is only lost when nobody ` +
        `knows it exists.`,
      command: `can wip list ${f.root}`,
      reversal: null,
    }),
  },

  // ── propose ───────────────────────────────────────────────────────────
  {
    id: "work-on-default-branch",
    tier: "propose",
    triggers: ["session_start", "command", "pre_commit"],
    when: (f) =>
      f.inProgress === null &&
      f.branch === f.defaultBranch &&
      hasLooseWork(f),
    decide: (f) => ({
      summary: `Move this work off ${f.defaultBranch} onto a branch of its own.`,
      because:
        `You are on ${f.defaultBranch} with uncommitted changes. On a shared ` +
        `clone that is how unrelated in-flight work gets swept into someone ` +
        `else's commit. The work is already captured, so this cannot lose it.`,
      command: `git -C ${f.root} wt <branch-name>`,
      reversal: `git -C ${f.root} wt --rm <branch-name>`,
    }),
  },
  {
    id: "branch-behind-upstream",
    tier: "propose",
    triggers: ["session_start", "command"],
    when: (f) => f.behind > 0 && !hasLooseWork(f) && f.inProgress === null,
    decide: (f) => ({
      summary: `This branch is ${f.behind} commit(s) behind. Bring it up to date.`,
      because:
        `Working from stale code produces conflicts later and reviews against ` +
        `a base that no longer exists. Merge rather than rebase — it ` +
        `fast-forwards, keeps history intact, and never needs --force.`,
      command: `git -C ${f.root} merge --ff-only origin/${f.defaultBranch}`,
      reversal: `git -C ${f.root} reset --hard ORIG_HEAD`,
    }),
  },
  {
    id: "unpushed-commits",
    tier: "propose",
    triggers: ["session_end", "command"],
    when: (f) => f.ahead > 0 && f.branch !== f.defaultBranch,
    decide: (f) => ({
      summary: `${f.ahead} commit(s) exist only on this machine. Push them.`,
      because:
        `A commit that has never been pushed survives exactly one disk ` +
        `failure and zero re-clones. Pushing costs nothing and makes the work ` +
        `visible to every other surface you work from.`,
      command: `git -C ${f.root} push -u origin ${f.branch ?? "<branch>"}`,
      reversal: `git push origin --delete ${f.branch ?? "<branch>"}`,
    }),
  },

  // ── review ────────────────────────────────────────────────────────────
  // Merging is where a wrong decision becomes other people's problem, so it
  // requires a reviewer that is not whoever wrote the code.
  {
    id: "ready-to-merge",
    tier: "review",
    triggers: ["command"],
    when: (f) =>
      f.ahead === 0 && f.behind === 0 && !hasLooseWork(f) && !f.noUpstream,
    decide: (f) => ({
      summary: "Branch is clean and in sync — eligible for review and merge.",
      because:
        `Nothing uncommitted, nothing unpushed, nothing behind. With one ` +
        `human operator a required-review rule cannot be self-satisfied, so ` +
        `the gate is a separated adversarial review, not a second pair of eyes.`,
      command: `can hygiene review ${f.root}`,
      reversal: null,
    }),
  },

  // ── branch lifecycle ──────────────────────────────────────────────────
  // A branch's only job is to be a credible proposal to change the default
  // branch. These rules judge that, and they judge it by mergeability rather
  // than by age: a 2-day-old branch whose diff no longer applies is dead, and
  // a 60-day-old branch that still merges cleanly is alive.
  {
    id: "branch-merged",
    tier: "auto",
    triggers: ["session_start", "command"],
    when: (f) => f.branches.some((b) => b.unique === 0 && !b.checkedOut),
    decide: (f) => {
      const gone = f.branches.filter((b) => b.unique === 0 && !b.checkedOut);
      return {
        summary: `${gone.length} branch(es) are fully merged and hold nothing unique.`,
        because:
          `${gone.map((b) => b.name).join(", ")} — zero commits not already on ` +
          `the default branch. Deleting them loses nothing, and leaving them ` +
          `costs attention: they are indistinguishable from real pending work ` +
          `in every branch listing.`,
        command: `can wip branches --prune-merged ${f.root}`,
        reversal: `git -C ${f.root} branch <name> <sha>  # sha is printed before deletion`,
      };
    },
  },
  {
    id: "branch-window-closing",
    tier: "propose",
    triggers: ["session_start", "command"],
    when: (f) =>
      f.branches.some((b) => b.unique > 0 && driftBand(b) === "closing"),
    decide: (f) => {
      const at = f.branches.filter(
        (b) => b.unique > 0 && driftBand(b) === "closing",
      );
      return {
        summary: `${at.length} branch(es) are drifting far enough to be worth catching now.`,
        because:
          `${at.map((b) => `${b.name} (${b.behind} behind)`).join(", ")}. ` +
          `Still merge clean, so rescuing costs one merge each. Left alone ` +
          `they cross into the range where the work is stranded — not wrong, ` +
          `just too far from current assumptions to land. This is the last ` +
          `cheap moment.`,
        command: `git -C ${f.root} merge origin/${f.defaultBranch}  # per branch`,
        reversal: `git -C ${f.root} reset --hard ORIG_HEAD`,
      };
    },
  },
  {
    id: "branch-window-gone",
    tier: "propose",
    triggers: ["session_start", "command"],
    when: (f) => f.branches.some((b) => b.unique > 0 && driftBand(b) === "gone"),
    decide: (f) => {
      const gone = f.branches.filter(
        (b) => b.unique > 0 && driftBand(b) === "gone",
      );
      const conflicted = gone.filter((b) => b.conflicts > 0).length;
      return {
        summary: `${gone.length} branch(es) can no longer land. Archive them.`,
        because:
          `${conflicted} no longer apply to the current default branch; the ` +
          `rest are far enough behind that their assumptions have expired. ` +
          `Archiving moves the tip to refs/archive/ — every commit stays ` +
          `permanently recoverable and reachable by git log, but it stops ` +
          `appearing in branch lists and PR flows. Nothing is deleted; it ` +
          `just stops asking for a decision it can no longer receive.`,
        command: `can wip branches --archive-gone ${f.root}`,
        reversal: `git -C ${f.root} branch <name> refs/archive/<name>`,
      };
    },
  },

  // ── human ─────────────────────────────────────────────────────────────
  {
    id: "diverged-branch",
    tier: "human",
    triggers: ["session_start", "command"],
    when: (f) => f.ahead > 0 && f.behind > 0,
    decide: (f) => ({
      summary: `This branch and its upstream have both moved (${f.ahead} local, ${f.behind} remote). You need to choose.`,
      because:
        `Divergence has no safe default. Merging, rebasing, and resetting ` +
        `each lose something different, and which is correct depends on what ` +
        `you intended — which no rule can read. Work is already captured, so ` +
        `nothing is at risk while you decide.`,
      command: `git -C ${f.root} log --oneline --left-right @{u}...HEAD`,
      reversal: null,
    }),
  },
];

export interface EvaluateOptions {
  trigger: Trigger;
  actor: Actor;
  /** Rule ids to skip, e.g. from repo config. */
  suppress?: string[];
}

/** Tiers an actor is permitted to execute without escalating. */
export const EXECUTABLE_BY: Record<Actor, Tier[]> = {
  synth: ["auto", "propose"],
  human: ["auto", "propose", "review", "human"],
};

/**
 * Pure. Same facts + same options always yield the same decisions, which is
 * what makes this testable without a repo and safe to run anywhere.
 *
 * When any `alarm` rule fires, ONLY alarms are returned. Inconsistent state
 * must not be acted on, and returning a tidy list of actions alongside an
 * alarm invites exactly that.
 */
export function evaluate(
  facts: WorkflowFacts,
  opts: EvaluateOptions,
): Decision[] {
  const suppressed = new Set(opts.suppress ?? []);

  const fired = RULES.filter(
    (r) =>
      !suppressed.has(r.id) &&
      r.triggers.includes(opts.trigger) &&
      r.when(facts),
  ).map((r) => ({ id: r.id, tier: r.tier, ...r.decide(facts) }));

  const alarms = fired.filter((d) => d.tier === "alarm");
  return alarms.length > 0 ? alarms : fired;
}

/** Decisions this actor may perform unattended. */
export function autoExecutable(
  decisions: Decision[],
  actor: Actor,
): Decision[] {
  const allowed = new Set(EXECUTABLE_BY[actor]);
  return decisions.filter((d) => allowed.has(d.tier) && d.tier === "auto");
}

/** Decisions that must be escalated to the operator. */
export function needsHuman(decisions: Decision[]): Decision[] {
  return decisions.filter((d) => d.tier === "human" || d.tier === "alarm");
}
