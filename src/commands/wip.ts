/**
 * `can wip` — crash-safe work capture and workflow decisions.
 *
 * Separate from `can hygiene` on purpose. `hygiene` audits repo CONFIG
 * (tracked artifacts, missing lint). This is about WORK IN FLIGHT: what is
 * uncommitted right now, what a prior session left behind, and what to do
 * next. Different question, different cadence, different blast radius.
 *
 * Every subcommand is safe to run against a repo other sessions are using.
 * Nothing here stages, checks out, stashes, merges, pushes, or deletes.
 * `restore` prints its command rather than executing it, because restoring
 * is the one operation that can collide with live work.
 *
 * Callable two ways, same core:
 *   human  →  can wip [status|capture|list|restore|learn] [path]
 *   synth  →  import { capture, listCaptures } and { evaluate }
 */

import type { Argv, ArgumentsCamelCase } from "yargs";
import { capture, listCaptures, restoreCommand } from "../lib/hygiene/capture.js";
import { collectWorkflowFacts } from "../lib/hygiene/workflow-facts.js";
import { evaluate, autoExecutable, needsHuman, driftBand } from "../lib/hygiene/policy.js";
import type { Trigger } from "../lib/hygiene/policy.js";
import { recordOffered, analyse, emitLearnedPatterns } from "../lib/hygiene/journal.js";
import { reconcile, formatReconcile } from "../lib/hygiene/reconcile.js";
import { guarded, readDisabled, reenable, degradedCapture, KILL_SWITCH } from "../lib/hygiene/failsafe.js";
import { planBranches } from "../lib/hygiene/branches.js";

const TIER_ORDER = ["alarm", "human", "review", "propose", "auto"] as const;

function fmtTier(t: string): string {
  return t.toUpperCase().padEnd(7);
}

async function status(root: string, trigger: Trigger, json: boolean) {
  const facts = await collectWorkflowFacts(root);
  const decisions = evaluate(facts, { trigger, actor: "human" });

  if (json) {
    console.log(JSON.stringify({ facts, decisions }, null, 2));
    return decisions.length;
  }

  const bands: Record<string, number> = {};
  for (const b of facts.branches) {
    const k = b.unique === 0 ? "merged" : driftBand(b);
    bands[k] = (bands[k] ?? 0) + 1;
  }

  console.log(`\n${facts.root}`);
  console.log(
    `  on ${facts.branch ?? "(detached)"}` +
      (facts.ahead || facts.behind ? `  ${facts.ahead}↑ ${facts.behind}↓` : "") +
      `  ${facts.modified.length + facts.untracked.length} uncommitted` +
      (facts.inProgress ? `  ⚠ ${facts.inProgress} in progress` : ""),
  );
  if (facts.branches.length) {
    console.log(
      `  ${facts.branches.length} branches: ` +
        Object.entries(bands).map(([k, v]) => `${v} ${k}`).join(", "),
    );
  }

  // Printed unconditionally, even when there is nothing else to say. A
  // binding that only appears alongside other output is a binding nobody
  // reads on the quiet days, which is most days.
  const off = await readDisabled();
  if (off) {
    console.log(
      `\n  ⚠ FAILSAFE DISABLED ${off.ageHours}h (strike ${off.strikes}) — capture is running DEGRADED.` +
        `\n    ${off.reason}` +
        `\n    self-test at ${off.retryAfter}; recovery is automatic, no action needed.`,
    );
  }

  const rec = await reconcile(facts.root);
  if (rec.length) {
    console.log("\n  temporary code, and what retires it:");
    for (const line of formatReconcile(rec)) console.log(line);
  }

  if (decisions.length === 0) {
    console.log("\n  nothing else to do\n");
    return rec.filter((r) => r.retirable).length;
  }

  console.log("");
  for (const tier of TIER_ORDER) {
    for (const d of decisions.filter((x) => x.tier === tier)) {
      console.log(`  ${fmtTier(d.tier)} ${d.summary}`);
      console.log(`          ${d.because.replace(/\s+/g, " ").slice(0, 150)}`);
      console.log(`          $ ${d.command}`);
    }
  }
  console.log("");

  // Feed the repo's EXISTING proposal loop, whose input file has had two
  // readers and no writer since it was written.
  await emitLearnedPatterns(
    new Map(decisions.map((d) => [d.id, { command: d.command, because: d.because }])),
  );

  await recordOffered(facts.root, trigger, decisions, {
    branch: facts.branch,
    uncommitted: facts.modified.length + facts.untracked.length,
    ahead: facts.ahead,
    behind: facts.behind,
  });

  return needsHuman(decisions).length;
}

