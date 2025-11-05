/**
 * Usage Analytics Dashboard
 *
 * Rich CLI dashboard showing:
 * - Productivity patterns
 * - Time saved metrics
 * - Growth over time
 * - CLI expertise levels
 * - Workflow efficiency
 */

import chalk from "chalk";
import { loadUsageStats } from "./usage-tracker.js";
import { loadWorkflows } from "./custom-workflows.js";

export interface AnalyticsSummary {
  totalCommands: number;
  uniqueCLIs: number;
  timeSaved: number; // estimated minutes
  avgCommandsPerDay: number;
  productivityScore: number;
  topCLI: string;
  growthRate: number; // percentage increase over last period
  streakDays: number;
  expertiseLevels: Record<string, ExpertiseLevel>;
}

export interface ExpertiseLevel {
  cli: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  commandCount: number;
  uniquePatterns: number;
  lastUsed: string;
}

export interface TimePattern {
  hour: number;
  commandCount: number;
  topCLI: string;
}

export interface ProductivityInsight {
  type: "positive" | "suggestion" | "achievement";
  title: string;
  message: string;
  metric?: string;
}

/**
 * Show comprehensive analytics dashboard
 */
export function showAnalyticsDashboard(): void {
  const stats = loadUsageStats();
  const workflows = loadWorkflows();

  if (stats.commands.length === 0) {
    console.log(chalk.yellow("\n📊 No usage data yet. Start using ChittyCan to see your analytics!\n"));
    return;
  }

  const summary = calculateAnalyticsSummary(stats, workflows);
  const insights = generateInsights(summary, stats);
  const timePatterns = analyzeTimePatterns(stats);

  // Header
  console.log();
  console.log(chalk.bold.cyan("═══════════════════════════════════════════════════════════"));
  console.log(chalk.bold.cyan("        📊 ChittyCan Analytics Dashboard"));
  console.log(chalk.bold.cyan("        Your Journey to CLI Mastery"));
  console.log(chalk.bold.cyan("═══════════════════════════════════════════════════════════"));
  console.log();

  // Overview Section
  showOverviewSection(summary);

  // Productivity Section
  showProductivitySection(summary, stats);

  // Expertise Section
  showExpertiseSection(summary);

  // Time Patterns Section
  showTimePatternsSection(timePatterns);

  // Workflows Section
  showWorkflowsSection(workflows);

  // Insights Section
  showInsightsSection(insights);

  // Growth Visualization
  showGrowthVisualization(stats);

  console.log(chalk.bold.cyan("═══════════════════════════════════════════════════════════"));
  console.log();
}

/**
 * Show overview section
 */
function showOverviewSection(summary: AnalyticsSummary): void {
  console.log(chalk.bold("📈 Overview"));
  console.log();

  const cols = [
    { label: "Total Commands", value: summary.totalCommands.toString(), icon: "🎯" },
    { label: "Unique CLIs", value: summary.uniqueCLIs.toString(), icon: "🔧" },
    { label: "Time Saved", value: `~${summary.timeSaved}min`, icon: "⏱️" },
    { label: "Productivity Score", value: summary.productivityScore.toString(), icon: "💯" }
  ];

  // Display in 2x2 grid
  for (let i = 0; i < cols.length; i += 2) {
    const left = cols[i];
    const right = cols[i + 1];

    console.log(
      `  ${left.icon} ${chalk.white(left.label.padEnd(20))} ${chalk.green.bold(left.value.padStart(10))}    ` +
      `${right.icon} ${chalk.white(right.label.padEnd(20))} ${chalk.green.bold(right.value.padStart(10))}`
    );
  }

  console.log();

  // Streak
  if (summary.streakDays > 0) {
    console.log(`  🔥 ${chalk.yellow.bold(summary.streakDays)} day streak! Keep it up!`);
    console.log();
  }
}

/**
 * Show productivity section
 */
