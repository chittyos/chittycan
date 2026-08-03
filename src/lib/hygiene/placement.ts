/**
 * Placement — "where should this exist?", answered from canonical contracts.
 *
 * `existing-first.ts` answers whether a thing already exists. This answers the
 * other half: where it BELONGS. Getting this wrong produces an orphan even
 * when the dedup verdict was right — a finding about chittyagent-git filed on
 * chittycan is correctly deduped and still lost.
 *
 * The answer is already written down. Every CHARTER.md declares scope as
 * "IS Responsible For" / "Is NOT Responsible For" bullets. Nothing reads them.
 *
 * The negative half carries more signal than the positive. chittyagent-git's
 * charter excludes "Write operations (commit, push, branch-create, merge,
 * tag)" — and a proposal to extend that worker with a write path was made in
 * this very session, against its own contract, because a human read the
 * positive scope and not the exclusions. An exclusion is a routing decision
 * someone already made deliberately; overriding it should be loud.
 *
 * Coverage is partial and this module says so rather than guessing: of 51
 * chittyagent-* CHARTERs, 30 declare scope sections. For the other 21 the
 * honest answer is "cannot determine", never a low-confidence guess — a wrong
 * owner is worse than no owner, because it looks decided.
 *
 * @canonical-uri chittycanon://core/libraries/placement
 */

import { readFile } from "node:fs/promises";
import { similarity, tokens } from "./existing-first.js";

/** A service's declared scope, parsed from its CHARTER. */
export interface ServiceScope {
  service: string;
  charterPath: string;
  /** Bullets under "IS Responsible For". */
  responsibilities: string[];
  /** Bullets under "Is NOT Responsible For" — deliberate exclusions. */
  exclusions: string[];
  /** Which Pentad documents exist. Absent SECURITY/AGENTS is the norm today. */
  pentad: { charter: boolean; chitty: boolean; claude: boolean; security: boolean; agents: boolean };
}

export interface PlacementCandidate {
  /** What the work is, in the words someone would file it under. */
  description: string;
  /** Optional verbs that sharpen intent: "write", "delete", "deploy". */
  verbs?: string[];
}

export interface PlacementVerdict {
  /** Best-scoring owner, or null when the contracts cannot answer. */
  owner: string | null;
  confidence: number;
  /** Runners-up, so a human can see what it was choosing between. */
  alternatives: { service: string; score: number }[];
  /** Services whose charter EXCLUDES this work. Overriding one is a decision. */
  excludedBy: { service: string; bullet: string }[];
  rationale: string;
}

const SECTION = {
  responsible: /^#+\s*IS\s+Responsible\s+For\s*$/im,
  excluded: /^#+\s*Is\s+NOT\s+Responsible\s+For\s*$/im,
};

/** Bullets following a heading, up to the next heading. */
function bulletsAfter(md: string, heading: RegExp): string[] {
  const m = heading.exec(md);
  if (!m) return [];
  const rest = md.slice(m.index + m[0].length);
  const stop = /^#+\s/m.exec(rest);
  const block = stop ? rest.slice(0, stop.index) : rest;
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Parse one service directory. Returns null when it has no CHARTER at all. */
export async function readServiceScope(
  serviceDir: string,
  service: string,
): Promise<ServiceScope | null> {
  const charterPath = `${serviceDir}/CHARTER.md`;
  let md: string;
  try {
    md = await readFile(charterPath, "utf8");
  } catch {
    return null;
  }
  const [chitty, claude, security, agents] = await Promise.all([
    exists(`${serviceDir}/CHITTY.md`),
    exists(`${serviceDir}/CLAUDE.md`),
    exists(`${serviceDir}/SECURITY.md`),
    exists(`${serviceDir}/AGENTS.md`),
  ]);
  return {
    service,
    charterPath,
    responsibilities: bulletsAfter(md, SECTION.responsible),
    exclusions: bulletsAfter(md, SECTION.excluded),
    pentad: { charter: true, chitty, claude, security, agents },
  };
}

/**
 * Exclusions are matched more permissively than responsibilities.
 *
 * A false positive here costs a warning; a false negative routes work into a
 * service that deliberately refused it. The asymmetry is intentional.
 */
const EXCLUSION_THRESHOLD = 0.28;
const OWNER_THRESHOLD = 0.35;

/**
 * Decide where work belongs from declared scope alone.
 *
 * Returns `owner: null` when no service scores above threshold — the contracts
 * genuinely do not say, and inventing an owner would launder a guess into a
 * decision. `excludedBy` is populated independently of `owner`: a service can
 * both be the best lexical match AND exclude the work, which is precisely the
 * chittyagent-git write-path case and must be visible.
 */
export function placeWork(
  candidate: PlacementCandidate,
  scopes: ServiceScope[],
): PlacementVerdict {
  const text = [candidate.description, ...(candidate.verbs ?? [])].join(" ");
  const cTokens = tokens(text);

  const excludedBy: { service: string; bullet: string }[] = [];
  const scored: { service: string; score: number }[] = [];

  for (const s of scopes) {
    for (const bullet of s.exclusions) {
      // Verb hits are decisive: "write operations (commit, push, merge)"
      // excluded, and the candidate says "write", is a match regardless of
      // how the rest of the sentence is worded.
      const verbHit = (candidate.verbs ?? []).some((v) =>
        tokens(bullet).has(v.toLowerCase()),
      );
      if (verbHit || similarity(text, bullet) >= EXCLUSION_THRESHOLD) {
        excludedBy.push({ service: s.service, bullet });
        break;
      }
    }
    const best = s.responsibilities.reduce(
      (acc, r) => Math.max(acc, similarity(text, r)),
      0,
    );
    if (best > 0) scored.push({ service: s.service, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const excludedNames = new Set(excludedBy.map((e) => e.service));

  if (!top || top.score < OWNER_THRESHOLD) {
    const declaring = scopes.filter((s) => s.responsibilities.length > 0).length;
    return {
      owner: null,
      confidence: top?.score ?? 0,
      alternatives: scored.slice(0, 3),
      excludedBy,
      rationale:
        `No service's declared scope matches above ${OWNER_THRESHOLD}. ` +
        `${declaring}/${scopes.length} charters declare responsibilities at all, ` +
        `so this may be a gap in the contracts rather than in the work. ` +
        `Decide the owner explicitly and write it into that service's CHARTER.`,
    };
  }

  const conflicted = excludedNames.has(top.service);
  return {
    owner: top.service,
    confidence: top.score,
    alternatives: scored.slice(1, 4),
    excludedBy,
    rationale: conflicted
      ? `${top.service} is the closest match (${Math.round(top.score * 100)}%) but its ` +
        `CHARTER explicitly EXCLUDES this work. That exclusion was a deliberate ` +
        `decision; routing here anyway means amending the charter first, not ` +
        `quietly working around it.`
      : `${top.service} declares responsibility for this (${Math.round(top.score * 100)}% match).` +
        (excludedBy.length
          ? ` Note ${excludedBy.length} other service(s) explicitly exclude it, which corroborates the choice.`
          : ""),
  };
}