export const command = "wip [action] [path]";
export const describe =
  "Crash-safe capture of in-flight work, and what to do next";

export function builder(y: Argv): Argv {
  return y
    .positional("action", {
      choices: ["status", "capture", "list", "restore", "learn", "reenable", "branches"] as const,
      default: "status",
      describe: "status = facts + decisions; capture = snapshot now",
    })
    .positional("path", { type: "string", default: process.cwd() })
    .option("trigger", {
      choices: ["session_start", "session_end", "command"] as const,
      default: "command",
      describe: "which rules apply",
    })
    .option("json", { type: "boolean", default: false })
    .option("session", { type: "string", describe: "stable id for re-capture" })
    .option("ref", { type: "string", describe: "restore: which wip ref" })
    .option("branch", { type: "string", describe: "restore: new branch name" })
    .option("archive-gone", { type: "boolean", default: false, describe: "branches: archive tips that can no longer land" })
    .option("prune-merged", { type: "boolean", default: false, describe: "branches: archive THEN delete branches holding nothing unique" })
    .strict(false);
}

export async function handler(
  argv: ArgumentsCamelCase<{
    action: string; path: string; trigger: Trigger;
    json: boolean; session?: string; ref?: string; branch?: string;
    archiveGone?: boolean; pruneMerged?: boolean;
  }>,
): Promise<void> {
  const root = argv.path;

  try {
    switch (argv.action) {
      case "branches": {
        const facts = await collectWorkflowFacts(root);
        const plan = await planBranches(root, facts.branches, facts.defaultBranch, {
          archiveGone: argv.archiveGone,
          pruneMerged: argv.pruneMerged,
        });
        if (argv.json) { console.log(JSON.stringify(plan, null, 2)); break; }
        if (!plan.actions.length) { console.log("  no merged or unlandable branches"); break; }
        console.log(plan.dryRun ? "\n  DRY RUN — nothing written. Add --archive-gone or --prune-merged.\n" : "");
        for (const a of plan.actions) {
          if (a.refused) { console.log(`  skip     ${a.branch.padEnd(44)} ${a.refused}`); continue; }
          const what = a.deleted ? "archived+deleted" : a.archivedAs ? "archived" : "would archive";
          console.log(`  ${what.padEnd(16)} ${a.branch.padEnd(44)} ${a.sha.slice(0, 8)}`);
        }
        console.log(`\n  undo: ${plan.reversal}\n`);
        break;
      }

      case "reenable": {
        await reenable();
        console.log("  failsafe re-enabled. Add the regression test first, if you have not.");
        break;
      }

      case "capture": {
        const pre = await collectWorkflowFacts(root);
        const g = await guarded(
          root,
          "wip capture",
          (r) => capture(r, { sessionId: argv.session }),
          // Bucketed so a signature generalises to the next repo rather than
          // matching only the one that broke.
          {
            detached: pre.branch === null,
            inProgress: pre.inProgress ?? "none",
            fileBucket:
              pre.modified.length + pre.untracked.length > 500
                ? "500+"
                : pre.modified.length + pre.untracked.length > 50
                  ? "50+"
                  : "small",
            branchBucket: pre.branches.length > 40 ? "40+" : "normal",
          },
        );
        if (g.skipped) {
          // Reduced capability, never zero. The work is the thing being
          // protected, not the elegance of the mechanism.
          const facts = await collectWorkflowFacts(root);
          const loose = [...facts.modified, ...facts.untracked];
          const d = await degradedCapture(root, loose);
          console.error("\n  FAILSAFE ACTIVE — git-ref capture distrusted.");
          console.error(g.skipped.split("\n").map((l) => "  " + l).join("\n"));
          console.error(`\n  DEGRADED FALLBACK: copied ${d.copied}/${loose.length} file(s) to`);
          console.error(`  ${d.dir}\n  No history or dedup, but your work is not unprotected.\n`);
          process.exitCode = 3;
          return;
        }
        if (g.incident) {
          console.error("\n  ⚠ FAILSAFE TRIPPED — capture violated its safety invariant.\n");
          for (const v of g.incident.violations) console.error(`   ${v.field}: ${v.before} -> ${v.after}`);
          for (const c of g.incident.containment) console.error(`   ${c}`);
          console.error(`\n   disabled: ${KILL_SWITCH}`);
          console.error("   incident + learning path recorded. Do not re-enable before fixing.\n");
          process.exitCode = 4;
          return;
        }
        const r = g.result!;
        if (argv.json) { console.log(JSON.stringify(r, null, 2)); break; }
        if (r.refused) {
          console.error(`\n  REFUSED: ${r.refused}`);
          console.error("  Finish or abort the operation, then capture.\n");
          process.exitCode = 5;
          return;
        }
        if (r.noop) { console.log("  nothing uncommitted — no capture needed"); break; }
        console.log(`\n  captured ${r.files.length} file(s)`);
        console.log(`  ${r.ref}  ${r.sha.slice(0, 12)}`);
        console.log(`  working tree and index untouched`);
        console.log(`  undo: ${r.reversal}\n`);
        break;
      }

      case "list": {
        const refs = await listCaptures(root);
        if (argv.json) { console.log(JSON.stringify(refs, null, 2)); break; }
        if (!refs.length) { console.log("  no captures in this repo"); break; }
        console.log("");
        for (const r of refs) {
          console.log(
            `  ${r.ref.replace("refs/wip/", "").padEnd(28)} ${String(r.ageDays).padStart(3)}d  ` +
              `${r.fileCount < 0 ? "?" : r.fileCount} files  ${r.sha.slice(0, 8)}`,
          );
        }
        console.log(`\n  restore:  can wip restore --ref <ref> --branch <name>\n`);
        break;
      }

      case "restore": {
        if (!argv.ref || !argv.branch) {
          console.error("  --ref and --branch are both required");
          process.exitCode = 2;
          return;
        }
        // Printed, not executed: restoring is the one action here that can
        // collide with work already in the tree.
        console.log(`\n  run this yourself:\n\n    ${restoreCommand(root, argv.ref, argv.branch)}\n`);
        break;
      }

      case "learn": {
        const stats = (await analyse()).sort((a, b) => b.fired - a.fired);
        if (argv.json) { console.log(JSON.stringify(stats, null, 2)); break; }
        if (!stats.length) { console.log("  no decisions recorded yet"); break; }
        console.log("\n  rule                          fired  acc  dec  ign  rev  verdict");
        for (const s of stats) {
          console.log(
            `  ${s.ruleId.padEnd(28)} ${String(s.fired).padStart(5)} ` +
              `${String(s.accepted).padStart(4)} ${String(s.declined).padStart(4)} ` +
              `${String(s.ignored).padStart(4)} ${String(s.reverted).padStart(4)}  ${s.verdict}`,
          );
        }
        console.log("");
        break;
      }

      default: {
        const n = await status(root, argv.trigger, argv.json);
        // Non-zero only when something genuinely needs a human, so this is
        // usable in a hook without turning every advisory into a failure.
        if (n > 0) process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(`  ${(err as Error).message}`);
    process.exitCode = 2;
  }
}