function showProductivitySection(summary: AnalyticsSummary, stats: any): void {
  console.log(chalk.bold("💪 Productivity"));
  console.log();

  const avgPerDay = summary.avgCommandsPerDay.toFixed(1);
  console.log(`  ${chalk.white("Average commands/day:")} ${chalk.green(avgPerDay)}`);

  if (summary.growthRate > 0) {
    console.log(`  ${chalk.white("Growth rate:")} ${chalk.green("+" + summary.growthRate.toFixed(1) + "%")} 📈`);
  } else if (summary.growthRate < 0) {
    console.log(`  ${chalk.white("Growth rate:")} ${chalk.red(summary.growthRate.toFixed(1) + "%")} 📉`);
  }

  console.log(`  ${chalk.white("Top CLI:")} ${chalk.cyan(summary.topCLI)}`);

  // Success rate
  const successful = stats.commands.filter((c: any) => c.successful).length;
  const successRate = ((successful / stats.commands.length) * 100).toFixed(1);
  console.log(`  ${chalk.white("Success rate:")} ${chalk.green(successRate + "%")}`);

  console.log();
}

/**
 * Show expertise section
 */
function showExpertiseSection(summary: AnalyticsSummary): void {
  console.log(chalk.bold("🎓 CLI Expertise"));
  console.log();

  const sorted = Object.values(summary.expertiseLevels)
    .sort((a, b) => b.commandCount - a.commandCount)
    .slice(0, 5);

  for (const expertise of sorted) {
    const levelColor =
      expertise.level === "expert" ? chalk.magenta :
      expertise.level === "advanced" ? chalk.cyan :
      expertise.level === "intermediate" ? chalk.blue :
      chalk.gray;

    const levelBadge =
      expertise.level === "expert" ? "🏆" :
      expertise.level === "advanced" ? "💎" :
      expertise.level === "intermediate" ? "⭐" :
      "📚";

    console.log(
      `  ${levelBadge} ${chalk.white(expertise.cli.padEnd(12))} ` +
      `${levelColor(expertise.level.padEnd(15))} ` +
      `${chalk.dim(expertise.commandCount + " commands")}`
    );
  }

  console.log();
}

/**
 * Show time patterns section
 */
function showTimePatternsSection(patterns: TimePattern[]): void {
  console.log(chalk.bold("🕐 Time Patterns"));
  console.log();

  // Group by time of day
  const morning = patterns.filter(p => p.hour >= 6 && p.hour < 12);
  const afternoon = patterns.filter(p => p.hour >= 12 && p.hour < 18);
  const evening = patterns.filter(p => p.hour >= 18 && p.hour < 24);
  const night = patterns.filter(p => p.hour >= 0 && p.hour < 6);

  const timeGroups = [
    { name: "Morning", icon: "🌅", patterns: morning },
    { name: "Afternoon", icon: "☀️", patterns: afternoon },
    { name: "Evening", icon: "🌆", patterns: evening },
    { name: "Night", icon: "🌙", patterns: night }
  ];

  for (const group of timeGroups) {
    const total = group.patterns.reduce((sum, p) => sum + p.commandCount, 0);
    if (total > 0) {
      const topCLI = group.patterns.sort((a, b) => b.commandCount - a.commandCount)[0]?.topCLI || "N/A";
      console.log(
        `  ${group.icon} ${chalk.white(group.name.padEnd(12))} ` +
        `${chalk.green(total.toString().padStart(4))} commands ` +
        `${chalk.dim("(top: " + topCLI + ")")}`
      );
    }
  }

  console.log();
}

/**
 * Show workflows section
 */
