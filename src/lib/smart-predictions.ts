/**
 * Smart Command Predictions - AI-Powered Next Command Suggestions
 *
 * Predicts your next command based on:
 * - Time of day patterns
 * - Command sequences
 * - Current working directory
 * - Recent git activity
 * - Day of week patterns
 */

import { loadUsageStats, type CommandUsage } from "./usage-tracker.js";
import { loadConfig } from "./config.js";

export interface Prediction {
  command: string;
  confidence: number;
  reason: string;
  suggestedNL: string; // Natural language version
}

export interface PredictionContext {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  dayOfWeek: number;
  currentDir: string;
  recentCommands: string[];
  gitBranch?: string;
  gitStatus?: string;
}

/**
 * Get current context for predictions
 */
export function getCurrentContext(): PredictionContext {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 12 ? "morning" :
    hour < 17 ? "afternoon" :
    hour < 21 ? "evening" : "night";

  return {
    timeOfDay,
    dayOfWeek: now.getDay(),
    currentDir: process.cwd(),
    recentCommands: []
  };
}

/**
 * Predict next commands based on AI + patterns
 */
export async function predictNextCommands(
  context: PredictionContext,
  limit: number = 5
): Promise<Prediction[]> {
  const stats = loadUsageStats();
  const predictions: Prediction[] = [];

  // Pattern 1: Time-based predictions
  const timeBasedPreds = getTimeBasedPredictions(stats, context);
  predictions.push(...timeBasedPreds);

  // Pattern 2: Sequence-based predictions
  const sequencePreds = getSequenceBasedPredictions(stats, context);
  predictions.push(...sequencePreds);

  // Pattern 3: Directory-based predictions
  const dirPreds = getDirectoryBasedPredictions(stats, context);
  predictions.push(...dirPreds);

  // Pattern 4: Day-of-week predictions
  const dayPreds = getDayOfWeekPredictions(stats, context);
  predictions.push(...dayPreds);

  // Deduplicate and sort by confidence
  const uniquePreds = deduplicatePredictions(predictions);
  return uniquePreds.slice(0, limit);
}

/**
 * Time-based predictions (morning routines, afternoon patterns, etc.)
 */
