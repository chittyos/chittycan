/**
 * Smart Chitty Command Handler
 *
 * Config-aware command execution that guides users through setup
 * when required remotes or CLI tools are missing.
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { isChittyInstalled, proxyToChitty, showUpgradeMessage } from "./chitty-proxy.js";
import { loadConfig } from "./config.js";
import { configMenu } from "../commands/config.js";
import {
  findCommandTemplate,
  getSetupInstructions,
  checkCLI,
  hasRemoteType,
  getRemotesByType,
  type CommandTemplate
} from "./command-templates.js";

/**
 * Smart command execution with config awareness
 */
export async function smartChittyCommand(args: string[]): Promise<void> {
  // First check if chitty CLI is installed
  if (!isChittyInstalled()) {
    showUpgradeMessage(args);
    process.exit(1);
  }

  const config = loadConfig();
  const template = findCommandTemplate(args);

  // If no specific requirements, just proxy to chitty
  if (!template) {
    proxyToChitty(args);
    return;
  }

  console.log();
  console.log(chalk.bold(`🔍 Detected: ${template.name}`));
  console.log();

  // Check required CLI tools first
  if (template.requiredCLIs) {
    for (const cli of template.requiredCLIs) {
      const installed = await checkCLI(cli);

      if (!installed) {
        console.log(chalk.yellow(`⚠️  Required CLI tool not found: ${cli.name}`));
        console.log();

        const { installCLI } = await inquirer.prompt([{
          type: "confirm",
          name: "installCLI",
          message: `Install ${cli.name}?`,
          default: true
        }]);

        if (installCLI) {
          console.log();
          console.log(chalk.dim(`Run: ${cli.installCommand}`));
          console.log();
          process.exit(0);
        } else {
          console.log();
          console.log(chalk.yellow(`Cannot proceed without ${cli.name}`));
          process.exit(1);
        }
      }
    }
  }

  // Check each required remote
  const missingRemotes: { type: string; setup: any }[] = [];

  for (const remoteType of template.requiredRemotes) {
    const hasRemote = hasRemoteType(config, remoteType);

    if (!hasRemote) {
      const setup = getSetupInstructions(template, remoteType);
      if (setup) {
        missingRemotes.push({ type: remoteType, setup });
      }
    }
  }

  // If missing required remotes, offer to configure
  if (missingRemotes.length > 0) {
    console.log(chalk.yellow(`⚠️  Missing required remotes:`));
    console.log();

    for (const { type, setup } of missingRemotes) {
      console.log(chalk.bold(`   ${setup.name} (${type})`));
      console.log(chalk.dim(`   Setup steps:`));
      for (const instruction of setup.instructions) {
        console.log(chalk.dim(`   • ${instruction}`));
      }
      if (setup.authCommand) {
        console.log(chalk.dim(`   Auth: ${setup.authCommand}`));
      }
      console.log();
    }

    const { configure } = await inquirer.prompt([{
      type: "confirm",
      name: "configure",
      message: "Configure remote now?",
      default: true
    }]);

    if (configure) {
      // Run config menu
      await configMenu();

      // Re-check after configuration
      const updatedConfig = loadConfig();
      const stillMissing = missingRemotes.filter(
        ({ type }) => !hasRemoteType(updatedConfig, type)
      );

      if (stillMissing.length > 0) {
        console.log();
        console.log(chalk.yellow("Configuration incomplete. Try again."));
        process.exit(1);
      }

      // Success - ask if user wants to proceed now
      console.log();
      console.log(chalk.green("✓ Remote configured!"));
      console.log();

      const { proceed } = await inquirer.prompt([{
        type: "confirm",
        name: "proceed",
        message: "Execute command now?",
        default: true
      }]);

      if (!proceed) {
        process.exit(0);
      }
    } else {
      process.exit(1);
    }
  }

  // All requirements met - show what we can do
  console.log(chalk.green("✓ All requirements met"));
  console.log();

  // Build description of what will happen
  const remotes = template.requiredRemotes.map(type => {
    const remoteList = getRemotesByType(config, type);
    return remoteList.length > 0 ? remoteList[0].name : type;
  });

  const description = buildCommandDescription(template, remotes, args);

  console.log(chalk.bold("ChittyCan will:"));
  console.log(chalk.dim(`  ${description}`));
  console.log();

  // Ask for approval
  const { approve } = await inquirer.prompt([{
    type: "confirm",
    name: "approve",
    message: "Proceed?",
    default: true
  }]);

  if (approve) {
    console.log();
    proxyToChitty(args);
  } else {
    console.log();
    console.log(chalk.yellow("Cancelled"));
    process.exit(0);
  }
}

/**
 * Build human-readable command description
 */
function buildCommandDescription(template: CommandTemplate, remotes: string[], args: string[]): string {
  const remotesStr = remotes.join(", ");
  const commandStr = args.join(" ");

  // Template-specific descriptions
  switch (template.name) {
    case "Cloudflare Deployment":
      return `Deploy using Cloudflare remote (${remotesStr})`;
    case "Database Operations":
      return `Execute database operation on ${remotesStr}`;
    case "GitHub Operations":
      return `Run GitHub operation: ${commandStr}`;
    case "Notion Operations":
      return `Sync with Notion database (${remotesStr})`;
    default:
      return `Execute: ${commandStr} using ${remotesStr}`;
  }
}
