import { execSync } from "child_process";
import { loadConfig, type NotionRemote } from "../lib/config.js";

export function open(name: string, view?: string): void {
  const cfg = loadConfig();
  const remote = cfg.remotes?.[name];

  if (!remote) {
    throw new Error(`Remote '${name}' not found. Run 'chitty config' to add it.`);
  }

  let url: string;

  if (remote.type.startsWith("notion")) {
    const notionRemote = remote as NotionRemote;
    if (view && notionRemote.views?.[view]) {
      url = notionRemote.views[view];
    } else {
      url = notionRemote.url;
    }
  } else {
    console.log("[chitty] GitHub remotes can't be opened directly yet");
    return;
  }

  const opener = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";

  try {
    execSync(`${opener} "${url}"`, { stdio: "ignore" });
    console.log(`[chitty] Opened ${name}${view ? ` (${view})` : ""}`);
  } catch {
    console.log(url);
  }
}

export function listRemotes(): void {
  const cfg = loadConfig();

  if (!Object.keys(cfg.remotes).length) {
    console.log("[chitty] No remotes configured. Run 'chitty config' to add one.");
    return;
  }

  console.log("\nConfigured remotes:\n");
  Object.entries(cfg.remotes).forEach(([name, remote]) => {
    console.log(`  ${name}`);
    console.log(`    Type: ${remote.type}`);

    if (remote.type.startsWith("notion")) {
      const notionRemote = remote as NotionRemote;
      console.log(`    URL: ${notionRemote.url}`);
      if (notionRemote.views && Object.keys(notionRemote.views).length) {
        console.log(`    Views: ${Object.keys(notionRemote.views).join(", ")}`);
      }
    } else if (remote.type === "github-project") {
      const ghRemote = remote as any;
      console.log(`    Repo: ${ghRemote.owner}/${ghRemote.repo}`);
      if (ghRemote.projectNumber) {
        console.log(`    Project: #${ghRemote.projectNumber}`);
      }
    }
    console.log();
  });
}
