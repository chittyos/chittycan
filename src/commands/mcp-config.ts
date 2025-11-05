import { loadConfig, type ChittyConnectRemote } from "../lib/config.js";
import chalk from "chalk";
import path from "path";
import os from "os";
import fs from "fs";

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
    return;
  }

  const claudeCodeConfigDir = path.join(os.homedir(), ".config", "claude-code");
  const claudeCodeConfigPath = path.join(claudeCodeConfigDir, "mcp.json");

  const mcpConfig = {
    mcpServers: {
      chittyconnect: {
        command: "node",
        args: [scriptPath],
        env: {
          CHITTY_TOKEN: connectRemote.apiToken || process.env.CHITTY_TOKEN,
        },
      },
    },
  };

  // Create directory if it doesn't exist
  fs.mkdirSync(claudeCodeConfigDir, { recursive: true });

  // Load existing config if present
  let existingConfig: any = {};
  if (fs.existsSync(claudeCodeConfigPath)) {
    try {
      const data = fs.readFileSync(claudeCodeConfigPath, "utf8");
      existingConfig = JSON.parse(data);
    } catch (error) {
      console.log(chalk.yellow("⚠ Could not parse existing config, creating new one"));
    }
  }

  // Merge configs
  const finalConfig = {
    ...existingConfig,
    mcpServers: {
      ...existingConfig.mcpServers,
      ...mcpConfig.mcpServers,
    },
  };

  // Write config
  fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(finalConfig, null, 2), "utf8");

  console.log(chalk.green("\n✓ MCP configuration installed!"));
  console.log(chalk.dim(`  Config: ${claudeCodeConfigPath}`));
  console.log(chalk.dim("\nRestart Claude Code to load the ChittyConnect MCP server.\n"));
}
