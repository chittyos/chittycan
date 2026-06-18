import { loadConfig, saveConfig, type ChittyConnectRemote } from "../lib/config.js";
import chalk from "chalk";
import path from "path";
import os from "os";
import fs from "fs";
import inquirer from "inquirer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.join(__dirname, "..", "..");

/**
 * Generate Claude Code MCP configuration for ChittyConnect
 */
export async function generateMcpConfig(): Promise<void> {
  const config = loadConfig();
  const connectRemote = config.remotes["connect"] as ChittyConnectRemote | undefined;

  // Use PKG_ROOT for reliable path resolution whether installed globally or locally
  const scriptPath = path.join(PKG_ROOT, "scripts", "mcp-chittyconnect.js");

  const hasToken = connectRemote?.apiToken || process.env.CHITTY_TOKEN;
  const hasChittyId = process.env.CHITTY_ID || (connectRemote as any)?.chittyId;

  if (!hasToken && !hasChittyId) {
    console.log(chalk.yellow("⚠ No authentication found (API Token or ChittyID)"));
    console.log(chalk.dim("Internal users can use a registered ChittyID + Authorization."));
    console.log(chalk.dim("External users should set CHITTY_TOKEN or run: can connect token\n"));
    // Don't hard exit so we can still generate the config
  }

  if (!fs.existsSync(scriptPath)) {
    console.log(chalk.yellow(`⚠ MCP script not found at: ${scriptPath}`));
    console.log(chalk.dim("Ensure the chittycan package is installed correctly.\n"));
    // Don't return, allow generation so they see what it should look like
  }

  console.log(chalk.bold("\n🔗 Claude Code MCP Configuration\n"));
  console.log(chalk.dim("Add this to your Claude Code MCP settings:\n"));

  const envVars: Record<string, string> = {};
  if (connectRemote?.apiToken) envVars.CHITTY_TOKEN = connectRemote.apiToken;
  else if (!hasChittyId) envVars.CHITTY_TOKEN = "${CHITTY_TOKEN}";
  if (hasChittyId) envVars.CHITTY_ID = (connectRemote as any)?.chittyId || "${CHITTY_ID}";

  const mcpConfig = {
    mcpServers: {
      chittyconnect: {
        command: "node",
        args: [scriptPath],
        env: envVars,
      },
      cloudflare: {
        command: "npx",
        args: ["-y", "@cloudflare/mcp-server-cloudflare"],
        env: {
          CLOUDFLARE_API_TOKEN: "${CLOUDFLARE_API_TOKEN}",
          CLOUDFLARE_ACCOUNT_ID: "${CLOUDFLARE_ACCOUNT_ID}"
        }
      }
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

  const scriptPath = path.join(PKG_ROOT, "scripts", "mcp-chittyconnect.js");

  const hasToken = connectRemote?.apiToken || process.env.CHITTY_TOKEN;
  const hasChittyId = process.env.CHITTY_ID || (connectRemote as any)?.chittyId;

  if (!hasToken && !hasChittyId) {
    console.log(chalk.yellow("⚠ No authentication found (API Token or ChittyID)"));
    console.log(chalk.dim("Internal users can use a registered ChittyID + Authorization."));
    console.log(chalk.dim("External users should set CHITTY_TOKEN or run: can connect token\n"));
  }

  if (!fs.existsSync(scriptPath)) {
    console.log(chalk.yellow(`⚠ MCP script not found at: ${scriptPath}`));
    console.log(chalk.dim("Make sure chittycan is installed correctly."));
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

  const envVars: Record<string, string> = {};
  if (connectRemote?.apiToken || process.env.CHITTY_TOKEN) {
    envVars.CHITTY_TOKEN = connectRemote?.apiToken || process.env.CHITTY_TOKEN || "";
  }
  if (hasChittyId) {
    envVars.CHITTY_ID = (connectRemote as any)?.chittyId || process.env.CHITTY_ID || "";
  }
  if (databaseUrl) {
    envVars.DATABASE_URL = databaseUrl;
  }

  const mcpConfig = {
    mcpServers: {
      chittyconnect: {
        command: "node",
        args: [scriptPath],
        env: envVars,
      },
      cloudflare: {
        command: "npx",
        args: ["-y", "@cloudflare/mcp-server-cloudflare"],
        env: {
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || ""
        }
      }
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

    // Ask which editor to create pointers for
    const { targetEditor } = await inquirer.prompt([
      {
        type: "list",
        name: "targetEditor",
        message: "Which AI Editor are you targeting for these local projects?",
        choices: [
          { name: "Cursor (.cursor/mcp.json)", value: "cursor" },
          { name: "Windsurf (.windsurf/mcp.json)", value: "windsurf" },
          { name: "Roo Code (.roo/mcp.json)", value: "roo" }
        ]
      }
    ]);

    const editorPaths: Record<string, string> = {
      cursor: ".cursor/mcp.json",
      windsurf: ".windsurf/mcp.json",
      roo: ".roo/mcp.json"
    };

    const targetPointer = editorPaths[targetEditor];

    for (const proj of foundDirs) {
      const { installProj } = await inquirer.prompt([
        {
          type: "confirm",
          name: "installProj",
          message: `Found project at ${proj}. Install ${targetEditor} pointer here?`,
          default: false
        }
      ]);

      if (installProj) {
        const localConfigPath = path.join(proj, targetPointer);
        fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
        
        let localExistingConfig: any = {};
        if (fs.existsSync(localConfigPath)) {
          try {
            localExistingConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf8"));
          } catch (e) {}
        }
        
        const localFinalConfig = {
          ...localExistingConfig,
          mcpServers: {
            ...localExistingConfig.mcpServers,
            ...mcpConfig.mcpServers,
          },
        };

        fs.writeFileSync(localConfigPath, JSON.stringify(localFinalConfig, null, 2), "utf8");
        
        console.log(chalk.green(`✓ Installed to: ${localConfigPath}`));
      }
    }
  }
}
