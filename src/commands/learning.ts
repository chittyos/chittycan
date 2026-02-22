/**
 * Learning Commands
 *
 * CLI commands for the intelligent learning system:
 * - propose: View and manage auto-generated proposals
 * - progress: View skill progression and learning paths
 * - synthesize: Force goal synthesis and pattern detection
 */

import chalk from "chalk";

// ============================================================================
// Propose Commands
// ============================================================================

/**
 * List all pending proposals
 */
export async function proposeListCommand(): Promise<void> {
  try {
    const { proposalGenerator } = await import("../lib/proposal-generator.js");
    const pending = proposalGenerator.getPendingProposals();

    if (pending.length === 0) {
      console.log(chalk.yellow("\n  No pending proposals."));
      console.log(chalk.gray("  Run more commands to generate proposals automatically.\n"));
      return;
    }

    console.log(chalk.bold("\n  📋 Pending Proposals\n"));

    for (const proposal of pending) {
      const typeIcon = {
        skill: "🎯",
        plugin: "🔌",
        agent: "🤖",
        worker: "⚡",
        command: "📝"
      }[proposal.type] || "📦";

      // Get description (agents use 'role' instead of 'description')
      const description = "description" in proposal
        ? proposal.description
        : ("role" in proposal ? proposal.role : "No description");

      console.log(`  ${typeIcon} ${chalk.cyan(proposal.name)} ${chalk.gray(`(${proposal.type})`)}`);
      console.log(`     ${description}`);
      console.log(`     ${chalk.green(`${(proposal.confidence * 100).toFixed(0)}% confidence`)} • ID: ${chalk.gray(proposal.id.slice(0, 20))}`);
      console.log();
    }

    console.log(chalk.gray(`  Use ${chalk.cyan("can propose accept <id>")} to accept a proposal`));
    console.log(chalk.gray(`  Use ${chalk.cyan("can propose preview <id>")} to see details\n`));
  } catch (error) {
    console.error(chalk.red("Failed to list proposals:"), error);
  }
}

/**
 * Generate new proposals
 */
export async function proposeGenerateCommand(): Promise<void> {
  try {
    console.log(chalk.gray("\n  Analyzing patterns and generating proposals...\n"));

    const { proposalGenerator } = await import("../lib/proposal-generator.js");
    const proposals = await proposalGenerator.generateProposals();

    const total = proposals.skills.length + proposals.plugins.length +
      proposals.agents.length + proposals.workers.length + proposals.commands.length;

    if (total === 0) {
      console.log(chalk.yellow("  No new proposals generated."));
      console.log(chalk.gray("  Run more commands to build up patterns.\n"));
      return;
    }

    console.log(chalk.green(`  ✓ Generated ${total} proposal(s):\n`));

    if (proposals.skills.length > 0) {
      console.log(`    🎯 ${proposals.skills.length} skill(s)`);
    }
    if (proposals.plugins.length > 0) {
      console.log(`    🔌 ${proposals.plugins.length} plugin(s)`);
    }
    if (proposals.agents.length > 0) {
      console.log(`    🤖 ${proposals.agents.length} agent(s)`);
    }
    if (proposals.workers.length > 0) {
      console.log(`    ⚡ ${proposals.workers.length} worker(s)`);
    }
    if (proposals.commands.length > 0) {
      console.log(`    📝 ${proposals.commands.length} command(s)`);
    }

    console.log();
    console.log(chalk.gray(`  Use ${chalk.cyan("can propose list")} to view proposals\n`));
  } catch (error) {
    console.error(chalk.red("Failed to generate proposals:"), error);
  }
}

/**
 * Preview a proposal
 */
