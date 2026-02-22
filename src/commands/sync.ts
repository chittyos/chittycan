import inquirer from "inquirer";
import { loadConfig, saveConfig, type NotionRemote, type GitHubRemote } from "../lib/config.js";
import { SyncWorker, type SyncConfig } from "../lib/sync.js";

export async function syncSetup(): Promise<void> {
  const cfg = loadConfig();

  console.log("\n[chitty] Sync setup\n");

  // Get Notion token
  const { notionToken } = await inquirer.prompt([{
    type: "password",
    name: "notionToken",
    message: "Notion API token (https://www.notion.so/my-integrations)",
    default: cfg.sync?.notionToken,
    validate: (v: string) => v ? true : "Required"
  }]);

  // Get GitHub token
  const { githubToken } = await inquirer.prompt([{
    type: "password",
    name: "githubToken",
    message: "GitHub personal access token",
    default: cfg.sync?.githubToken,
    validate: (v: string) => v ? true : "Required"
  }]);

  // Select remotes to sync
  const notionRemotes = Object.entries(cfg.remotes)
    .filter(([_, r]) => r.type === "notion-database")
    .map(([name, _]) => name);

  const githubRemotes = Object.entries(cfg.remotes)
    .filter(([_, r]) => r.type === "github-project")
    .map(([name, _]) => name);

  if (!notionRemotes.length || !githubRemotes.length) {
    console.log("\n[chitty] You need at least one Notion database and one GitHub project configured.");
    console.log("  → Run: chitty config");
    return;
  }

  const { notionRemote, githubRemote } = await inquirer.prompt([
    {
      type: "list",
      name: "notionRemote",
      message: "Notion database to sync",
      choices: notionRemotes
    },
    {
      type: "list",
      name: "githubRemote",
      message: "GitHub project to sync",
      choices: githubRemotes
    }
  ]);

  // Save config
  cfg.sync = {
    enabled: true,
    notionToken,
    githubToken,
    mappings: [{ notionRemote, githubRemote }]
  };

  saveConfig(cfg);

  console.log("\n[chitty] ✓ Sync configured");
  console.log(`  Notion: ${notionRemote}`);
  console.log(`  GitHub: ${githubRemote}`);
  console.log("\n  → Run: chitty sync run");
}

export async function syncRun(dryRun: boolean = false): Promise<void> {
  const cfg = loadConfig();

  if (!cfg.sync?.enabled || !cfg.sync.mappings?.length) {
    console.log("[chitty] Sync not configured. Run: chitty sync setup");
    return;
  }

  console.log(dryRun ? "\n[chitty] Sync (dry run)\n" : "\n[chitty] Starting sync\n");

  for (const mapping of cfg.sync.mappings) {
    const notionRemote = cfg.remotes[mapping.notionRemote] as NotionRemote;
    const githubRemote = cfg.remotes[mapping.githubRemote] as GitHubRemote;

    if (!notionRemote?.databaseId) {
      console.log(`[chitty] Error: Notion remote '${mapping.notionRemote}' has no database ID`);
      continue;
    }

    console.log(`Syncing ${mapping.notionRemote} ↔ ${mapping.githubRemote}...`);

    const syncConfig: SyncConfig = {
      notionToken: cfg.sync.notionToken!,
      githubToken: cfg.sync.githubToken!,
      notionDatabaseId: notionRemote.databaseId,
      githubOwner: githubRemote.owner,
      githubRepo: githubRemote.repo,
      dryRun
    };

    const worker = new SyncWorker(syncConfig);
    const result = await worker.sync();

    // Print results
    console.log("\nResults:");
    console.log(`  Created in Notion: ${result.createdInNotion}`);
    console.log(`  Created in GitHub: ${result.createdInGitHub}`);
    console.log(`  Updated in Notion: ${result.updatedInNotion}`);
    console.log(`  Updated in GitHub: ${result.updatedInGitHub}`);
    console.log(`  Conflicts: ${result.conflicts.length}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.conflicts.length > 0) {
      console.log("\nConflicts:");
      result.conflicts.forEach(c => {
        console.log(`  - ${c.action.title} (${c.reason})`);
      });
    }

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach(e => {
        console.log(`  - ${e.item}: ${e.error}`);
      });
    }

    console.log();
  }
}

export function syncStatus(): void {
  const cfg = loadConfig();

  console.log("\n[chitty] Sync status\n");

  if (!cfg.sync?.enabled) {
    console.log("  Status: Not configured");
    console.log("  → Run: chitty sync setup");
    return;
  }

  console.log("  Status: Enabled");
  console.log(`  Mappings: ${cfg.sync.mappings?.length || 0}`);

  if (cfg.sync.mappings) {
    console.log("\n  Configured mappings:");
    cfg.sync.mappings.forEach((m, i) => {
      console.log(`    ${i + 1}. ${m.notionRemote} ↔ ${m.githubRemote}`);
    });
  }

  console.log();
}
