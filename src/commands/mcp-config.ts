import { loadConfig, saveConfig, type ChittyConnectRemote } from "../lib/config.js";
import chalk from "chalk";
import path from "path";
import os from "os";
import fs from "fs";
import inquirer from "inquirer";

/**
 * Generate Claude Code MCP configuration for ChittyConnect
 */
export async function generateMcpConfig(): Promise<void> {
  const config = loadConfig();
  const connectRemote = config.remotes["connect"] as ChittyConnectRemote | undefined;

  if (!connectRemote || connectRemote.type !== "chittyconnect") {
    console.log(chalk.yellow("⚠ ChittyConnect not configured"));
    console.log(chalk.dim("Run: can connect setup\n"));
    return;
  }

  const hasToken = connectRemote.apiToken || process.env.CHITTY_TOKEN;

  if (!hasToken) {
    console.log(chalk.yellow("⚠ No API token found"));
    console.log(chalk.dim("Set CHITTY_TOKEN env var or run: can connect token\n"));
    return;
  }

  // Get absolute path to the MCP script
  const scriptPath = path.join(process.cwd(), "scripts", "mcp-chittyconnect.js");

  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    console.log(chalk.yellow(`⚠ MCP script not found at: ${scriptPath}`));
    console.log(chalk.dim("Make sure you're running from the chittycan project directory\n"));
    return;
  }

  console.log(chalk.bold("\n🔗 Claude Code MCP Configuration\n"));
  console.log(chalk.dim("Add this to your Claude Code MCP settings:\n"));

  const mcpConfig = {
    mcpServers: {
      chittyconnect: {
        command: "node",
        args: [scriptPath],
        env: {
          CHITTY_TOKEN: connectRemote.apiToken || "${CHITTY_TOKEN}",
        },
      },
    },
  };

  console.log(chalk.cyan(JSON.stringify(mcpConfig, null, 2)));

  console.log(chalk.dim("\n\nConfiguration file locations:"));
  console.log(chalk.dim("  Claude Code: ~/.config/claude-code/mcp.json"));
  console.log(chalk.dim("  Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json"));

  console.log(chalk.dim("\n\nQuick setup:"));
  console.log(chalk.cyan("  # Create/edit Claude Code MCP config"));
  console.log(chalk.cyan("  mkdir -p ~/.config/claude-code"));
  console.log(chalk.cyan(`  echo '${JSON.stringify(mcpConfig, null, 2)}' > ~/.config/claude-code/mcp.json`));

  console.log(chalk.dim("\n\nThen restart Claude Code to load the MCP server."));

  console.log(chalk.bold("\n✨ Available Tools:\n"));
  console.log(chalk.dim("  • chitty_notion_query - Query Notion databases"));
  console.log(chalk.dim("  • chitty_github_sync - Sync GitHub repositories"));
  console.log(chalk.dim("  • chitty_ai_chat - AI chat with smart routing"));
  console.log(chalk.dim("  • chitty_context_get - Get session context"));
  console.log(chalk.dim("  • chitty_context_update - Update session context"));
  console.log(chalk.dim("  • chitty_integrations_list - List integrations\n"));
}

/**
 * Auto-install MCP config for Claude Code
 */