export async function proposePreviewCommand(id: string): Promise<void> {
  try {
    const { proposalGenerator } = await import("../lib/proposal-generator.js");
    const proposal = proposalGenerator.getProposal(id);

    if (!proposal) {
      console.log(chalk.red(`\n  Proposal not found: ${id}\n`));
      return;
    }

    console.log(chalk.bold(`\n  📋 Proposal: ${proposal.name}\n`));
    console.log(`  Type: ${proposal.type}`);
    console.log(`  Status: ${proposal.status}`);
    console.log(`  Confidence: ${(proposal.confidence * 100).toFixed(0)}%`);
    console.log(`  Created: ${proposal.createdAt}`);
    console.log();

    // Get description (agents use 'role' instead of 'description')
    const description = "description" in proposal
      ? proposal.description
      : ("role" in proposal ? proposal.role : "No description");

    console.log(chalk.bold("  Description:"));
    console.log(`  ${description}`);
    console.log();

    console.log(chalk.bold("  Source Patterns:"));
    for (const pattern of proposal.sourcePatterns.slice(0, 5)) {
      console.log(`    • ${pattern}`);
    }
    if (proposal.sourcePatterns.length > 5) {
      console.log(chalk.gray(`    ... and ${proposal.sourcePatterns.length - 5} more`));
    }
    console.log();

    if ("implementation" in proposal && proposal.implementation) {
      console.log(chalk.bold("  Implementation Preview:"));
      console.log(chalk.gray("  ─".repeat(30)));
      const preview = proposal.implementation.split("\n").slice(0, 10).join("\n");
      console.log(chalk.gray(preview.split("\n").map(l => `  ${l}`).join("\n")));
      console.log(chalk.gray("  ─".repeat(30)));
    }

    console.log();
    console.log(chalk.gray(`  Use ${chalk.cyan(`can propose accept ${id}`)} to accept this proposal`));
    console.log(chalk.gray(`  Use ${chalk.cyan(`can propose reject ${id}`)} to reject this proposal\n`));
  } catch (error) {
    console.error(chalk.red("Failed to preview proposal:"), error);
  }
}

/**
 * Accept a proposal and generate the artifact
 */
export async function proposeAcceptCommand(id: string): Promise<void> {
  try {
    const { proposalGenerator } = await import("../lib/proposal-generator.js");
    const { skillGenerator } = await import("../lib/skill-generator.js");

    const proposal = proposalGenerator.acceptProposal(id);

    if (!proposal) {
      console.log(chalk.red(`\n  Proposal not found: ${id}\n`));
      return;
    }

    console.log(chalk.gray(`\n  Generating ${proposal.type}...`));

    const result = await skillGenerator.generateFromProposal(proposal);

    if (result.success && result.skill) {
      console.log(chalk.green(`\n  ✓ Generated: ${result.skill.name}`));
      console.log(chalk.gray(`    Path: ${result.path}`));
      console.log();
    } else {
      console.log(chalk.red(`\n  ✗ Failed to generate: ${result.error}\n`));
    }
  } catch (error) {
    console.error(chalk.red("Failed to accept proposal:"), error);
  }
}

/**
 * Reject a proposal
 */
export async function proposeRejectCommand(id: string): Promise<void> {
  try {
    const { proposalGenerator } = await import("../lib/proposal-generator.js");
    const proposal = proposalGenerator.rejectProposal(id);

    if (!proposal) {
      console.log(chalk.red(`\n  Proposal not found: ${id}\n`));
      return;
    }

    console.log(chalk.green(`\n  ✓ Rejected proposal: ${proposal.name}\n`));
  } catch (error) {
    console.error(chalk.red("Failed to reject proposal:"), error);
  }
}

// ============================================================================
// Progress Commands
// ============================================================================

/**
 * Show overall learning progress dashboard
 */