function showWorkflowsSection(workflows: any[]): void {
  console.log(chalk.bold("🔧 Workflows"));
  console.log();

  if (workflows.length === 0) {
    console.log(chalk.dim("  No workflows created yet. Run: can chitty workflows"));
  } else {
    const sorted = workflows.sort((a, b) => b.usageCount - a.usageCount).slice(0, 3);

    for (const wf of sorted) {
      console.log(
        `  ${chalk.cyan("can chitty " + wf.trigger.padEnd(20))} ` +
        `${chalk.dim("used " + wf.usageCount + " times")}`
      );
    }

    if (workflows.length > 3) {
      console.log(chalk.dim(`  ... and ${workflows.length - 3} more`));
    }
  }

  console.log();
}

/**
 * Show insights section
 */
function showInsightsSection(insights: ProductivityInsight[]): void {
  console.log(chalk.bold("💡 Insights & Suggestions"));
  console.log();

  for (const insight of insights.slice(0, 3)) {
    const icon =
      insight.type === "positive" ? "🎉" :
      insight.type === "achievement" ? "🏆" :
      "💭";

    console.log(`  ${icon} ${chalk.white(insight.title)}`);
    console.log(`     ${chalk.dim(insight.message)}`);
    if (insight.metric) {
      console.log(`     ${chalk.cyan(insight.metric)}`);
    }
    console.log();
  }
}

/**
 * Show growth visualization
 */
function showGrowthVisualization(stats: any): void {
  console.log(chalk.bold("📊 Command History (Last 7 Days)"));
  console.log();

  const last7Days = getLast7Days();
  const commandsByDay = groupCommandsByDay(stats.commands, last7Days);

  const maxCommands = Math.max(...Object.values(commandsByDay));
  const maxBarWidth = 40;

  for (const day of last7Days) {
    const count = commandsByDay[day] || 0;
    const barWidth = maxCommands > 0 ? Math.round((count / maxCommands) * maxBarWidth) : 0;
    const bar = "█".repeat(barWidth);

    console.log(
      `  ${chalk.dim(day.padEnd(10))} ${chalk.green(bar)} ${chalk.white(count)}`
    );
  }

  console.log();
}

/**
 * Calculate analytics summary
 */
function calculateAnalyticsSummary(stats: any, workflows: any[]): AnalyticsSummary {
  const totalCommands = stats.commands.length;
  const uniqueCLIs = Object.keys(stats.cliUsageCount).length;

  // Estimate time saved (avg 2 min per command without ChittyCan)
  const timeSaved = totalCommands * 2;

  // Calculate avg commands per day
  const firstCmd = stats.commands[0];
  const lastCmd = stats.commands[stats.commands.length - 1];
  const daysDiff = Math.max(1, Math.ceil(
    (new Date(lastCmd.timestamp).getTime() - new Date(firstCmd.timestamp).getTime()) / (1000 * 60 * 60 * 24)
  ));
  const avgCommandsPerDay = totalCommands / daysDiff;

  // Productivity score (0-100)
  const productivityScore = Math.min(100, Math.round(
    (uniqueCLIs * 10) + (avgCommandsPerDay * 5) + (workflows.length * 5)
  ));

  // Top CLI
  const topCLI = Object.entries(stats.cliUsageCount)
    .sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "N/A";

  // Growth rate
  const growthRate = calculateGrowthRate(stats);

  // Streak
  const streakDays = calculateStreak(stats.commands);

  // Expertise levels
  const expertiseLevels = calculateExpertiseLevels(stats);

  return {
    totalCommands,
    uniqueCLIs,
    timeSaved,
    avgCommandsPerDay,
    productivityScore,
    topCLI,
    growthRate,
    streakDays,
    expertiseLevels
  };
}

/**
 * Calculate expertise levels for each CLI
 */
function calculateExpertiseLevels(stats: any): Record<string, ExpertiseLevel> {
  const levels: Record<string, ExpertiseLevel> = {};

  for (const [cli, count] of Object.entries(stats.cliUsageCount) as [string, number][]) {
    const cliCommands = stats.commands.filter((c: any) => c.cli === cli);
    const uniquePatterns = new Set(cliCommands.map((c: any) => c.interpretedCommand)).size;
    const lastUsed = cliCommands[cliCommands.length - 1]?.timestamp || "";

    let level: ExpertiseLevel["level"];
    if (count >= 50 && uniquePatterns >= 15) level = "expert";
    else if (count >= 25 && uniquePatterns >= 10) level = "advanced";
    else if (count >= 10 && uniquePatterns >= 5) level = "intermediate";
    else level = "beginner";

    levels[cli] = {
      cli,
      level,
      commandCount: count,
      uniquePatterns,
      lastUsed
    };
  }

  return levels;
}

