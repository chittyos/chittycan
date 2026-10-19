/**
 * Existing-first search — "does this already exist, and if so, dupe or dep?"
 *
 * The capability runbook makes this MANDATORY (Step 1) and the placement
 * matrix opens with "Already exists under another name? → Merge / Project".
 * But `capability-governor/scripts/audit_artifact.py:133` implements it as
 * `artifact.get("known_duplicates") or []` — the duplicates must be handed IN.
 * Nothing searches. The mandatory step is performed by whoever remembers to.
 *
 * The consequences are measurable in this ecosystem:
 *   - 7 issues #296-#302 "Implement chittyagent-X as a real MCP server",
 *     created together, 59 days old, one comment each — one decision, seven
 *     open questions.
 *   - 8 branches feat/chittysecrets-migration-* — one abandoned migration.
 *   - 58 local skills registered nowhere, duplicating market entries.
 *
 * This module answers the question mechanically, for ANY artifact — issue,
 * branch, capability, task, finding — because the question is the same one.
 *
 * Deliberately no LLM and no network: it must run in a pre-commit hook, on a
 * session-start path, and offline. Lexical matching finds the near-duplicates
 * that matter here (batch-created families share most of their wording) and
 * says so honestly rather than pretending to understand meaning.
 *
 * @canonical-uri chittycanon://core/libraries/existing-first
 */

/** Anything that can already exist. */
export interface Candidate {
  /** Stable identity if the caller has one — an exact hit short-circuits. */
  key?: string;
  title: string;
  body?: string;
  /** Free-form tags that must overlap for a match to count (repo, rule id). */
  scope?: string[];
}

export interface ExistingItem extends Candidate {
  /** How the caller refers to it: "#302", "refs/heads/x", "CFDXN-12". */
  ref: string;
  /** Days since last activity, when known — drives dupe-vs-dep. */
  ageDays?: number;
  /** Whether it is still open/live. Closed items match but never block. */
  open?: boolean;
}

export interface Match {
  item: ExistingItem;
  /** 0-1. 1.0 means an exact key hit. */
  score: number;
  /** Which signal fired, so a human can audit the verdict. */
  reason: string;
}

/**
 * What to do about the candidate.
 *
 *   create      nothing comparable exists
 *   update      the same thing exists and is live — amend it, do not add
 *   supersede   a comparable thing exists but is stale — the new one replaces
 *               it, and the old should be deprecated rather than left open
 *   cluster     several comparable things exist — they are probably ONE item
 *               fragmented; collapse before adding an N+1th
 */
export type Disposition = "create" | "update" | "supersede" | "cluster";

export interface Verdict {
  disposition: Disposition;
  matches: Match[];
  /** Plain-language justification, safe to paste into an issue. */
  rationale: string;
}

const STOPWORDS = new Set([
  "a","an","the","and","or","of","to","for","in","on","with","as","is","are",
  "be","by","from","that","this","it","its","at","into","real","add","fix",
  "implement","update","support","use","using","via","should","must","new",
]);

/** Words that carry identity, lowercased and stripped of punctuation. */
export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Jaccard over content words.
 *
 * Chosen over substring or edit distance because the failure mode here is
 * batch-created families that share a template and differ by one noun —
 * "Implement chittyagent-quote as a real MCP server" vs "...chittyagent-buyflow
 * as a real MCP server". Those score high on overlap and low on edit distance,
 * and overlap is the signal that matters.
 */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export interface SearchOptions {
  /** Minimum similarity to report. Default tuned to catch template families. */
  threshold?: number;
  /** Past this age (days), a live match is treated as stale → supersede. */
  staleDays?: number;
  /** This many matches means the thing is fragmented, not duplicated. */
  clusterAt?: number;
}

const DEFAULTS: Required<SearchOptions> = {
  threshold: 0.45,
  staleDays: 90,
  clusterAt: 3,
};

/**
 * Search first, then decide. Pure and offline — same inputs, same verdict.
 *
 * Scope acts as a hard filter, not a score contribution: two issues with
 * identical titles in different repos are not duplicates of each other, and
 * letting wording outvote that produces confident nonsense.
 */
export function existingFirst(
  candidate: Candidate,
  corpus: ExistingItem[],
  opts: SearchOptions = {},
): Verdict {
  const o = { ...DEFAULTS, ...opts };

  const inScope = corpus.filter((item) => {
    if (!candidate.scope?.length) return true;
    const theirs = new Set(item.scope ?? []);
    return candidate.scope.every((s) => theirs.has(s));
  });

  // Exact key hit ends the search: identity beats resemblance.
  if (candidate.key) {
    const exact = inScope.find((i) => i.key === candidate.key);
    if (exact) {
      return {
        disposition: exact.open === false ? "supersede" : "update",
        matches: [{ item: exact, score: 1, reason: `exact key ${candidate.key}` }],
        rationale:
          exact.open === false
            ? `${exact.ref} carries this exact key but is closed. Reopen or supersede it rather than filing a sibling.`
            : `${exact.ref} carries this exact key and is open. Update it — a second record splits the history.`,
      };
    }
  }

  const text = `${candidate.title} ${candidate.body ?? ""}`;
  const matches: Match[] = inScope
    .map((item) => ({
      item,
      score: similarity(text, `${item.title} ${item.body ?? ""}`),
      reason: "wording overlap",
    }))
    .filter((m) => m.score >= o.threshold)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return {
      disposition: "create",
      matches: [],
      rationale: `No existing item scored above ${o.threshold} in scope. Safe to create.`,
    };
  }

  // Several comparable items is a different problem from one duplicate: it
  // means an earlier decision was already fragmented. Adding to it is worse
  // than duplicating, so this is reported before dupe-vs-dep is considered.
  if (matches.length >= o.clusterAt) {
    return {
      disposition: "cluster",
      matches,
      rationale:
        `${matches.length} existing items are comparable ` +
        `(${matches.slice(0, 4).map((m) => m.item.ref).join(", ")}${matches.length > 4 ? ", …" : ""}). ` +
        `That is a fragmented decision, not a set of independent questions. ` +
        `Collapse them into one item with a checklist before adding another.`,
    };
  }

  const best = matches[0]!;
  const stale = (best.item.ageDays ?? 0) > o.staleDays || best.item.open === false;

  return {
    disposition: stale ? "supersede" : "update",
    matches,
    rationale: stale
      ? `${best.item.ref} covers this (${Math.round(best.score * 100)}% overlap) but is ` +
        `${best.item.open === false ? "closed" : `${best.item.ageDays}d stale`}. ` +
        `Supersede it: file the new one and deprecate the old, so one of them stops asking.`
      : `${best.item.ref} already covers this (${Math.round(best.score * 100)}% overlap) and is live. ` +
        `Update it instead of creating a duplicate.`,
  };
}
