/**
 * market.ts — `can market` command
 *
 * Subcommands:
 *   list    [--type] [--category] [--enabled] [--disabled]
 *   add     --id <id> --path <path> [--type] [--category] [--access] [--name] [--desc] [--tags]
 *   enable  <id>
 *   disable <id>
 *   info    <id>
 *   sync    — merge new entries from repo → runtime
 *   push    — push new runtime entries → repo + git commit
 */

import chalk from "chalk";
import path from "path";
import os from "os";
import {
  loadMarketplace,
  saveMarketplace,
  realArtifacts,
  findArtifact,
  addArtifact,
  setEnabled,
  syncWithRepo,
  pushToRepo,
  resolveHome,
  normalizeArtifactPath,
  verifyArtifact,
  verifyPassed,
  type VerifyResult,
  RUNTIME_MARKETPLACE,
  REPO_MARKETPLACE,
  type ArtifactType,
  type ArtifactCategory,
  type ArtifactAccess,
  type MarketplaceArtifact,
} from "../lib/marketplace.js";

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export async function marketList(opts: {
  type?: string;
  category?: string;
  enabled?: boolean;
  disabled?: boolean;
}): Promise<void> {
  const data = loadMarketplace();
  let artifacts = realArtifacts(data);

  if (opts.type) artifacts = artifacts.filter((a) => a.type === opts.type);
  if (opts.category) artifacts = artifacts.filter((a) => a.category === opts.category);
  if (opts.enabled) artifacts = artifacts.filter((a) => a.enabled);
  if (opts.disabled) artifacts = artifacts.filter((a) => !a.enabled);

  if (artifacts.length === 0) {
    console.log(chalk.yellow("No artifacts match the filter."));
    return;
  }

  // Group by type
  const byType = new Map<string, MarketplaceArtifact[]>();
  for (const a of artifacts) {
    const group = byType.get(a.type) ?? [];
    group.push(a);
    byType.set(a.type, group);
  }

  for (const [type, group] of byType) {
    console.log(chalk.bold.cyan(`\n  ${type.toUpperCase()} (${group.length})`));
    console.log(chalk.dim("  " + "─".repeat(86)));
    for (const a of group) {
      const flag = a.enabled ? chalk.green("[ON] ") : chalk.red("[OFF]");
      const id = chalk.white(a.id.padEnd(38));
      const cat = chalk.dim((a.category ?? "").padEnd(14));
      const mode = chalk.dim(a.installMode ?? "standalone");
      console.log(`  ${flag} ${id} ${cat} ${mode}`);
    }
  }

  const total = artifacts.length;
  const on = artifacts.filter((a) => a.enabled).length;
  console.log(chalk.dim(`\n  TOTAL: ${total} artifacts  |  ${on} enabled  |  ${total - on} disabled\n`));
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export async function marketAdd(opts: {
  id: string;
  artifactPath: string;
  type?: string;
  category?: string;
  access?: string;
  name?: string;
  description?: string;
  tags?: string;
}): Promise<void> {
  const id = opts.id.startsWith("skill-") || opts.id.startsWith("plugin-") || opts.id.startsWith("agent-")
    ? opts.id
    : `${opts.type ?? "skill"}-${opts.id}`;

  const artifact: MarketplaceArtifact = {
    id,
    name: opts.name ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: opts.description ?? "",
    type: (opts.type ?? "skill") as ArtifactType,
    category: (opts.category ?? "ecosystem") as ArtifactCategory,
    access: (opts.access ?? "readwrite") as ArtifactAccess,
    enabled: true,
    installMode: "standalone",
    standalone: {
      available: true,
      type: opts.type ?? "skill",
      path: normalizeArtifactPath(opts.artifactPath),
    },
    ch1tty: { available: false },
    tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [],
  };

  const data = loadMarketplace();
  const result = addArtifact(data, artifact);

  if (!result.added) {
    console.log(chalk.yellow(`⚠️  ${result.reason}`));
    return;
  }

  saveMarketplace(data);
  console.log(chalk.green(`✅ Registered ${id}`));
  console.log(chalk.dim(`   type=${artifact.type}  category=${artifact.category}  path=${artifact.standalone.path}`));
  console.log(chalk.dim(`\n   Run ${chalk.white("can market push")} to commit to the chittymarket repo.`));
}

// ---------------------------------------------------------------------------
// enable / disable
// ---------------------------------------------------------------------------

export async function marketEnable(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const data = loadMarketplace();
  const artifact = data.artifacts.find((a): a is MarketplaceArtifact => "id" in a && (a as MarketplaceArtifact).id === id) as MarketplaceArtifact | undefined;
  const typeHint = artifact ? ` [${artifact.type}]` : "";

  // Enabling is the operation that turns on-disk content into loaded content,
  // so it is the one that must gate on integrity. A recorded hash that no
  // longer matches means the content changed since it was trusted — refuse.
  if (artifact) {
    const integrity = verifyArtifact(artifact);

    // `modified` and `missing` are positive evidence that something is wrong:
    // content changed since it was trusted, or the path is gone. Both block.
    //
    // `unrecorded` deliberately does NOT block. It is the absence of evidence,
    // not evidence of a problem, and blocking on it would not buy security:
    // contentHash is self-attested and lives in the same file as the artifact
    // record, so anyone who can strip the hash to force `unrecorded` can just
    // as easily rewrite it to match their payload. Blocking would add friction
    // for every never-recorded artifact while closing neither path. It warns.
    //
    // `unpathed` blocks only when a contentHash was already recorded: for
    // agent/hook artifacts, setEnabled()'s toggle falls back to the global
    // agents/hooks directory when standalone.path is empty, so a baseline
    // recorded against one path and then cleared would otherwise activate
    // unverified content from that fallback without ever failing closed.
    const blocking =
      integrity.status === "modified" ||
      integrity.status === "missing" ||
      (integrity.status === "unpathed" && !!artifact.contentHash);

    if (blocking && !opts.force) {
      console.log(chalk.red(`❌ Refusing to enable ${id}: ${integrity.detail}`));
      if (integrity.expected) console.log(chalk.dim(`   recorded: sha256:${integrity.expected}`));
      if (integrity.actual) console.log(chalk.dim(`   on disk:  sha256:${integrity.actual}`));
      console.log(chalk.dim(`\n   Review the change, then re-record with ${chalk.white(`can market verify ${id} --record`)},`));
      console.log(chalk.dim(`   or enable anyway with ${chalk.white("--force")}.\n`));
      process.exitCode = 1;
      return;
    }
    if (blocking && opts.force) {
      console.log(chalk.yellow(`⚠️  ${id} fails verification (${integrity.status}) — enabling anyway because --force was given.`));
    }
    if (integrity.status === "unrecorded") {
      console.log(chalk.yellow(`⚠️  ${id} has no recorded hash — enabling unverified content.`));
      console.log(chalk.dim(`   Establish a baseline with ${chalk.white(`can market verify ${id} --record`)}.`));
    }
  }

  const result = setEnabled(data, id, true);
  if (!result.ok) {
    console.log(chalk.red(`❌ ${result.reason}`));
    return;
  }
  saveMarketplace(data);
  console.log(chalk.green(`✅ Enabled: ${id}${typeHint}`));
  if (artifact?.type === "mcp-server") console.log(chalk.dim("   → Updated ch1tty/servers.json"));
  if (artifact?.type === "skill") console.log(chalk.dim("   → Renamed SKILL.md.disabled → SKILL.md"));
  if (artifact?.type === "plugin") console.log(chalk.dim("   → Updated settings.json / blocklist"));
  if (artifact?.type === "agent") console.log(chalk.dim("   → Renamed <name>.md.disabled → <name>.md"));
  if (artifact?.type === "hook") console.log(chalk.dim("   → Set enabled: true in hookify frontmatter"));
}

export async function marketDisable(id: string): Promise<void> {
  const data = loadMarketplace();
  const artifact = data.artifacts.find((a): a is MarketplaceArtifact => "id" in a && (a as MarketplaceArtifact).id === id) as MarketplaceArtifact | undefined;
  const typeHint = artifact ? ` [${artifact.type}]` : "";

  const result = setEnabled(data, id, false);
  if (!result.ok) {
    console.log(chalk.red(`❌ ${result.reason}`));
    return;
  }
  saveMarketplace(data);
  console.log(chalk.yellow(`⛔ Disabled: ${id}${typeHint}`));
  if (artifact?.type === "mcp-server") console.log(chalk.dim("   → Updated ch1tty/servers.json"));
  if (artifact?.type === "skill") console.log(chalk.dim("   → Renamed SKILL.md → SKILL.md.disabled"));
  if (artifact?.type === "plugin") console.log(chalk.dim("   → Updated settings.json / blocklist"));
  if (artifact?.type === "agent") console.log(chalk.dim("   → Renamed <name>.md → <name>.md.disabled"));
  if (artifact?.type === "hook") console.log(chalk.dim("   → Set enabled: false in hookify frontmatter"));
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

export async function marketInfo(id: string): Promise<void> {
  const data = loadMarketplace();
  const artifact = findArtifact(data, id);

  if (!artifact) {
    console.log(chalk.red(`❌ Not found: ${id}`));
    console.log(chalk.dim(`   Run ${chalk.white("can market list")} to see registered artifacts.`));
    return;
  }

  const resolvedPath = resolveHome(artifact.standalone?.path ?? "");

  console.log(chalk.bold.cyan(`\n  ${artifact.id}`));
  console.log(`  Name:        ${artifact.name}`);
  console.log(`  Description: ${artifact.description}`);
  console.log(`  Type:        ${artifact.type}`);
  console.log(`  Category:    ${artifact.category}`);
  console.log(`  Access:      ${artifact.access}`);
  console.log(`  Enabled:     ${artifact.enabled ? chalk.green("true") : chalk.red("false")}`);
  console.log(`  Install:     ${artifact.installMode}`);
  console.log(`  Tags:        ${(artifact.tags ?? []).join(", ")}`);
  if (resolvedPath) {
    console.log(`  Path:        ${resolvedPath}`);
  }

  const result = verifyArtifact(artifact);
  console.log(`  Integrity:   ${formatVerifyStatus(result)}`);
  if (result.expected) console.log(chalk.dim(`  Recorded:    sha256:${result.expected}`));
  if (result.actual && result.actual !== result.expected) {
    console.log(chalk.dim(`  On disk:     sha256:${result.actual}`));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

function formatVerifyStatus(result: VerifyResult): string {
  switch (result.status) {
    case "ok":
      return chalk.green(`verified (${result.detail})`);
    case "modified":
      return chalk.red(`MODIFIED — ${result.detail}`);
    case "unrecorded":
      return chalk.yellow(`unrecorded — ${result.detail}`);
    case "missing":
      return chalk.red(`missing — ${result.detail}`);
    case "unpathed":
      return chalk.dim(`n/a — ${result.detail}`);
  }
}

/**
 * Verify artifact content against recorded SHA-256 hashes.
 *
 * Fails closed: exits non-zero unless every checked artifact reports `ok`, so
 * an unrecorded or missing artifact is a failure, not a silent pass.
 */
export async function marketVerify(opts: {
  id?: string;
  all?: boolean;
  record?: boolean;
  force?: boolean;
  allowEmpty?: boolean;
}): Promise<void> {
  const data = loadMarketplace();

  let targets;
  if (opts.id) {
    const artifact = findArtifact(data, opts.id);
    if (!artifact) {
      console.log(chalk.red(`❌ Not found: ${opts.id}`));
      process.exitCode = 1;
      return;
    }
    targets = [artifact];
  } else if (opts.all) {
    targets = realArtifacts(data);
  } else {
    console.log(chalk.red("❌ Specify an artifact id or --all"));
    console.log(chalk.dim("   Example: can market verify skill-market"));
    console.log(chalk.dim("            can market verify --all"));
    process.exitCode = 1;
    return;
  }

  // An empty check set is not a pass. Without this, deleting or truncating
  // marketplace.json turns `verify --all` into a vacuous green light.
  if (targets.length === 0) {
    if (opts.allowEmpty) {
      console.log(chalk.yellow("⚠️  No artifacts to verify — passing because --allow-empty was given."));
      console.log(chalk.dim(`   Manifest: ${RUNTIME_MARKETPLACE}`));
      return;
    }
    console.log(chalk.red("❌ No artifacts to verify — refusing to report success on an empty set."));
    console.log(chalk.dim(`   Manifest: ${RUNTIME_MARKETPLACE}`));
    console.log(chalk.dim("   Pass --allow-empty if an empty manifest is genuinely expected."));
    process.exitCode = 1;
    return;
  }

  if (opts.record) {
    // Hash every target exactly once and reuse that result for both the
    // laundering check below and the recording loop further down. Hashing
    // separately for each — verify first, then recordArtifactHash() again
    // per target — leaves a window between the two passes (widest for
    // --all, which verifies every target before recording any) where content
    // changed after the check could be adopted as the trusted baseline
    // without ever having been checked itself.
    const preflight = targets.map((artifact) => ({ artifact, result: verifyArtifact(artifact) }));

    // Re-recording an artifact that currently fails verification would silently
    // adopt tampered content as trusted. Require --force to say so out loud.
    const laundering = preflight.filter(({ result }) => result.status === "modified");

    if (laundering.length > 0 && !opts.force) {
      console.log(chalk.red(`❌ Refusing to re-record ${laundering.length} artifact(s) that currently fail verification:\n`));
      for (const { result: r } of laundering) {
        console.log(`  ${r.id.padEnd(38)} ${chalk.red("MODIFIED")}`);
        console.log(chalk.dim(`    recorded: sha256:${r.expected}`));
        console.log(chalk.dim(`    on disk:  sha256:${r.actual}`));
      }
      console.log(chalk.dim("\n   Inspect the diff first. Re-record anyway with --force.\n"));
      process.exitCode = 1;
      return;
    }

    let recorded = 0;
    for (const { artifact, result } of preflight) {
      if (!result.actual) {
        console.log(chalk.red(`❌ cannot hash ${artifact.id}: path missing or undeclared`));
        process.exitCode = 1;
        continue;
      }
      artifact.contentHash = result.actual;
      recorded++;
      console.log(chalk.green(`✅ Recorded ${artifact.id}`) + chalk.dim(` sha256:${result.actual.slice(0, 16)}…`));
    }
    if (recorded > 0) saveMarketplace(data);
    console.log(chalk.dim(`\n   Recorded ${recorded}/${targets.length} baseline hash(es).\n`));
    return;
  }

  console.log(chalk.cyan(`\n🔍 Verifying ${targets.length} artifact(s)...\n`));

  const results = targets.map(verifyArtifact);
  const failures = results.filter((r) => !verifyPassed(r));

  for (const result of results) {
    // On --all, stay quiet about passes so failures are not buried.
    if (opts.all && verifyPassed(result)) continue;
    console.log(`  ${result.id.padEnd(38)} ${formatVerifyStatus(result)}`);
  }

  const tally = (s: string) => results.filter((r) => r.status === s).length;
  console.log(
    chalk.dim(
      `\n  ${tally("ok")} verified  |  ${tally("modified")} modified  |  ` +
        `${tally("unrecorded")} unrecorded  |  ${tally("missing")} missing  |  ${tally("unpathed")} unpathed\n`
    )
  );

  if (failures.length > 0) {
    console.log(chalk.red(`❌ ${failures.length} artifact(s) failed verification.`));
    process.exitCode = 1;
  } else {
    console.log(chalk.green(`✅ All ${results.length} artifact(s) verified.`));
  }
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

export async function marketSync(): Promise<void> {
  console.log(chalk.cyan("\n🔄 Syncing marketplace...\n"));
  console.log(chalk.dim(`  Runtime:   ${RUNTIME_MARKETPLACE}`));
  console.log(chalk.dim(`  Repo:      ${REPO_MARKETPLACE}\n`));

  const result = syncWithRepo();

  if (result.fromRepo === 0) {
    console.log(chalk.green("✅ Sync complete. No new entries from repo."));
  } else {
    console.log(chalk.green(`✅ Merged ${result.fromRepo} new entries from repo → runtime.`));
  }
  console.log(chalk.dim(`\n   Runtime: ${RUNTIME_MARKETPLACE}\n`));
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

export async function marketPush(message?: string): Promise<void> {
  console.log(chalk.cyan("\n📤 Pushing to chittymarket repo...\n"));

  const result = pushToRepo(message);

  if (result.error && result.pushed === 0 && result.updated === 0) {
    console.log(chalk.red(`❌ ${result.error}`));
    return;
  }

  if (result.pushed === 0 && result.updated === 0) {
    console.log(chalk.green("✅ Repo already up to date. Nothing to push."));
    return;
  }

  const summary = [
    result.pushed > 0 ? `${result.pushed} new artifact(s)` : null,
    result.updated > 0 ? `${result.updated} updated hash(es)` : null,
  ].filter(Boolean).join(", ");

  if (result.committed) {
    console.log(chalk.green(`✅ Pushed ${summary} and committed to chittymarket repo.`));
  } else {
    console.log(chalk.yellow(`⚠️  Wrote ${summary} to repo marketplace.json but git commit failed.`));
    if (result.error) console.log(chalk.dim(`   ${result.error}`));
    console.log(chalk.dim(`   Manually commit: cd ${path.dirname(REPO_MARKETPLACE)} && git add marketplace.json && git commit`));
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher (for backward compat with old `can market push|pull`)
// ---------------------------------------------------------------------------

export async function marketCommand(
  action: string,
  opts: Record<string, unknown> = {}
): Promise<void> {
  switch (action) {
    case "list":
      return marketList({
        type: opts.type as string | undefined,
        category: opts.category as string | undefined,
        enabled: opts.enabled as boolean | undefined,
        disabled: opts.disabled as boolean | undefined,
      });

    case "add":
      if (!opts.id || !opts.path) {
        console.log(chalk.red("❌ --id and --path are required for `can market add`"));
        console.log(chalk.dim("   Example: can market add --id gws-tasks --path ~/.agents/skills/gws-tasks --type skill --category productivity"));
        return;
      }
      return marketAdd({
        id: opts.id as string,
        artifactPath: opts.path as string,
        type: opts.type as string | undefined,
        category: opts.category as string | undefined,
        access: opts.access as string | undefined,
        name: opts.name as string | undefined,
        description: opts.desc as string | undefined,
        tags: opts.tags as string | undefined,
      });

    case "enable":
      if (!opts.id) { console.log(chalk.red("❌ Specify an artifact id")); return; }
      return marketEnable(opts.id as string, { force: opts.force as boolean | undefined });

    case "disable":
      if (!opts.id) { console.log(chalk.red("❌ Specify an artifact id")); return; }
      return marketDisable(opts.id as string);

    case "info":
      if (!opts.id) { console.log(chalk.red("❌ Specify an artifact id")); return; }
      return marketInfo(opts.id as string);

    case "verify":
      return marketVerify({
        id: opts.id as string | undefined,
        all: opts.all as boolean | undefined,
        record: opts.record as boolean | undefined,
        force: opts.force as boolean | undefined,
        allowEmpty: opts["allow-empty"] as boolean | undefined,
      });

    case "sync":
      return marketSync();

    case "push":
      return marketPush(opts.message as string | undefined);

    // Legacy compat
    case "pull":
      console.log(chalk.yellow("⚠️  `can market pull` is now `can market sync`"));
      return marketSync();

    default:
      console.log(chalk.red(`❌ Unknown market action: ${action}`));
      console.log(chalk.dim("   Actions: list, add, enable, disable, info, verify, sync, push"));
      process.exitCode = 1;
  }
}