/**
 * Calculate growth rate (% change over last period)
 */
function calculateGrowthRate(stats: any): number {
  if (stats.commands.length < 20) return 0;

  const midpoint = Math.floor(stats.commands.length / 2);
  const firstHalf = stats.commands.slice(0, midpoint).length;
  const secondHalf = stats.commands.slice(midpoint).length;

  return ((secondHalf - firstHalf) / firstHalf) * 100;
}

/**
 * Calculate current streak in days
 */
function calculateStreak(commands: any[]): number {
  if (commands.length === 0) return 0;

  let streak = 1;
  let lastDate = new Date(commands[commands.length - 1].timestamp).toDateString();

  for (let i = commands.length - 2; i >= 0; i--) {
    const currentDate = new Date(commands[i].timestamp).toDateString();
    if (currentDate !== lastDate) {
      const dayDiff = Math.abs(
        (new Date(currentDate).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (dayDiff <= 1) {
        streak++;
        lastDate = currentDate;
      } else {
        break;
      }
    }
  }

  return streak;
}

/**
 * Analyze time patterns
 */
function analyzeTimePatterns(stats: any): TimePattern[] {
  const patterns: Record<number, TimePattern> = {};

  for (const cmd of stats.commands) {
    const hour = new Date(cmd.timestamp).getHours();

    if (!patterns[hour]) {
      patterns[hour] = { hour, commandCount: 0, topCLI: cmd.cli };
    }

    patterns[hour].commandCount++;
  }

  return Object.values(patterns);
}

/**
 * Generate productivity insights
 */
function generateInsights(summary: AnalyticsSummary, stats: any): ProductivityInsight[] {
  const insights: ProductivityInsight[] = [];

  // Achievement: First expert level
  const experts = Object.values(summary.expertiseLevels).filter(e => e.level === "expert");
  if (experts.length > 0) {
    insights.push({
      type: "achievement",
      title: `Expert in ${experts[0].cli}!`,
      message: `You've mastered ${experts[0].cli} with ${experts[0].commandCount} commands`,
      metric: "🏆 Achievement Unlocked"
    });
  }

  // Positive: High success rate
  const successRate = stats.commands.filter((c: any) => c.successful).length / stats.commands.length;
  if (successRate > 0.95) {
    insights.push({
      type: "positive",
      title: "Nearly Perfect!",
      message: `${(successRate * 100).toFixed(1)}% of your commands succeed on first try`,
      metric: "Keep up the great work!"
    });
  }

  // Suggestion: Diversify
  if (summary.uniqueCLIs < 3) {
    insights.push({
      type: "suggestion",
      title: "Try More Tools",
      message: "You're getting good at a few CLIs. Consider exploring more tools!",
      metric: `Current: ${summary.uniqueCLIs} CLIs`
    });
  }

  // Suggestion: Create workflows
  const workflowCount = stats.commands.length / 10;
  insights.push({
    type: "suggestion",
    title: "Automate Repetitive Tasks",
    message: "Run 'can chitty suggestions' to see workflow recommendations"
  });

  return insights;
}

/**
 * Get last 7 days as array
 */
function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return days;
}

/**
 * Group commands by day
 */
function groupCommandsByDay(commands: any[], days: string[]): Record<string, number> {
  const grouped: Record<string, number> = {};

  for (const cmd of commands) {
    const day = new Date(cmd.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    grouped[day] = (grouped[day] || 0) + 1;
  }

  return grouped;
}
