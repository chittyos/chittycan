import type { Argv, ArgumentsCamelCase } from 'yargs';
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import chalk from 'chalk';
import path from 'path';

// The detector is M1's; this file only renders it and owns the exit-code gate.
// Types come from there too — redeclaring Finding here would let the two shapes
// diverge silently behind a passing build.
import { scanRepo, type Finding, type Severity } from '../lib/hygiene/scan.js';
// The ordering itself is M1's too. Re-declaring it here is how the two copies
// drift when a severity level is added: the new level would silently vanish
// from --min-severity choices and from the render loop.
import { SEVERITY_ORDER } from '../lib/hygiene/types.js';
// The fixer engine is M1's. This file owns the CLI surface only: it never
// decides what is fixable, never writes a file itself, and never touches git.
// Every write, every precondition, and every declared-write-set check lives in
// applyFixes(). Re-implementing any of that here would let the CLI apply a fix
// the engine's safety invariants would have refused.
import { applyFixes, FixPreconditionError } from '../lib/hygiene/fix/apply.js';
// FixPlan/FixSkip are M1's shapes. `FixPlan.writes` is the declared write-set;
// the CLI renders it as `files_written` because that is the field name the
// autofix workflow and the PR body read.
import type { FixPlan, FixSkip } from '../lib/hygiene/fix/types.js';

export const command = 'hygiene [path]';
export const describe = 'Scan a git repository for repo-hygiene defects';

// SEVERITY_ORDER is M1's, ordered HIGHEST first: index 0 = critical .. 4 = info.
// So a *lower* rank means a *more* severe finding, and the gate is `<=`.
const UNKNOWN_RANK = -1;

function rank(s: Severity | string): number {
  const i = SEVERITY_ORDER.indexOf(s as Severity);
  // An unrecognized severity must not be silently dropped below the gate.
  // -1 sorts above `critical` under the `<=` gate, so it always reports.
  return i === -1 ? UNKNOWN_RANK : i;
}

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  critical: chalk.bold.red,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.cyan,
  info: chalk.dim,
};

/**
 * Finding has no `path` field (see the Finding contract: id/severity/title/
 * description/evidence?/remediation_hint?), so the file a rule fired on lives
 * inside `evidence`. Pull it from the conventional keys rather than printing
 * `undefined` for every row.
 */
