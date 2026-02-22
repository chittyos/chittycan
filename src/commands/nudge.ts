import inquirer from "inquirer";
import { loadConfig } from "../lib/config.js";
import { open } from "./open.js";

export async function nudgeNow(): Promise<void> {
  const cfg = loadConfig();
  const remoteNames = Object.keys(cfg.remotes);

  if (!remoteNames.length) {
    console.log("[chitty] No remotes configured. Run 'chitty config' to add one.");
    return;
  }

  console.log("\n[chitty] Time to update your tracker!\n");

  // Ask which remote to update
  const { remoteName } = await inquirer.prompt([{
    type: "list",
    name: "remoteName",
    message: "Which tracker do you want to update?",
    choices: remoteNames
  }]);

  const remote = cfg.remotes[remoteName];

  // If it's a Notion database with views, ask which view
  if (remote.type === "notion-database" && remote.views && Object.keys(remote.views).length > 0) {
    const { viewName } = await inquirer.prompt([{
      type: "list",
      name: "viewName",
      message: "Which view?",
      choices: [
        { name: "Default (main database)", value: null },
        ...Object.keys(remote.views).map(v => ({ name: v, value: v }))
      ]
    }]);

    open(remoteName, viewName);
  } else {
    open(remoteName);
  }

  // Ask what they did
  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: "What are you updating?",
    choices: [
      "Project Status",
      "Actions / Tasks",
      "Decision Log",
      "AI Usage",
      "All of the above",
      "Skip for now"
    ]
  }]);

  if (action !== "Skip for now") {
    console.log(`\n✓ Great! Don't forget to update: ${action}\n`);
  }
}

export function nudgeQuiet(): void {
  const cfg = loadConfig();
  const remoteNames = Object.keys(cfg.remotes);

  if (!remoteNames.length) {
    return;
  }

  console.log("\n[chitty] Update your Project Status / Actions / Decision Log");

  // Show first tracker
  const firstRemote = remoteNames[0];
  const remote = cfg.remotes[firstRemote];

  if (remote.type.startsWith("notion")) {
    console.log(`  → Run: chitty open ${firstRemote}`);
  }

  console.log();
}
