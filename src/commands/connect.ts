import { loadConfig, saveConfig, type ChittyConnectRemote } from "../lib/config.js";
import inquirer from "inquirer";
import chalk from "chalk";

/**
 * Quick setup for ChittyConnect - auto-detects from env vars
 */
export async function connectSetup(): Promise<void> {
  const config = loadConfig();

  // Auto-detect token from environment
  const envToken = process.env.CHITTY_TOKEN ||
                   process.env.CHITTY_API_TOKEN ||
                   process.env.CHITTYCONNECT_TOKEN;

  console.log(chalk.bold("\n🔗 ChittyConnect Setup\n"));

  if (envToken) {
    console.log(chalk.green("✓ Found CHITTY_TOKEN in environment"));

    const { confirm } = await inquirer.prompt([{
      type: "confirm",
      name: "confirm",
      message: "Auto-configure ChittyConnect with this token?",
      default: true
    }]);

    if (confirm) {
      const remote: ChittyConnectRemote = {
        type: "chittyconnect",
        baseUrl: "https://connect.chitty.cc",
        apiToken: envToken,
        mcpEnabled: true
      };

      config.remotes["connect"] = remote;
      saveConfig(config);

      console.log(chalk.green("\n✓ ChittyConnect configured!"));
      console.log(chalk.dim(`  Remote name: connect`));
      console.log(chalk.dim(`  Base URL: ${remote.baseUrl}`));
      console.log(chalk.dim(`  MCP enabled: true\n`));

      console.log("Try it:");
      console.log(chalk.cyan("  can connect mcp status"));
      console.log(chalk.cyan("  can connect mcp tools"));
      return;
    }
  }

  // Manual configuration
  console.log("No token found in environment.");
  console.log(chalk.dim("Set CHITTY_TOKEN env var or enter manually:\n"));

  const { token, enableMcp } = await inquirer.prompt([
    {
      type: "password",
      name: "token",
      message: "ChittyConnect API token:",
      validate: (v: string) => v ? true : "Required"
    },
    {
      type: "confirm",
      name: "enableMcp",
      message: "Enable MCP server?",
      default: true
    }
  ]);

  const remote: ChittyConnectRemote = {
    type: "chittyconnect",
    baseUrl: "https://connect.chitty.cc",
    apiToken: token,
    mcpEnabled: enableMcp
  };

  config.remotes["connect"] = remote;
  saveConfig(config);

  console.log(chalk.green("\n✓ ChittyConnect configured!"));
  console.log(chalk.dim(`  Remote name: connect`));
  console.log(chalk.dim(`  MCP enabled: ${enableMcp}\n`));
}

/**
 * Show ChittyConnect status
 */
export async function connectStatus(): Promise<void> {
  const config = loadConfig();
  const remote = config.remotes["connect"] as ChittyConnectRemote | undefined;

  if (!remote || remote.type !== "chittyconnect") {
    console.log(chalk.yellow("⚠ ChittyConnect not configured"));
    console.log(chalk.dim("Run: can connect setup\n"));
    return;
  }

  console.log(chalk.bold("\n🔗 ChittyConnect Status\n"));
  console.log(`Base URL: ${chalk.cyan(remote.baseUrl)}`);
  console.log(`API Token: ${remote.apiToken ? chalk.green("✓ Set") : chalk.yellow("⚠ Using env var")}`);
  console.log(`MCP Enabled: ${remote.mcpEnabled ? chalk.green("✓ Yes") : chalk.dim("No")}`);

  if (remote.githubAppInstallation) {
    console.log(`GitHub App: ${chalk.green("✓ Installed")}`);
  }

  console.log();
}

/**
 * Quick token update
 */
export async function connectToken(token?: string): Promise<void> {
  const config = loadConfig();

  if (!token) {
    const { newToken } = await inquirer.prompt([{
      type: "password",
      name: "newToken",
      message: "New ChittyConnect API token:",
      validate: (v: string) => v ? true : "Required"
    }]);
    token = newToken;
  }

  const remote = config.remotes["connect"] as ChittyConnectRemote | undefined;

  if (!remote || remote.type !== "chittyconnect") {
    // Create new remote
    const newRemote: ChittyConnectRemote = {
      type: "chittyconnect",
      baseUrl: "https://connect.chitty.cc",
      apiToken: token,
      mcpEnabled: true
    };
    config.remotes["connect"] = newRemote;
  } else {
    // Update existing
    remote.apiToken = token;
  }

  saveConfig(config);
  console.log(chalk.green("\n✓ Token updated\n"));
}