export async function progressCommand(cli?: string): Promise<void> {
  try {
    const { learningModel } = await import("../lib/learning-model.js");

    if (cli) {
      // Show specific CLI progress
      const path = learningModel.getLearningPath(cli);

      console.log(chalk.bold(`\n  📊 Learning Path: ${cli.toUpperCase()}\n`));

      const levelEmoji = ["🌱", "🌿", "🌲", "🌳", "🏆"][path.currentLevel - 1] || "🌱";
      console.log(`  Current Level: ${levelEmoji} ${getLevelName(path.currentLevel)}`);
      console.log(`  Next Milestone: ${path.nextMilestone}`);

      if (path.blockers.length > 0) {
        console.log();
        console.log(chalk.yellow("  Blockers:"));
        for (const blocker of path.blockers) {
          console.log(`    ⚠️  ${blocker}`);
        }
      }

      console.log();
      console.log(chalk.bold("  Suggested Exercises:"));
      for (const exercise of path.suggestedExercises) {
        console.log(`    • ${exercise}`);
      }

      console.log();
      console.log(chalk.gray(`  Estimated time to next level: ${path.estimatedTimeToNextLevel}\n`));
      return;
    }

    // Show overall dashboard
    const dashboard = learningModel.getDashboard();

    console.log(chalk.bold("\n  🎓 Learning Progress Dashboard\n"));

    // Profile summary
    console.log(`  Total XP: ${chalk.cyan(dashboard.profile.totalXP.toLocaleString())} • Level ${chalk.cyan(dashboard.profile.overallLevel)}`);
    console.log(`  Streak: ${dashboard.streakStatus.current} days ${dashboard.streakStatus.message}`);
    console.log();

    // Top skills
    if (dashboard.topSkills.length > 0) {
      console.log(chalk.bold("  Top Skills:"));
      for (const skill of dashboard.topSkills) {
        const bar = createProgressBar(skill.progressToNextLevel, 20);
        const levelEmoji = ["🌱", "🌿", "🌲", "🌳", "🏆"][skill.level - 1] || "🌱";
        console.log(`    ${levelEmoji} ${skill.cli.padEnd(12)} ${skill.levelName.padEnd(12)} ${bar} ${skill.successRate}%`);
      }
      console.log();
    }

    // Next milestones
    if (dashboard.nextMilestones.length > 0) {
      console.log(chalk.bold("  Next Milestones:"));
      for (const milestone of dashboard.nextMilestones) {
        console.log(`    🎯 ${milestone.cli}: ${milestone.milestone} (${milestone.progress}%)`);
      }
      console.log();
    }

    // Recent achievements
    if (dashboard.recentAchievements.length > 0) {
      console.log(chalk.bold("  Recent Achievements:"));
      for (const achievement of dashboard.recentAchievements) {
        console.log(`    ${achievement.icon} ${achievement.name} - ${achievement.description}`);
      }
      console.log();
    }

    console.log(chalk.gray(`  Use ${chalk.cyan("can progress <cli>")} to see detailed progress for a specific CLI\n`));
  } catch (error) {
    console.error(chalk.red("Failed to show progress:"), error);
  }
}

/**
 * Show skill gaps and recommendations
 */
export async function progressAnalyzeCommand(): Promise<void> {
  try {
    const { learningModel } = await import("../lib/learning-model.js");
    const analysis = await learningModel.analyzeSkillGaps();

    console.log(chalk.bold("\n  🔍 Skill Analysis\n"));

    if (analysis.strengths.length > 0) {
      console.log(chalk.green("  Strengths:"));
      for (const strength of analysis.strengths) {
        console.log(`    ✓ ${strength.cli}: ${strength.reason}`);
      }
      console.log();
    }

    if (analysis.weaknesses.length > 0) {
      console.log(chalk.yellow("  Areas for Improvement:"));
      for (const weakness of analysis.weaknesses) {
        console.log(`    ⚠️  ${weakness.cli}: ${weakness.reason}`);
        console.log(chalk.gray(`       Suggestion: ${weakness.suggestion}`));
      }
      console.log();
    }

    console.log(chalk.bold("  Recommendations:"));
    for (const rec of analysis.recommendations) {
      console.log(`    💡 ${rec}`);
    }
    console.log();
  } catch (error) {
    console.error(chalk.red("Failed to analyze skills:"), error);
  }
}

