import type { Argv } from 'yargs';
import fs from 'fs-extra';
import chalk from 'chalk';
import path from 'path';
import os from 'os';

export const command = 'viewport <command>';
export const describe = 'Manage ChittyContext session viewport (Phase 1 shadow observer)';

// Nothing schedules viewport-observer.py — no cron, no hook, no daemon. The shadow file is a
// snapshot frozen at whenever a human last ran it, so the output states ages and the refresh
// command rather than asserting a cadence that does not exist.
const REFRESH_COMMAND = 'python3 scripts/viewport-observer.py';

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'under a minute ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

export function builder(yargs: Argv) {
  return yargs.command(
    'status',
    'View the shadow detection status of active AI sessions',
    {},
    async () => {
      // Phase 1 reads the JSONL written by scripts/viewport-observer.py on the local host.
      const shadowPath = path.join(os.homedir(), '.claude', 'chittycontext', 'shadow.jsonl');
      
      console.log(chalk.bold.blue('🔍 ChittyContext Viewport Status\n'));
      
      if (!fs.existsSync(shadowPath)) {
        console.log(chalk.yellow(`Shadow state not found at ${shadowPath}`));
        console.log(`Nothing runs the observer automatically. Generate it on the local host with: ${REFRESH_COMMAND}`);
        return;
      }
      
      try {
        const content = await fs.readFile(shadowPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

        let claudeCount = 0;
        let codexCount = 0;
        let geminiCount = 0;
        let unknownSourceCount = 0;
        let archivedCount = 0;
        let subagentCount = 0;
        let unknownKindCount = 0;
        let malformedCount = 0;
        let sessionCount = 0;
        let newestSessionMtimeMs = 0;
        let newestAnyMtimeMs = 0;

        for (const line of lines) {
          let entry: { source?: string; kind?: string; mtime?: string };
          try {
            entry = JSON.parse(line);
          } catch {
            malformedCount++;
            continue;
          }

          const mtimeMs = entry.mtime ? Date.parse(entry.mtime) : NaN;
          const hasMtime = Number.isFinite(mtimeMs);
          if (hasMtime && mtimeMs > newestAnyMtimeMs) newestAnyMtimeMs = mtimeMs;

          if (entry.kind === 'archived') {
            archivedCount++;
            continue;
          }
          if (entry.kind === 'subagent') {
            subagentCount++;
            continue;
          }
          if (entry.kind !== 'session') {
            unknownKindCount++;
            continue;
          }

          sessionCount++;
          if (hasMtime && mtimeMs > newestSessionMtimeMs) newestSessionMtimeMs = mtimeMs;
          if (entry.source === 'claude') claudeCount++;
          else if (entry.source === 'codex') codexCount++;
          else if (entry.source === 'gemini') geminiCount++;
          else unknownSourceCount++;
        }

        console.log(chalk.bold(`Active Transcripts Tracked: ${sessionCount}`));
        console.log('----------------------------------------------------');
        console.log(`${chalk.green('Claude')}: ${claudeCount} sessions`);
        console.log(`${chalk.magenta('Codex')}: ${codexCount} sessions`);
        console.log(`${chalk.cyan('Gemini')}: ${geminiCount} sessions`);
        if (unknownSourceCount > 0) {
          console.log(`${chalk.yellow('Unknown source')}: ${unknownSourceCount} sessions`);
        }

        console.log('----------------------------------------------------');
        console.log(chalk.dim(`Archived transcripts: ${archivedCount}`));
        console.log(chalk.dim(`Subagent transcripts: ${subagentCount}`));
        if (unknownKindCount > 0) {
          console.log(
            chalk.yellow(
              `Unclassified records (missing or unrecognized "kind"): ${unknownKindCount} — not counted as active`
            )
          );
        }
        if (malformedCount > 0) {
          console.log(chalk.red(`Skipped ${malformedCount} malformed line(s) in ${shadowPath}`));
        }

        const now = Date.now();
        const observerAgeMs = now - (await fs.stat(shadowPath)).mtimeMs;
        console.log('----------------------------------------------------');
        console.log(
          chalk.yellow(
            `Snapshot from the last manual observer run, ${formatAge(observerAgeMs)}. Nothing re-runs it automatically.`
          )
        );
        console.log(
          `Newest active session activity: ${
            newestSessionMtimeMs > 0
              ? formatAge(now - newestSessionMtimeMs)
              : 'none (no active sessions with a parsable mtime)'
          }`
        );
        console.log(
          chalk.dim(
            `Observer coverage, newest record of any kind: ${
              newestAnyMtimeMs > 0 ? formatAge(now - newestAnyMtimeMs) : 'unknown (no parsable mtime)'
            }`
          )
        );
        console.log(`Refresh with: ${REFRESH_COMMAND}`);

        console.log('\nRun "can sync run" (Phase 2) to commit these to ChittyEvidence.');

      } catch (err: any) {
        console.error(chalk.red(`Failed to read shadow state: ${err.message}`));
      }
    }
  ).demandCommand(1, 'You must specify a viewport command.');
}

// `viewport <command>` requires a subcommand (see demandCommand above), so each subcommand
// supplies its own handler and this one is only reachable if that guard is ever removed.
// Fail closed rather than exiting silently.
export const handler = () => {
  throw new Error('You must specify a viewport command. Try: can viewport status');
};
