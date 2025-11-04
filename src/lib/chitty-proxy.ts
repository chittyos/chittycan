/**
 * ChittyCan → chitty CLI proxy
 *
 * Provides access to full chitty CLI for advanced features.
 */

import { execSync, spawnSync } from "child_process";
import chalk from "chalk";

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
    showUpgradeMessage();
    process.exit(1);
  }

  // Run chitty <args>
  const result = spawnSync("chitty", args, {
    stdio: "inherit",
    shell: true
  });

  process.exit(result.status || 0);
}

/**
 * Show upgrade message
 */
export function showUpgradeMessage(): void {
  console.log();
  console.log(chalk.yellow("⚠️  chitty CLI not installed"));
  console.log();
  console.log(chalk.bold("   Install full ChittyOS CLI:"));
  console.log(chalk.cyan("   npm install -g chitty"));
  console.log();
  console.log(chalk.dim("   The full chitty CLI includes:"));
  console.log(chalk.dim("   • Advanced AI orchestration"));
  console.log(chalk.dim("   • Multi-agent workflows"));
  console.log(chalk.dim("   • Natural language commands"));
  console.log(chalk.dim("   • ChittyOS service integrations"));
  console.log(chalk.dim("   • And much more..."));
  console.log();
}
