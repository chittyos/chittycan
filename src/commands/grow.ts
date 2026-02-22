/**
 * Grow With Me Commands
 *
 * Commands for:
 * - Analytics dashboard
 * - Smart predictions
 * - Workflow suggestions
 * - Learning hooks
 */

import chalk from "chalk";
import inquirer from "inquirer";
import { showAnalyticsDashboard } from "../lib/analytics-dashboard.js";
import { predictNextCommands, getCurrentContext } from "../lib/smart-predictions.js";
import {
  generateWorkflowSuggestions,
  loadSuggestions,
  acceptSuggestion,
  dismissSuggestion
} from "../lib/workflow-generator.js";
import {
  onCommandExecuted,
  onDirectoryChange,
  onGitOperation
} from "../lib/learning-hooks.js";

/**
 * Show analytics dashboard
 */
export function analyticsCommand(): void {
  showAnalyticsDashboard();
}

/**
 * Show smart predictions
 */
export async function predictCommand(options: { quiet?: boolean } = {}): Promise<void> {
  const context = getCurrentContext();
  const predictions = await predictNextCommands(context, 5);

  if (predictions.length === 0) {
    if (!options.quiet) {
      console.log(chalk.yellow("\n📊 Not enough data for predictions yet."));
      console.log(chalk.dim("Use ChittyCan more to see smart suggestions!\n"));
    }
    return;
  }

  if (options.quiet) {
    // Just output top prediction for shell integration
    console.log(predictions[0].suggestedNL);
    return;
  }

  console.log();
  console.log(chalk.bold.cyan("🔮 Smart Predictions"));
  console.log(chalk.dim(`Based on your patterns and current context (${context.timeOfDay})`));
  console.log();

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const confidence = (pred.confidence * 100).toFixed(0);
    const bar = "█".repeat(Math.floor(pred.confidence * 20));

    console.log(
      `${chalk.green((i + 1) + ".")} ${chalk.white(pred.suggestedNL)}`
    );
    console.log(
      `   ${chalk.cyan(bar)} ${chalk.dim(confidence + "% - " + pred.reason)}`
    );
    console.log();
  }
}

/**
 * Show workflow suggestions
 */
export async function suggestionsCommand(): Promise<void> {
  const suggestions = loadSuggestions();

  if (suggestions.length === 0) {
    // Try to generate new ones
    console.log(chalk.dim("Analyzing your command patterns..."));
    const newSuggestions = generateWorkflowSuggestions();

    if (newSuggestions.length === 0) {
      console.log();
      console.log(chalk.yellow("💡 No workflow suggestions yet."));
      console.log(chalk.dim("Run similar command sequences 3+ times to get suggestions!"));
      console.log();
      return;
    }

    console.log();
    console.log(chalk.green(`✓ Found ${newSuggestions.length} new workflow suggestion(s)!`));
    console.log();

    // Show them
    await showAndHandleSuggestions(newSuggestions);
  } else {
    await showAndHandleSuggestions(suggestions);
  }
}

/**
 * Show and interactively handle suggestions
 */
async function showAndHandleSuggestions(suggestions: any[]): Promise<void> {
  console.log(chalk.bold("🔧 Workflow Suggestions\n"));

  for (const suggestion of suggestions) {
    console.log(chalk.cyan(`can chitty ${suggestion.trigger}`));
    console.log(chalk.white(`  ${suggestion.description}`));
    console.log(chalk.dim(`  ${suggestion.reason}`));
    console.log(chalk.dim(`  Steps: ${suggestion.steps.length}`));
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "✓ Create this workflow", value: "accept" },
          { name: "→ Skip for now", value: "skip" },
          { name: "✗ Dismiss permanently", value: "dismiss" },
          { name: "⏸  Stop reviewing", value: "stop" }
        ]
      }
    ]);

    if (action === "accept") {
      acceptSuggestion(suggestion);
      console.log(chalk.green(`\n✓ Workflow created: can chitty ${suggestion.trigger}\n`));
    } else if (action === "dismiss") {
      dismissSuggestion(suggestion.trigger);
      console.log(chalk.dim("\nDismissed\n"));
    } else if (action === "stop") {
      break;
    } else {
      console.log();
    }
  }
}

/**
 * Learning command (called from shell hooks)
 */
export async function learnCommand(
  type: "command" | "context" | "git",
  args: string[]
): Promise<void> {
  if (type === "command") {
    // args: [command, exitCode]
    const command = args[0];
    const exitCode = parseInt(args[1] || "0");
    const duration = 0; // Would measure in real implementation

    await onCommandExecuted(command, exitCode, duration);
  } else if (type === "context") {
    // args: ["--cwd", "/path/to/dir"]
    const cwdIndex = args.indexOf("--cwd");
    if (cwdIndex >= 0 && args[cwdIndex + 1]) {
      const newDir = args[cwdIndex + 1];
      const oldDir = process.cwd();
      await onDirectoryChange(newDir, oldDir);
    }
  } else if (type === "git") {
    // args: git operation parts
    const operation = args[0];
    const branch = "main"; // Would detect from git
    await onGitOperation(operation, branch, true);
  }
}

/**
 * Show growth stats (simplified analytics)
 */
export function growthCommand(): void {
  const stats = require("../lib/usage-tracker.js").loadUsageStats();

  if (stats.commands.length === 0) {
    console.log(chalk.yellow("\n🌱 Start using ChittyCan to see your growth!\n"));
    return;
  }

  console.log();
  console.log(chalk.bold.green("🌱 Your Growth Journey"));
  console.log();

  const totalCommands = stats.commands.length;
  const uniqueCLIs = Object.keys(stats.cliUsageCount).length;
  const avgPerDay = (totalCommands / 7).toFixed(1); // Last week estimate

  console.log(chalk.white(`  Commands run:     ${chalk.green(totalCommands)}`));
  console.log(chalk.white(`  CLIs mastered:    ${chalk.cyan(uniqueCLIs)}`));
  console.log(chalk.white(`  Avg per day:      ${chalk.yellow(avgPerDay)}`));
  console.log();

  console.log(chalk.dim("📊 Full analytics: can chitty analytics"));
  console.log(chalk.dim("🔮 Predictions:    can predict"));
  console.log(chalk.dim("💡 Suggestions:    can chitty suggestions"));
  console.log();
}