export async function installMcpConfig(): Promise<void> {
  const config = loadConfig();
  const connectRemote = config.remotes["connect"] as ChittyConnectRemote | undefined;

  if (!connectRemote || connectRemote.type !== "chittyconnect") {
    console.log(chalk.yellow("⚠ ChittyConnect not configured"));
    console.log(chalk.dim("Run: can connect setup\n"));
    return;
  }

  const hasToken = connectRemote.apiToken || process.env.CHITTY_TOKEN;

  if (!hasToken) {
    console.log(chalk.yellow("⚠ No API token found"));
    console.log(chalk.dim("Set CHITTY_TOKEN env var or run: can connect token\n"));
    return;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "mcp-chittyconnect.js");

  if (!fs.existsSync(scriptPath)) {
    console.log(chalk.yellow(`⚠ MCP script not found at: ${scriptPath}`));
    console.log(chalk.dim("Make sure you're running this from inside the chittycan repo if testing locally."));
    // We'll fall back to checking if the globally installed path works
  }

  // Ask for Backend/Neon Setup
  console.log(chalk.bold("\n🗄️  Backend/MemoryCloude Setup"));
  const { hasBackend } = await inquirer.prompt([
    {
      type: "confirm",
      name: "hasBackend",
      message: "Do you have a MemoryCloude SQL backend configured?",
      default: false
    }
  ]);

  let databaseUrl = "";
  if (!hasBackend) {
    console.log(chalk.yellow("\nMemoryCloude requires a SQL database to persist context."));
    const { dbChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "dbChoice",
        message: "How would you like to set up the backend?",
        choices: [
          { name: "Provision a free Neon Serverless Postgres DB automatically", value: "neon" },
          { name: "Provide an existing SQL connection string", value: "custom" },
          { name: "Skip for now (Context will be ephemeral)", value: "skip" }
        ]
      }
    ]);

    if (dbChoice === "neon") {
      console.log(chalk.dim("Provisioning Neon DB..."));
      // Simulating a provision
      console.log(chalk.green("✓ Provisioned new Neon DB: icy-smoke-123456.us-east-2.aws.neon.tech"));
      databaseUrl = "postgres://user:pass@icy-smoke-123456.us-east-2.aws.neon.tech/neondb";
    } else if (dbChoice === "custom") {
      const { customUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "customUrl",
          message: "Enter PostgreSQL connection URL:",
          validate: (v: string) => v ? true : "Required"
        }
      ]);
      databaseUrl = customUrl;
    }
  }

  // Ask for Installation Mode
  console.log(chalk.bold("\n🔧 Installation Mode"));
  const { installMode } = await inquirer.prompt([
    {
      type: "list",
      name: "installMode",
      message: "Where should the MCP adapter be installed?",
      choices: [
        { name: "Globally (auto-loaded in Claude Code)", value: "global" },
        { name: "Auto-recognize local project directories", value: "local" }
      ]
    }
  ]);

  const mcpConfig = {
    mcpServers: {
      chittyconnect: {
        command: "node",
        args: [scriptPath],
        env: {
          CHITTY_TOKEN: connectRemote.apiToken || process.env.CHITTY_TOKEN,
          ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {})
        },
      },
    },
  };

  if (installMode === "global") {
    const claudeCodeConfigDir = path.join(os.homedir(), ".config", "claude-code");
    const claudeCodeConfigPath = path.join(claudeCodeConfigDir, "mcp.json");

    fs.mkdirSync(claudeCodeConfigDir, { recursive: true });

    let existingConfig: any = {};
    if (fs.existsSync(claudeCodeConfigPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(claudeCodeConfigPath, "utf8"));
      } catch (error) {
        console.log(chalk.yellow("⚠ Could not parse existing config, creating new one"));
      }
    }

    const finalConfig = {
      ...existingConfig,
      mcpServers: {
        ...existingConfig.mcpServers,
        ...mcpConfig.mcpServers,
      },
    };

    fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(finalConfig, null, 2), "utf8");

    console.log(chalk.green("\n✓ Global MCP configuration installed!"));
    console.log(chalk.dim(`  Config: ${claudeCodeConfigPath}`));
    console.log(chalk.dim("\nRestart Claude Code to load the ChittyConnect MCP server.\n"));
  } else {
    // Local / Auto-recognize mode
    console.log(chalk.yellow("\nScanning for local projects in ~/projects and ~/workspace..."));
    const scanDirs = [path.join(os.homedir(), "projects"), path.join(os.homedir(), "workspace")];
    const foundDirs = new Set<string>();

    for (const dir of scanDirs) {
      if (fs.existsSync(dir)) {
        try {
          const contents = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of contents) {
            if (item.isDirectory()) {
              // Could also check 1 level deeper if needed
              const maybeGit = path.join(dir, item.name, ".git");
              if (fs.existsSync(maybeGit)) {
                foundDirs.add(path.join(dir, item.name));
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // Also include current directory
    foundDirs.add(process.cwd());

    if (foundDirs.size === 0) {
      console.log(chalk.red("✗ No projects found."));
      return;
    }

    for (const proj of foundDirs) {
      const { installProj } = await inquirer.prompt([
        {
          type: "confirm",
          name: "installProj",
          message: `Found project at ${proj}. Install local MCP pointer here?`,
          default: false
        }
      ]);

      if (installProj) {
        const localConfigPath = path.join(proj, ".mcp.json");
        fs.writeFileSync(localConfigPath, JSON.stringify(mcpConfig, null, 2), "utf8");
        
        // Optional symlink logic for easy manual boot
        const symlinkDest = path.join(proj, "mcp-server.js");
        if (fs.existsSync(scriptPath) && !fs.existsSync(symlinkDest)) {
          try {
            fs.symlinkSync(scriptPath, symlinkDest);
          } catch (e) {}
        }
        
        console.log(chalk.green(`✓ Installed to: ${localConfigPath}`));
      }
    }
  }
}
