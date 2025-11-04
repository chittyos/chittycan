/**
 * ChittyCan → chitty CLI proxy
 *
 * Provides fallback to full chitty CLI for advanced features.
 * Wordplay: "ChittyCan't help, but chitty can!"
 *
 * Also supports natural language commands for supported CLIs:
 * `can gh "create a PR"` → chitty interprets and runs actual gh command
 */

import { execSync, spawnSync } from "child_process";
import chalk from "chalk";

/**
 * CLIs that support natural language interpretation via chitty
 */
export const SUPPORTED_CLIS = [
  "gh",       // GitHub CLI
  "docker",   // Docker
  "kubectl",  // Kubernetes
  "git",      // Git
  "npm",      // npm
  "aws",      // AWS CLI
  "gcloud",   // Google Cloud
  "az",       // Azure CLI
  "terraform", // Terraform
  "helm",     // Helm
  "cargo",    // Rust Cargo
  "pip",      // Python pip
  "yarn",     // Yarn
  "pnpm",     // pnpm
] as const;

export type SupportedCLI = typeof SUPPORTED_CLIS[number];

/**
 * Check if first arg is a supported CLI for natural language interpretation
 */
export function isSupportedCLI(arg: string): boolean {
  return SUPPORTED_CLIS.includes(arg as SupportedCLI);
}

/**
 * Check if the full chitty CLI is installed
 */
export function isChittyInstalled(): boolean {
  try {
    execSync("which chitty", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get chitty CLI version if installed
 */
export function getChittyVersion(): string | null {
  if (!isChittyInstalled()) return null;

  try {
    const output = execSync("chitty --version", { encoding: "utf-8" });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Proxy command to chitty CLI
 */
export function proxyToChitty(args: string[]): void {
  if (!isChittyInstalled()) {
    showUpgradeMessage(args);
    process.exit(1);
  }

  // Run chitty can <command> <args>
  const chittyArgs = ["can", ...args];
  const result = spawnSync("chitty", chittyArgs, {
    stdio: "inherit",
    shell: true
  });

  process.exit(result.status || 0);
}

/**
 * Show upgrade message with wordplay
 */
export function showUpgradeMessage(args: string[]): void {
  const command = args.join(" ");
  const firstArg = args[0];
  const isNaturalLanguage = isSupportedCLI(firstArg);

  console.log();
  console.log(chalk.yellow("⚠️  ChittyCan't help with that command!"));
  console.log();
  console.log(chalk.dim(`   Command: ${chalk.white(command)}`));
  console.log();
  console.log(chalk.green("   But chitty can! ✨"));
  console.log();
  console.log(chalk.bold("   Upgrade to full ChittyOS CLI:"));
  console.log(chalk.cyan("   npm install -g chitty"));
  console.log();
  console.log(chalk.dim("   The full chitty CLI includes:"));
  console.log(chalk.dim("   • Advanced AI orchestration"));
  console.log(chalk.dim("   • Multi-agent workflows"));
  console.log(chalk.dim("   • Natural language commands for 14+ CLIs"));
  console.log(chalk.dim("   • ChittyOS service integrations"));
  console.log(chalk.dim("   • And much more..."));
  console.log();

  // Show natural language example if this is a supported CLI
  if (isNaturalLanguage) {
    console.log(chalk.bold("   Natural Language Commands:"));
    console.log(chalk.dim(`   $ can ${firstArg} your request in plain English`));
    console.log(chalk.dim(`   $ can ${firstArg} "quotes optional but helpful"`));
    console.log();
    console.log(chalk.dim(`   Examples:`));
    console.log(chalk.dim(`   $ chitty can gh create a PR for bug fix`));
    console.log(chalk.dim(`   $ chitty can docker list running containers`));
    console.log();
    console.log(chalk.dim(`   Supported CLIs: ${SUPPORTED_CLIS.slice(0, 5).join(", ")}, and more...`));
    console.log();
  }
}

/**
 * Show info about chitty integration
 */
export function showChittyInfo(): void {
  const version = getChittyVersion();

  console.log();
  if (version) {
    console.log(chalk.green("✓") + " Full ChittyOS CLI installed");
    console.log(chalk.dim(`  Version: ${version}`));
    console.log(chalk.dim(`  Advanced commands available via: chitty can <command>`));
  } else {
    console.log(chalk.yellow("ℹ") + " ChittyCan lite version");
    console.log(chalk.dim(`  Upgrade to full CLI: npm install -g chitty`));
  }
  console.log();
}