// ============================================================================
// Synthesize Commands
// ============================================================================

/**
 * Run goal synthesis
 */
export async function synthesizeCommand(): Promise<void> {
  try {
    console.log(chalk.gray("\n  Running synthesis...\n"));

    const { learningPipeline } = await import("../lib/learning-pipeline.js");
    const result = await learningPipeline.synthesize();

    console.log(chalk.bold("  🧬 Synthesis Results\n"));

    if (result.mergedGoals.length > 0) {
      console.log(chalk.green(`  Merged ${result.mergedGoals.length} goal cluster(s)`));
    }

    if (result.crossPatterns.length > 0) {
      console.log(chalk.cyan(`  Found ${result.crossPatterns.length} cross-goal pattern(s)`));
    }

    if (result.staleDormantGoals.length > 0) {
      console.log(chalk.yellow(`  Archived ${result.staleDormantGoals.length} stale goal(s)`));
    }

    if (result.mergedGoals.length === 0 && result.crossPatterns.length === 0 && result.staleDormantGoals.length === 0) {
      console.log(chalk.gray("  No changes needed - goals are already optimized"));
    }

    console.log();
  } catch (error) {
    console.error(chalk.red("Failed to run synthesis:"), error);
  }
}

/**
 * Show goal clusters and overlaps
 */
export async function synthesizeAnalyzeCommand(): Promise<void> {
  try {
    const { goalSynthesizer } = await import("../lib/goal-synthesizer.js");

    console.log(chalk.gray("\n  Analyzing goal overlaps...\n"));

    const clusters = await goalSynthesizer.analyzeOverlap();

    if (clusters.length === 0) {
      console.log(chalk.gray("  No overlapping goals found.\n"));
      return;
    }

    console.log(chalk.bold(`  📊 Found ${clusters.length} Goal Cluster(s)\n`));

    for (const cluster of clusters) {
      const recIcon = {
        merge: "🔗",
        link: "↔️",
        keep_separate: "📌"
      }[cluster.mergeRecommendation];

      console.log(`  ${recIcon} ${chalk.cyan(cluster.masterGoal.concept)}`);
      console.log(`     Similarity: ${(cluster.similarity * 100).toFixed(0)}%`);
      console.log(`     Recommendation: ${cluster.mergeRecommendation}`);
      console.log(`     Reason: ${cluster.reason}`);
      console.log(`     Related goals:`);
      for (const related of cluster.relatedGoals) {
        console.log(`       • ${related.concept}`);
      }
      console.log();
    }
  } catch (error) {
    console.error(chalk.red("Failed to analyze goals:"), error);
  }
}

/**
 * Show cross-goal patterns
 */
export async function synthesizePatternsCommand(): Promise<void> {
  try {
    const { goalSynthesizer } = await import("../lib/goal-synthesizer.js");

    console.log(chalk.gray("\n  Finding cross-goal patterns...\n"));

    const patterns = await goalSynthesizer.findCrossPatterns();

    if (patterns.length === 0) {
      console.log(chalk.gray("  No cross-goal patterns found yet.\n"));
      return;
    }

    console.log(chalk.bold(`  🔍 ${patterns.length} Cross-Goal Pattern(s)\n`));

    for (const pattern of patterns.slice(0, 10)) {
      console.log(`  📎 "${chalk.cyan(pattern.pattern)}" (appears in ${pattern.frequency} goals)`);
      console.log(chalk.gray(`     ${pattern.description}`));
      console.log();
    }
  } catch (error) {
    console.error(chalk.red("Failed to find patterns:"), error);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getLevelName(level: number): string {
  const names = ["Novice", "Beginner", "Intermediate", "Advanced", "Expert"];
  return names[level - 1] || "Unknown";
}

function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}