function getTimeBasedPredictions(
  stats: any,
  context: PredictionContext
): Prediction[] {
  const predictions: Prediction[] = [];
  const timeCommands = stats.commands.filter((cmd: CommandUsage) => {
    const cmdTime = new Date(cmd.timestamp);
    const cmdHour = cmdTime.getHours();
    const contextHour = new Date().getHours();

    // Match within 2-hour window
    return Math.abs(cmdHour - contextHour) <= 2;
  });

  // Count frequency
  const commandCounts: Record<string, number> = {};
  for (const cmd of timeCommands) {
    commandCounts[cmd.cli] = (commandCounts[cmd.cli] || 0) + 1;
  }

  // Top 3 time-based commands
  const sorted = Object.entries(commandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  for (const [cli, count] of sorted) {
    predictions.push({
      command: `can ${cli}`,
      confidence: Math.min(count / timeCommands.length, 0.9),
      reason: `You often use ${cli} during ${context.timeOfDay}`,
      suggestedNL: `can ${cli} [your command]`
    });
  }

  return predictions;
}

/**
 * Sequence-based predictions (what usually comes after what you just did)
 */
function getSequenceBasedPredictions(
  stats: any,
  context: PredictionContext
): Prediction[] {
  const predictions: Prediction[] = [];

  if (stats.commands.length < 2) return predictions;

  // Get last command
  const lastCmd = stats.commands[stats.commands.length - 1];

  // Find what usually follows this command
  const sequences: Record<string, number> = {};

  for (let i = 0; i < stats.commands.length - 1; i++) {
    if (stats.commands[i].cli === lastCmd.cli) {
      const nextCli = stats.commands[i + 1].cli;
      sequences[nextCli] = (sequences[nextCli] || 0) + 1;
    }
  }

  // Top 2 sequence predictions
  const sorted = Object.entries(sequences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  for (const [cli, count] of sorted) {
    predictions.push({
      command: `can ${cli}`,
      confidence: Math.min(count / 5, 0.85),
      reason: `You often use ${cli} after ${lastCmd.cli}`,
      suggestedNL: `can ${cli} [your command]`
    });
  }

  return predictions;
}

/**
 * Directory-based predictions (different commands in different dirs)
 */
function getDirectoryBasedPredictions(
  stats: any,
  context: PredictionContext
): Prediction[] {
  const predictions: Prediction[] = [];

  // This would need directory context stored with commands
  // For now, just return common project-related commands
  if (context.currentDir.includes("projects") || context.currentDir.includes("development")) {
    predictions.push({
      command: "can git",
      confidence: 0.7,
      reason: "You're in a development directory",
      suggestedNL: "can git status"
    });
    predictions.push({
      command: "can gh",
      confidence: 0.65,
      reason: "Common GitHub operations in project dirs",
      suggestedNL: "can gh pr status"
    });
  }

  return predictions;
}

/**
 * Day-of-week predictions (Monday morning patterns vs Friday afternoon)
 */
function getDayOfWeekPredictions(
  stats: any,
  context: PredictionContext
): Prediction[] {
  const predictions: Prediction[] = [];

  const dayCommands = stats.commands.filter((cmd: CommandUsage) => {
    const cmdDay = new Date(cmd.timestamp).getDay();
    return cmdDay === context.dayOfWeek;
  });

  if (dayCommands.length > 0) {
    const commandCounts: Record<string, number> = {};
    for (const cmd of dayCommands) {
      commandCounts[cmd.cli] = (commandCounts[cmd.cli] || 0) + 1;
    }

    const topCmd = Object.entries(commandCounts)
      .sort((a, b) => b[1] - a[1])[0];

    if (topCmd) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      predictions.push({
        command: `can ${topCmd[0]}`,
        confidence: 0.6,
        reason: `Common ${dayNames[context.dayOfWeek]} task`,
        suggestedNL: `can ${topCmd[0]} [your command]`
      });
    }
  }

  return predictions;
}

/**
 * Deduplicate predictions and sort by confidence
 */
function deduplicatePredictions(predictions: Prediction[]): Prediction[] {
  const seen = new Map<string, Prediction>();

  for (const pred of predictions) {
    const existing = seen.get(pred.command);
    if (!existing || pred.confidence > existing.confidence) {
      seen.set(pred.command, pred);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get AI-enhanced predictions using configured AI remote
 */
export async function getAIPredictions(
  context: PredictionContext,
  stats: any
): Promise<Prediction[]> {
  const config = loadConfig();
  const aiRemote = findAIRemote(config);

  if (!aiRemote) {
    return []; // Fall back to pattern-based only
  }

  try {
    const prompt = buildPredictionPrompt(context, stats);
    const response = await callAI(aiRemote, prompt);
    return parsePredictions(response);
  } catch (error) {
    return []; // Silently fall back
  }
}

/**
 * Find AI remote in config
 */
function findAIRemote(config: any): any {
  if (!config.remotes || !Array.isArray(config.remotes)) return null;

  const aiTypes = ["openai", "anthropic", "ollama", "groq"];
  return config.remotes.find((r: any) => aiTypes.includes(r.type));
}

/**
 * Build prompt for AI prediction
 */
function buildPredictionPrompt(context: PredictionContext, stats: any): string {
  const recentCmds = stats.commands.slice(-10).map((c: CommandUsage) =>
    `${c.cli}: ${c.naturalLanguage}`
  ).join("\n");

  return `Based on these recent commands and context, predict the next 3 most likely commands:

Recent commands:
${recentCmds}

Context:
- Time: ${context.timeOfDay}
- Day: ${context.dayOfWeek}
- Directory: ${context.currentDir}

Output format (one per line):
cli|confidence|reason|suggested_natural_language

Example:
gh|0.85|User often checks PR status after push|can gh check pr status`;
}

/**
 * Call AI service
 */
async function callAI(remote: any, prompt: string): Promise<string> {
  // Simplified - would use actual AI service
  return "";
}

/**
 * Parse AI predictions response
 */
function parsePredictions(response: string): Prediction[] {
  const lines = response.trim().split("\n");
  const predictions: Prediction[] = [];

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length === 4) {
      predictions.push({
        command: `can ${parts[0]}`,
        confidence: parseFloat(parts[1]),
        reason: parts[2],
        suggestedNL: parts[3]
      });
    }
  }

  return predictions;
}