function findingPath(f: Finding): string | undefined {
  const ev = f.evidence;
  if (!ev || typeof ev !== 'object') return undefined;
  for (const key of ['path', 'file', 'paths', 'files']) {
    const v = (ev as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (Array.isArray(v) && v.length > 0) {
      const strs = v.filter((x): x is string => typeof x === 'string');
      if (strs.length > 0) {
        return strs.length > 3 ? `${strs.slice(0, 3).join(', ')} (+${strs.length - 3} more)` : strs.join(', ');
      }
    }
  }
  return undefined;
}

export function builder(yargs: Argv) {
  return yargs
    .positional('path', {
      describe: 'Path to the git repository to scan (defaults to the current directory)',
      type: 'string',
      default: process.cwd(),
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit { repo, scanned_at, findings } as JSON for CI consumption',
    })
    .option('min-severity', {
      type: 'string',
      default: 'low',
      choices: SEVERITY_ORDER.slice(),
      describe: 'Report and gate on findings at or above this severity',
    })
    .option('fix', {
      type: 'boolean',
      default: false,
      describe:
        'Apply the auto-fixable subset of findings to the working tree (writes files; never stages, commits, or pushes)',
    })
    // Argument-parsing failures (bad --min-severity, unknown flag) would
    // otherwise fall through to the GLOBAL .fail() in src/index.ts, which
    // exits 1 — indistinguishable from "defects found". A command-scoped
    // .fail() plus a command-scoped .strict() keeps usage errors on exit 2.
    // Do NOT rethrow `err`: rethrowing routes back to the global handler.
    .strict()
    .fail((msg: string, err: Error | undefined) => {
      const text = msg || err?.message || 'invalid arguments';
      console.error(chalk.red(`hygiene: ${text}`));
      console.error(chalk.dim('Run `can hygiene --help` for usage.'));
      process.exit(2);
    });
}

export async function handler(argv: ArgumentsCamelCase<any>) {
  // A truncated pipe (`... --json | head`) makes stdout emit 'error'. With no
  // listener that is an unhandled 'error' event: a Node crash dump on stderr,
  // and an exit code that only *looks* like the findings gate. Swallow EPIPE
  // and let process.exitCode stand — exiting 0 here would report a defective
  // repo as clean just because the consumer stopped reading.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err?.code !== 'EPIPE') throw err;
  });

  const minSeverity = String(argv.minSeverity ?? 'low') as Severity;
  const asJson = Boolean(argv.json);
  const doFix = Boolean(argv.fix);

  let repo: string;
  try {
    repo = path.resolve(String(argv.path ?? process.cwd()));

    // Usage/environment failures exit 2 so CI can tell "detector broke" from
    // "defects found". Never 0, never 1.
    if (!(await fs.pathExists(repo)) || !(await fs.stat(repo)).isDirectory()) {
      console.error(chalk.red(`hygiene: not a directory: ${repo}`));
      process.exit(2);
    }

    try {
      execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { stdio: 'ignore' });
    } catch (err: any) {
      if (err && err.code === 'ENOENT') {
        console.error(chalk.red('hygiene: git is not on PATH; the detector reads a real checkout.'));
      } else {
        console.error(chalk.red(`hygiene: not a git repository: ${repo}`));
      }
      process.exit(2);
    }
  } catch (err: any) {
    console.error(chalk.red(`hygiene: ${err?.message ?? err}`));
    process.exit(2);
    return;
  }

  // scanRepo() is always called UNFILTERED. --min-severity governs rendering
  // and the exit code, never what the detector or the fixer can see: both
  // auto-fixable rules are severity `low`, so gating the scan first would make
  // `--fix --min-severity high` silently apply nothing.
  async function scan(): Promise<Finding[]> {
    try {
      return await scanRepo(repo);
    } catch (err: any) {
      // An internal detector failure is NOT a clean repo.
      console.error(chalk.red(`hygiene: scan failed: ${err?.stack ?? err?.message ?? err}`));
      process.exit(2);
      throw err;
    }
  }

  let findings: Finding[] = await scan();
  let applied: FixPlan[] = [];
  let skipped: FixSkip[] = [];

  if (doFix) {
    try {
      const result = await applyFixes(repo, findings);
      applied = result.applied ?? [];
      skipped = result.skipped ?? [];
    } catch (err: any) {
      if (err instanceof FixPreconditionError) {
        // A precondition failure (dirty worktree) is an ENVIRONMENT failure,
        // not a findings verdict: exit 2, never 1. Nothing was written.
        console.error(chalk.red(`hygiene: ${err.message}`));
        process.exit(2);
        return;
      }
      console.error(chalk.red(`hygiene: fix failed: ${err?.stack ?? err?.message ?? err}`));
      process.exit(2);
      return;
    }

    // Re-scan AFTER the writes. The rendered findings and the exit code must
    // describe the repo as it now stands, or the report would demand fixes
    // that this very invocation already applied.
    findings = await scan();
  }

  const threshold = rank(minSeverity);
  // SEVERITY_ORDER is highest-first, so "at or above minSeverity" is `<=`.
  const gated = findings.filter((f) => rank(f.severity) <= threshold);

  if (asJson) {
    // Raw Finding[] — the CI/reviewer interchange format. Not reshaped, not
    // grouped, not renamed. Gated set, so the JSON explains the exit code.
    // `fixes`/`skipped` appear ONLY under --fix: emitting them empty on the
    // read-only path would change the byte output the gate already consumes.
    const payload: Record<string, unknown> = {
      repo,
      scanned_at: new Date().toISOString(),
      findings: gated,
    };
    if (doFix) {
      payload.fixes = applied.map((f) => ({
        id: f.id,
        rule_ids: f.rule_ids,
        files_written: f.writes,
        reversal: f.reversal,
      }));
      payload.skipped = skipped.map((s) => ({ id: s.id, reason: s.reason }));
    }
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    console.log(chalk.bold.blue(`Repo hygiene: ${repo}`));
    console.log(chalk.dim(`min-severity: ${minSeverity}`));
    console.log('');

    if (doFix) {
      for (const f of applied) {
        console.log(
          chalk.green(`fixed: ${f.rule_ids.join(', ')}`) + ` -> ${f.writes.join(', ')}`
        );
        console.log(chalk.dim(`  undo: ${f.reversal}`));
      }
      for (const s of skipped) {
        console.log(chalk.yellow(`skipped: ${s.id} (${s.reason})`));
      }
      if (applied.length === 0 && skipped.length === 0) {
        console.log(chalk.dim('no auto-fixable findings.'));
      }
      console.log('');
    }

    if (gated.length === 0) {
      console.log(chalk.green(`No findings at or above "${minSeverity}".`));
    } else {
      for (const sev of SEVERITY_ORDER) {
        const group = gated.filter((f) => f.severity === sev);
        if (group.length === 0) continue;
        const paint = SEVERITY_COLOR[sev] ?? ((s: string) => s);
        console.log(paint(`${sev.toUpperCase()} (${group.length})`));
        for (const f of group) {
          const p = findingPath(f);
          console.log(`  ${chalk.bold(f.id)}${p ? ` ${chalk.dim(p)}` : ''}`);
          console.log(`    ${f.title}`);
          if (f.remediation_hint) console.log(`    ${chalk.green('fix:')} ${f.remediation_hint}`);
        }
        console.log('');
      }

      // rank() deliberately lets an unrecognized severity through the gate, so
      // it must also be rendered — otherwise it drives a non-zero exit with an
      // empty body and the operator has nothing to act on.
      const unknown = gated.filter((f) => rank(f.severity) === UNKNOWN_RANK);
      if (unknown.length > 0) {
        console.log(chalk.bold.magenta(`UNKNOWN SEVERITY (${unknown.length})`));
        for (const f of unknown) {
          const p = findingPath(f);
          console.log(`  ${chalk.bold(f.id)} ${chalk.dim(`[severity=${String(f.severity)}]`)}${p ? ` ${chalk.dim(p)}` : ''}`);
          console.log(`    ${f.title}`);
          if (f.remediation_hint) console.log(`    ${chalk.green('fix:')} ${f.remediation_hint}`);
        }
        console.log('');
      }

      console.log(chalk.red(`${gated.length} finding(s) at or above "${minSeverity}".`));
    }
  }

  // The gate contract M4 depends on: 1 = defects at/above threshold, 0 = clean.
  // exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = gated.length > 0 ? 1 : 0;
}
