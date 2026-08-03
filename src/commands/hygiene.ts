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
// NO AUTO-FIX SURFACE. `can hygiene` is report-only, deliberately.
//
// An earlier revision of this file exposed `--fix`, wired to
// src/lib/hygiene/fix/apply.ts and its single `commit-msg-hook` fixer. Review
// established that the fixer can damage a real repository, and that both
// defects are design defects in the fixer, not in this rendering surface:
//
//   1. It appended ` && git config core.hooksPath .githooks 2>/dev/null || true`
//      to any pre-existing `prepare` script. POSIX `&&` and `||` are equal
//      precedence and left-associative, so `A && B || true` always exits 0.
//      chittycan's own prepare is `npm run build`; after the "fix", a failing
//      build no longer fails `npm install`. Measured: `npm run prepare` went
//      from exit 2 to exit 0 with a real TypeScript error present.
//   2. Its "refuses when a hook layer already exists" precondition inspected
//      only TRACKED files under .husky/ hooks/ githooks/ .githooks/ and the
//      package.json prepare/postinstall scripts. It never read
//      GitFacts.coreHooksPath and never looked at .pre-commit-config.yaml as a
//      tracked file. A mixed Python+JS repo using `pre-commit install` sails
//      past every precondition, and the committed wiring then repoints
//      core.hooksPath away from the working hook layer on every contributor
//      machine — the exact harm the fixer's own docstring claims it refuses.
//
// Neither is repairable from this file. Both rules — `no-commit-msg-lint` and
// `no-local-hook-layer` — remain fully reported with their remediation hints;
// only the automated write path is gone. A fixer that silently disables a
// repo's CI-failure signal and its hook layer is worse than no fixer.
//
// `--fix` is therefore not a recognised flag: `.strict()` below rejects it with
// a usage error on exit 2, which is distinguishable from the findings gate
// (exit 1). Do not re-add it without re-adding the fixer's safety story.

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
  // and the exit code, never what the detector can see.
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

  const findings: Finding[] = await scan();

  const threshold = rank(minSeverity);
  // SEVERITY_ORDER is highest-first, so "at or above minSeverity" is `<=`.
  const gated = findings.filter((f) => rank(f.severity) <= threshold);

  if (asJson) {
    // Raw Finding[] — the CI/reviewer interchange format. Not reshaped, not
    // grouped, not renamed. Gated set, so the JSON explains the exit code.
    // EXACTLY three keys. M4's gate parses this; no `fixes`, no `skipped`.
    const payload: Record<string, unknown> = {
      repo,
      scanned_at: new Date().toISOString(),
      findings: gated,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    console.log(chalk.bold.blue(`Repo hygiene: ${repo}`));
    console.log(chalk.dim(`min-severity: ${minSeverity}`));
    console.log('');

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
