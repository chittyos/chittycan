import type { Argv, ArgumentsCamelCase } from 'yargs';
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import chalk from 'chalk';
import path from 'path';

// The detector is M1's; this file only renders it and owns the exit-code gate.
// Types come from there too — redeclaring Finding here would let the two shapes
// diverge silently behind a passing build.
import { scanRepo, type Finding, type Severity } from '../lib/hygiene/scan.js';

export const command = 'hygiene [path]';
export const describe = 'Scan a git repository for repo-hygiene defects';

// Ordered low → high. `info` sits BELOW `low`, so the default --min-severity=low
// reports everything except informational findings.
const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

function rank(s: Severity | string): number {
  const i = SEVERITY_ORDER.indexOf(s as Severity);
  // An unrecognized severity must not be silently dropped below the gate.
  return i === -1 ? SEVERITY_ORDER.length : i;
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
      choices: SEVERITY_ORDER.slice().reverse(),
      describe: 'Report and gate on findings at or above this severity',
    });
}

export async function handler(argv: ArgumentsCamelCase<any>) {
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

  let findings: Finding[];
  try {
    findings = await scanRepo(repo);
  } catch (err: any) {
    // An internal detector failure is NOT a clean repo.
    console.error(chalk.red(`hygiene: scan failed: ${err?.stack ?? err?.message ?? err}`));
    process.exit(2);
    return;
  }

  const threshold = rank(minSeverity);
  const gated = findings.filter((f) => rank(f.severity) >= threshold);

  if (asJson) {
    // Raw Finding[] — the CI/reviewer interchange format. Not reshaped, not
    // grouped, not renamed. Gated set, so the JSON explains the exit code.
    process.stdout.write(
      JSON.stringify({ repo, scanned_at: new Date().toISOString(), findings: gated }, null, 2) + '\n'
    );
  } else {
    console.log(chalk.bold.blue(`Repo hygiene: ${repo}`));
    console.log(chalk.dim(`min-severity: ${minSeverity}`));
    console.log('');

    if (gated.length === 0) {
      console.log(chalk.green(`No findings at or above "${minSeverity}".`));
    } else {
      for (const sev of SEVERITY_ORDER.slice().reverse()) {
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
      console.log(chalk.red(`${gated.length} finding(s) at or above "${minSeverity}".`));
    }
  }

  // The gate contract M4 depends on: 1 = defects at/above threshold, 0 = clean.
  // exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = gated.length > 0 ? 1 : 0;
}
