/**
 * Usage Tracker - "Grow With Me" Intelligence
 *
 * Tracks command usage to personalize ChittyCan for each user.
 * Learns patterns, builds custom shortcuts, suggests optimizations.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface CommandUsage {
  cli: string;
  naturalLanguage: string;
  interpretedCommand: string;
  timestamp: string;
  successful: boolean;
}

interface UsageStats {
  commands: CommandUsage[];
  cliUsageCount: Record<string, number>;
  frequentPatterns: Array<{
    pattern: string;
    count: number;
    lastUsed: string;
  }>;
}

const USAGE_FILE = join(homedir(), ".chittycan", "usage.json");

/**
 * Load usage stats
 */
export function loadUsageStats(): UsageStats {
  if (!existsSync(USAGE_FILE)) {
    return {
      commands: [],
      cliUsageCount: {},
      frequentPatterns: []
    };
  }

  try {
    const data = readFileSync(USAGE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      commands: [],
      cliUsageCount: {},
      frequentPatterns: []
    };
  }
}

/**
 * Save usage stats
 */
function saveUsageStats(stats: UsageStats): void {
  try {
    writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    // Silently fail - don't disrupt user experience
  }
}

/**
 * Track command usage
 */
export function trackCommandUsage(
  cli: string,
  naturalLanguage: string,
  interpretedCommand: string,
  successful: boolean = true
): void {
  const stats = loadUsageStats();

  // Add to command history
  stats.commands.push({
    cli,
    naturalLanguage,
    interpretedCommand,
    timestamp: new Date().toISOString(),
    successful
  });

  // Keep only last 1000 commands
  if (stats.commands.length > 1000) {
    stats.commands = stats.commands.slice(-1000);
  }

  // Update CLI usage count
  stats.cliUsageCount[cli] = (stats.cliUsageCount[cli] || 0) + 1;

  // Update frequent patterns
  updateFrequentPatterns(stats, naturalLanguage);

  saveUsageStats(stats);
}

/**
 * Update frequent patterns
 */
function updateFrequentPatterns(stats: UsageStats, naturalLanguage: string): void {
  const pattern = extractPattern(naturalLanguage);

  const existing = stats.frequentPatterns.find(p => p.pattern === pattern);

  if (existing) {
    existing.count++;
    existing.lastUsed = new Date().toISOString();
  } else {
    stats.frequentPatterns.push({
      pattern,
      count: 1,
      lastUsed: new Date().toISOString()
    });
  }

  // Sort by count and keep top 50
  stats.frequentPatterns.sort((a, b) => b.count - a.count);
  stats.frequentPatterns = stats.frequentPatterns.slice(0, 50);
}

/**
 * Extract pattern from natural language
 * e.g., "gh clone my repo" -> "clone repo"
 */
function extractPattern(naturalLanguage: string): string {
  const words = naturalLanguage.toLowerCase().split(" ");

  // Remove CLI name if present
  const clis = ["gh", "docker", "kubectl", "git", "npm", "aws", "gcloud", "az", "terraform", "helm", "cargo", "pip", "yarn", "pnpm"];
  const filteredWords = words.filter(w => !clis.includes(w));

  // Remove common filler words
  const fillers = ["the", "a", "an", "my", "your", "their", "our", "this", "that"];
  const meaningfulWords = filteredWords.filter(w => !fillers.includes(w));

  return meaningfulWords.slice(0, 3).join(" ");
}

/**
 * Get most used CLIs
 */
export function getMostUsedCLIs(limit: number = 5): Array<{ cli: string; count: number }> {
  const stats = loadUsageStats();

  return Object.entries(stats.cliUsageCount)
    .map(([cli, count]) => ({ cli, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get frequent patterns for a CLI
 */
export function getFrequentPatternsForCLI(cli: string, limit: number = 5): string[] {
  const stats = loadUsageStats();

  // Filter commands for this CLI
  const cliCommands = stats.commands
    .filter(cmd => cmd.cli === cli && cmd.successful)
    .slice(-100); // Last 100 commands

  // Count patterns
  const patternCounts: Record<string, number> = {};

  for (const cmd of cliCommands) {
    const pattern = extractPattern(cmd.naturalLanguage);
    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
  }

  // Sort and return top patterns
  return Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pattern]) => pattern);
}

/**
 * Get personalized suggestions
 */
export function getPersonalizedSuggestions(cli?: string): string[] {
  const stats = loadUsageStats();

  if (cli) {
    // Get suggestions for specific CLI
    const patterns = getFrequentPatternsForCLI(cli);
    return patterns.map(p => `can ${cli} ${p}`);
  }

  // Get general suggestions based on most used CLIs
  const mostUsed = getMostUsedCLIs(3);
  const suggestions: string[] = [];

  for (const { cli } of mostUsed) {
    const patterns = getFrequentPatternsForCLI(cli, 2);
    for (const pattern of patterns) {
      suggestions.push(`can ${cli} ${pattern}`);
    }
  }

  return suggestions.slice(0, 5);
}

/**
 * Show usage insights
 */
export function showUsageInsights(): void {
  const stats = loadUsageStats();

  if (stats.commands.length === 0) {
    console.log("No usage data yet. Start using chitty commands!");
    return;
  }

  console.log("\n📊 Your ChittyCan Usage Insights\n");

  // Most used CLIs
  const mostUsed = getMostUsedCLIs();
  console.log("Most Used CLIs:");
  for (const { cli, count } of mostUsed) {
    console.log(`  ${cli}: ${count} times`);
  }

  console.log("\n🎯 Your Frequent Patterns:");
  for (const { pattern, count } of stats.frequentPatterns.slice(0, 5)) {
    console.log(`  "${pattern}" - ${count} times`);
  }

  console.log("\n💡 Personalized Suggestions:");
  const suggestions = getPersonalizedSuggestions();
  for (const suggestion of suggestions) {
    console.log(`  ${suggestion}`);
  }

  console.log();
}
