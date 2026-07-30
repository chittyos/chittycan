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
      path: opts.artifactPath,
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

export async function marketEnable(id: string): Promise<void> {
  const data = loadMarketplace();
  const artifact = data.artifacts.find((a): a is MarketplaceArtifact => "id" in a && (a as MarketplaceArtifact).id === id) as MarketplaceArtifact | undefined;
  const typeHint = artifact ? ` [${artifact.type}]` : "";

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
  console.log();
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

  if (result.error && result.pushed === 0) {
    console.log(chalk.red(`❌ ${result.error}`));
    return;
  }

  if (result.pushed === 0) {
    console.log(chalk.green("✅ Repo already up to date. Nothing to push."));
    return;
  }

  if (result.committed) {
    console.log(chalk.green(`✅ Pushed ${result.pushed} new artifact(s) and committed to chittymarket repo.`));
  } else {
    console.log(chalk.yellow(`⚠️  Wrote ${result.pushed} artifact(s) to repo marketplace.json but git commit failed.`));
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
      return marketEnable(opts.id as string);

    case "disable":
      if (!opts.id) { console.log(chalk.red("❌ Specify an artifact id")); return; }
      return marketDisable(opts.id as string);

    case "info":
      if (!opts.id) { console.log(chalk.red("❌ Specify an artifact id")); return; }
      return marketInfo(opts.id as string);

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
      console.log(chalk.dim("   Actions: list, add, enable, disable, info, sync, push"));
  }
}
