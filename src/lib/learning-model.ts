/**
 * Learning Model - Standardized Progression System
 *
 * Provides a formalized learning progression model with:
 * - Skill levels (Novice → Expert)
 * - Clear advancement criteria
 * - Learning paths per CLI/domain
 * - Progress tracking and visualization
 *
 * This creates a gamified experience that motivates continued learning.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Types
// ============================================================================

export enum SkillLevel {
  NOVICE = 1,       // < 10 commands, < 50% success
  BEGINNER = 2,     // 10-50 commands, 50-70% success
  INTERMEDIATE = 3, // 50-200 commands, 70-85% success
  ADVANCED = 4,     // 200-500 commands, 85-95% success
  EXPERT = 5        // 500+ commands, 95%+ success
}

export interface SkillProgress {
  cli: string;
  level: SkillLevel;
  levelName: string;
  commandCount: number;
  successRate: number;
  nextLevelRequirements: LevelRequirement | null;
  progressToNextLevel: number; // 0-100%
  strengths: string[];
  weaknesses: string[];
  lastActivity: string;
  streak: number; // Days of consecutive use
}

export interface LevelRequirement {
  level: SkillLevel;
  levelName: string;
  minCommands: number;
  minSuccessRate: number;
  requiredPatterns?: string[];
  description: string;
}

export interface LearningPath {
  cli: string;
  currentLevel: SkillLevel;
  nextMilestone: string;
  suggestedExercises: string[];
  blockers: string[]; // Skills gaps preventing advancement
  recentProgress: ProgressEvent[];
  estimatedTimeToNextLevel: string;
}

export interface ProgressEvent {
  timestamp: string;
  type: "command" | "success" | "failure" | "level_up" | "streak";
  description: string;
  xpGained: number;
}

export interface UserProfile {
  userId: string;
  totalXP: number;
  overallLevel: number;
  skills: Record<string, SkillProgress>;
  achievements: Achievement[];
  learningStreak: number;
  longestStreak: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string;
  category: "milestone" | "streak" | "mastery" | "exploration" | "special";
}

export interface CLIStats {
  cli: string;
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  patterns: PatternStat[];
  commonErrors: ErrorStat[];
  firstUsed: string;
  lastUsed: string;
}

export interface PatternStat {
  pattern: string;
  count: number;
  successRate: number;
}

export interface ErrorStat {
  error: string;
  count: number;
  lastOccurred: string;
  resolved: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PROFILE_FILE = join(homedir(), ".chittycan", "profile.json");
const STATS_DIR = join(homedir(), ".chittycan", "stats");
const PROGRESS_LOG = join(homedir(), ".chittycan", "pipeline", "progress.jsonl");

// Level requirements
const LEVEL_REQUIREMENTS: LevelRequirement[] = [
  {
    level: SkillLevel.NOVICE,
    levelName: "Novice",
    minCommands: 0,
    minSuccessRate: 0,
    description: "Just starting out - every command is a learning opportunity"
  },
  {
    level: SkillLevel.BEGINNER,
    levelName: "Beginner",
    minCommands: 10,
    minSuccessRate: 50,
    description: "Getting comfortable with basic commands"
  },
  {
    level: SkillLevel.INTERMEDIATE,
    levelName: "Intermediate",
    minCommands: 50,
    minSuccessRate: 70,
    description: "Solid understanding of common workflows"
  },
  {
    level: SkillLevel.ADVANCED,
    levelName: "Advanced",
    minCommands: 200,
    minSuccessRate: 85,
    description: "Deep knowledge and efficient problem-solving"
  },
  {
    level: SkillLevel.EXPERT,
    levelName: "Expert",
    minCommands: 500,
    minSuccessRate: 95,
    description: "Mastery achieved - teaching others and innovating"
  }
];

// XP rewards
const XP_REWARDS = {
  command: 5,
  success: 10,
  failure: 2,
  newPattern: 25,
  levelUp: 100,
  streak3: 50,
  streak7: 150,
  streak30: 500,
  firstCommand: 20,
  firstSuccess: 30,
  achievement: 50
};

// Achievements definitions
const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, "unlockedAt">[] = [
  // Milestones
  { id: "first_command", name: "First Steps", description: "Execute your first command", icon: "🎯", category: "milestone" },
  { id: "10_commands", name: "Getting Started", description: "Execute 10 commands", icon: "📊", category: "milestone" },
  { id: "100_commands", name: "Centurion", description: "Execute 100 commands", icon: "💯", category: "milestone" },
  { id: "1000_commands", name: "Commander", description: "Execute 1000 commands", icon: "🏆", category: "milestone" },

  // Streaks
  { id: "streak_3", name: "Consistent", description: "Use ChittyCan 3 days in a row", icon: "🔥", category: "streak" },
  { id: "streak_7", name: "Weekly Warrior", description: "Use ChittyCan 7 days in a row", icon: "⚡", category: "streak" },
  { id: "streak_30", name: "Monthly Master", description: "Use ChittyCan 30 days in a row", icon: "🌟", category: "streak" },

  // Mastery
  { id: "first_expert", name: "First Mastery", description: "Reach Expert level in any CLI", icon: "👑", category: "mastery" },
  { id: "multi_expert", name: "Polyglot", description: "Reach Expert level in 3+ CLIs", icon: "🎭", category: "mastery" },
  { id: "full_expert", name: "Grand Master", description: "Reach Expert level in 5+ CLIs", icon: "🏅", category: "mastery" },

  // Exploration
  { id: "explorer_5", name: "Explorer", description: "Use 5 different CLIs", icon: "🗺️", category: "exploration" },
  { id: "explorer_10", name: "Adventurer", description: "Use 10 different CLIs", icon: "🧭", category: "exploration" },

  // Special
  { id: "night_owl", name: "Night Owl", description: "Execute commands after midnight", icon: "🦉", category: "special" },
  { id: "early_bird", name: "Early Bird", description: "Execute commands before 6 AM", icon: "🐦", category: "special" },
  { id: "perfect_day", name: "Perfect Day", description: "100% success rate with 10+ commands in a day", icon: "✨", category: "special" }
];

// ============================================================================
// Learning Model Class
// ============================================================================

export class LearningModel {
  private static instance: LearningModel;
  private profile: UserProfile | null = null;

  private constructor() {}

  static getInstance(): LearningModel {
    if (!LearningModel.instance) {
      LearningModel.instance = new LearningModel();
    }
    return LearningModel.instance;
  }

  /**
   * Get or create user profile
   */
  getProfile(): UserProfile {
    if (this.profile) return this.profile;

    if (existsSync(PROFILE_FILE)) {
      try {
        this.profile = JSON.parse(readFileSync(PROFILE_FILE, "utf-8"));
        return this.profile!;
      } catch {
        // Corrupted file, create new
      }
    }

    // Create new profile
    this.profile = {
      userId: `user-${Date.now()}`,
      totalXP: 0,
      overallLevel: 1,
      skills: {},
      achievements: [],
      learningStreak: 0,
      longestStreak: 0,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };

    this.saveProfile();
    return this.profile;
  }

  /**
   * Record a command execution
   */
  async recordCommand(cli: string, success: boolean, command: string): Promise<ProgressEvent[]> {
    const profile = this.getProfile();
    const events: ProgressEvent[] = [];
    const now = new Date().toISOString();

    // Initialize skill if needed
    if (!profile.skills[cli]) {
      profile.skills[cli] = {
        cli,
        level: SkillLevel.NOVICE,
        levelName: "Novice",
        commandCount: 0,
        successRate: 100,
        nextLevelRequirements: LEVEL_REQUIREMENTS[1],
        progressToNextLevel: 0,
        strengths: [],
        weaknesses: [],
        lastActivity: now,
        streak: 0
      };

      // First command for this CLI
      events.push({
        timestamp: now,
        type: "command",
        description: `First ${cli} command`,
        xpGained: XP_REWARDS.firstCommand
      });
    }

    const skill = profile.skills[cli];

    // Update stats
    skill.commandCount++;
    skill.lastActivity = now;

    // Update success rate (rolling average)
    const totalSuccess = Math.round(skill.successRate * (skill.commandCount - 1) / 100);
    const newTotal = success ? totalSuccess + 1 : totalSuccess;
    skill.successRate = Math.round((newTotal / skill.commandCount) * 100);

    // Award XP
    const xpGained = success ? XP_REWARDS.success : XP_REWARDS.failure;
    profile.totalXP += xpGained;

    events.push({
      timestamp: now,
      type: success ? "success" : "failure",
      description: `${cli}: ${command.substring(0, 50)}${command.length > 50 ? "..." : ""}`,
      xpGained
    });

    // Check for level up
    const newLevel = this.calculateLevel(skill.commandCount, skill.successRate);
    if (newLevel > skill.level) {
      skill.level = newLevel;
      skill.levelName = LEVEL_REQUIREMENTS[newLevel - 1].levelName;
      profile.totalXP += XP_REWARDS.levelUp;

      events.push({
        timestamp: now,
        type: "level_up",
        description: `Leveled up to ${skill.levelName} in ${cli}!`,
        xpGained: XP_REWARDS.levelUp
      });
    }

    // Update next level requirements
    if (skill.level < SkillLevel.EXPERT) {
      skill.nextLevelRequirements = LEVEL_REQUIREMENTS[skill.level];
      skill.progressToNextLevel = this.calculateProgress(skill);
    } else {
      skill.nextLevelRequirements = null;
      skill.progressToNextLevel = 100;
    }

    // Update streak
    const lastActive = new Date(profile.lastActiveAt);
    const today = new Date();
    const daysSinceActive = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceActive === 1) {
      profile.learningStreak++;
      if (profile.learningStreak > profile.longestStreak) {
        profile.longestStreak = profile.learningStreak;
      }

      // Streak achievements
      if (profile.learningStreak === 3) {
        events.push({
          timestamp: now,
          type: "streak",
          description: "3-day streak!",
          xpGained: XP_REWARDS.streak3
        });
        profile.totalXP += XP_REWARDS.streak3;
      } else if (profile.learningStreak === 7) {
        events.push({
          timestamp: now,
          type: "streak",
          description: "7-day streak!",
          xpGained: XP_REWARDS.streak7
        });
        profile.totalXP += XP_REWARDS.streak7;
      } else if (profile.learningStreak === 30) {
        events.push({
          timestamp: now,
          type: "streak",
          description: "30-day streak!",
          xpGained: XP_REWARDS.streak30
        });
        profile.totalXP += XP_REWARDS.streak30;
      }
    } else if (daysSinceActive > 1) {
      profile.learningStreak = 1;
    }

    profile.lastActiveAt = now;

    // Update overall level based on total XP
    profile.overallLevel = this.calculateOverallLevel(profile.totalXP);

    // Check for achievements
    const newAchievements = this.checkAchievements(profile);
    for (const achievement of newAchievements) {
      profile.achievements.push({
        ...achievement,
        unlockedAt: now
      });
      profile.totalXP += XP_REWARDS.achievement;
    }

    this.saveProfile();
    this.logProgress(events);

    return events;
  }

  /**
   * Get skill progress for a specific CLI
   */
  getSkillProgress(cli: string): SkillProgress | null {
    const profile = this.getProfile();
    return profile.skills[cli] || null;
  }

  /**
   * Get all skill progress
   */
  getAllSkillProgress(): SkillProgress[] {
    const profile = this.getProfile();
    return Object.values(profile.skills).sort((a, b) => b.level - a.level || b.commandCount - a.commandCount);
  }

  /**
   * Get learning path for a CLI
   */
  getLearningPath(cli: string): LearningPath {
    const skill = this.getSkillProgress(cli);

    if (!skill) {
      return {
        cli,
        currentLevel: SkillLevel.NOVICE,
        nextMilestone: "Execute your first command",
        suggestedExercises: this.getSuggestedExercises(cli, SkillLevel.NOVICE),
        blockers: [],
        recentProgress: [],
        estimatedTimeToNextLevel: "Start learning!"
      };
    }

    const blockers: string[] = [];
    const nextReq = skill.nextLevelRequirements;

    if (nextReq) {
      if (skill.commandCount < nextReq.minCommands) {
        blockers.push(`Need ${nextReq.minCommands - skill.commandCount} more commands`);
      }
      if (skill.successRate < nextReq.minSuccessRate) {
        blockers.push(`Success rate needs to improve from ${skill.successRate}% to ${nextReq.minSuccessRate}%`);
      }
    }

    return {
      cli,
      currentLevel: skill.level,
      nextMilestone: nextReq?.description || "Mastery achieved!",
      suggestedExercises: this.getSuggestedExercises(cli, skill.level),
      blockers,
      recentProgress: this.getRecentProgress(cli),
      estimatedTimeToNextLevel: this.estimateTimeToNextLevel(skill)
    };
  }

  /**
   * Get dashboard summary
   */
  getDashboard(): {
    profile: UserProfile;
    topSkills: SkillProgress[];
    recentAchievements: Achievement[];
    streakStatus: { current: number; longest: number; message: string };
    nextMilestones: { cli: string; milestone: string; progress: number }[];
  } {
    const profile = this.getProfile();
    const skills = this.getAllSkillProgress();

    return {
      profile,
      topSkills: skills.slice(0, 5),
      recentAchievements: profile.achievements.slice(-5).reverse(),
      streakStatus: {
        current: profile.learningStreak,
        longest: profile.longestStreak,
        message: this.getStreakMessage(profile.learningStreak)
      },
      nextMilestones: skills
        .filter(s => s.level < SkillLevel.EXPERT)
        .slice(0, 3)
        .map(s => ({
          cli: s.cli,
          milestone: s.nextLevelRequirements?.levelName || "Expert",
          progress: s.progressToNextLevel
        }))
    };
  }

  /**
   * Analyze strengths and weaknesses
   */
  async analyzeSkillGaps(): Promise<{
    strengths: { cli: string; reason: string }[];
    weaknesses: { cli: string; reason: string; suggestion: string }[];
    recommendations: string[];
  }> {
    const skills = this.getAllSkillProgress();
    const strengths: { cli: string; reason: string }[] = [];
    const weaknesses: { cli: string; reason: string; suggestion: string }[] = [];
    const recommendations: string[] = [];

    for (const skill of skills) {
      if (skill.successRate >= 90 && skill.commandCount >= 50) {
        strengths.push({
          cli: skill.cli,
          reason: `${skill.successRate}% success rate with ${skill.commandCount} commands`
        });
      } else if (skill.successRate < 70 && skill.commandCount >= 10) {
        weaknesses.push({
          cli: skill.cli,
          reason: `Only ${skill.successRate}% success rate`,
          suggestion: `Practice basic ${skill.cli} commands to build confidence`
        });
      }
    }

    // Generate recommendations
    if (skills.length === 0) {
      recommendations.push("Start by running some commands to build your profile!");
    } else if (skills.every(s => s.level === SkillLevel.NOVICE)) {
      recommendations.push("Focus on mastering one CLI before expanding to others");
    } else if (weaknesses.length > strengths.length) {
      recommendations.push("Spend time practicing your weakest CLIs");
    } else {
      recommendations.push("Great progress! Try exploring new CLIs to expand your skills");
    }

    return { strengths, weaknesses, recommendations };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private calculateLevel(commandCount: number, successRate: number): SkillLevel {
    for (let i = LEVEL_REQUIREMENTS.length - 1; i >= 0; i--) {
      const req = LEVEL_REQUIREMENTS[i];
      if (commandCount >= req.minCommands && successRate >= req.minSuccessRate) {
        return req.level;
      }
    }
    return SkillLevel.NOVICE;
  }

  private calculateProgress(skill: SkillProgress): number {
    const nextReq = skill.nextLevelRequirements;
    if (!nextReq) return 100;

    const currentReq = LEVEL_REQUIREMENTS[skill.level - 1];

    // Progress based on commands (50% weight)
    const commandProgress = Math.min(100,
      ((skill.commandCount - currentReq.minCommands) /
        (nextReq.minCommands - currentReq.minCommands)) * 100
    );

    // Progress based on success rate (50% weight)
    const rateProgress = Math.min(100,
      ((skill.successRate - currentReq.minSuccessRate) /
        (nextReq.minSuccessRate - currentReq.minSuccessRate)) * 100
    );

    return Math.round((commandProgress + rateProgress) / 2);
  }

  private calculateOverallLevel(totalXP: number): number {
    // Simple level calculation: every 500 XP = 1 level
    return Math.floor(totalXP / 500) + 1;
  }

  private getSuggestedExercises(cli: string, level: SkillLevel): string[] {
    const exercises: Record<string, Record<SkillLevel, string[]>> = {
      gh: {
        [SkillLevel.NOVICE]: [
          "gh repo list - View your repositories",
          "gh pr list - List pull requests",
          "gh issue list - View issues"
        ],
        [SkillLevel.BEGINNER]: [
          "gh pr create - Create a pull request",
          "gh repo clone - Clone a repository",
          "gh issue create - Create an issue"
        ],
        [SkillLevel.INTERMEDIATE]: [
          "gh workflow run - Trigger workflows",
          "gh release create - Create releases",
          "gh api - Make API calls"
        ],
        [SkillLevel.ADVANCED]: [
          "gh extension install - Add extensions",
          "gh alias set - Create aliases",
          "gh secret set - Manage secrets"
        ],
        [SkillLevel.EXPERT]: [
          "Contribute to gh cli",
          "Create custom gh extensions",
          "Automate complex workflows"
        ]
      },
      git: {
        [SkillLevel.NOVICE]: [
          "git status - Check repository state",
          "git log - View commit history",
          "git diff - See changes"
        ],
        [SkillLevel.BEGINNER]: [
          "git branch - Manage branches",
          "git merge - Merge branches",
          "git stash - Stash changes"
        ],
        [SkillLevel.INTERMEDIATE]: [
          "git rebase - Rebase branches",
          "git cherry-pick - Apply commits",
          "git bisect - Find bugs"
        ],
        [SkillLevel.ADVANCED]: [
          "git reflog - Recover lost commits",
          "git filter-branch - Rewrite history",
          "git worktree - Multiple working trees"
        ],
        [SkillLevel.EXPERT]: [
          "git internals (objects, refs)",
          "Custom git hooks",
          "Performance optimization"
        ]
      },
      docker: {
        [SkillLevel.NOVICE]: [
          "docker ps - List containers",
          "docker images - List images",
          "docker run - Run container"
        ],
        [SkillLevel.BEGINNER]: [
          "docker build - Build images",
          "docker-compose up - Start services",
          "docker logs - View logs"
        ],
        [SkillLevel.INTERMEDIATE]: [
          "docker network - Manage networks",
          "docker volume - Manage volumes",
          "Multi-stage builds"
        ],
        [SkillLevel.ADVANCED]: [
          "Docker Swarm orchestration",
          "Security scanning",
          "Resource constraints"
        ],
        [SkillLevel.EXPERT]: [
          "Custom base images",
          "CI/CD optimization",
          "Kubernetes integration"
        ]
      }
    };

    return exercises[cli]?.[level] || [
      `Explore ${cli} --help`,
      `Read ${cli} documentation`,
      `Practice common ${cli} workflows`
    ];
  }

  private getRecentProgress(cli: string): ProgressEvent[] {
    try {
      if (!existsSync(PROGRESS_LOG)) return [];

      const content = readFileSync(PROGRESS_LOG, "utf-8");
      const lines = content.trim().split("\n").slice(-100);

      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((e): e is ProgressEvent =>
          e && e.description && e.description.toLowerCase().includes(cli.toLowerCase())
        )
        .slice(-10);
    } catch {
      return [];
    }
  }

  private estimateTimeToNextLevel(skill: SkillProgress): string {
    if (!skill.nextLevelRequirements) return "Mastery achieved!";

    const commandsNeeded = skill.nextLevelRequirements.minCommands - skill.commandCount;
    if (commandsNeeded <= 0) {
      return "Improve success rate to level up";
    }

    // Assume average 5 commands per day
    const daysNeeded = Math.ceil(commandsNeeded / 5);

    if (daysNeeded <= 7) {
      return `About ${daysNeeded} days`;
    } else if (daysNeeded <= 30) {
      return `About ${Math.ceil(daysNeeded / 7)} weeks`;
    } else {
      return `About ${Math.ceil(daysNeeded / 30)} months`;
    }
  }

  private getStreakMessage(streak: number): string {
    if (streak === 0) return "Start your streak today!";
    if (streak < 3) return "Keep it going!";
    if (streak < 7) return "You're on fire! 🔥";
    if (streak < 30) return "Impressive dedication! ⚡";
    return "You're a legend! 🌟";
  }

  private checkAchievements(profile: UserProfile): Omit<Achievement, "unlockedAt">[] {
    const unlocked: Omit<Achievement, "unlockedAt">[] = [];
    const existingIds = new Set(profile.achievements.map(a => a.id));

    const skills = Object.values(profile.skills);
    const totalCommands = skills.reduce((sum, s) => sum + s.commandCount, 0);

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (existingIds.has(def.id)) continue;

      let earned = false;

      switch (def.id) {
        case "first_command":
          earned = totalCommands >= 1;
          break;
        case "10_commands":
          earned = totalCommands >= 10;
          break;
        case "100_commands":
          earned = totalCommands >= 100;
          break;
        case "1000_commands":
          earned = totalCommands >= 1000;
          break;
        case "streak_3":
          earned = profile.learningStreak >= 3;
          break;
        case "streak_7":
          earned = profile.learningStreak >= 7;
          break;
        case "streak_30":
          earned = profile.learningStreak >= 30;
          break;
        case "first_expert":
          earned = skills.some(s => s.level === SkillLevel.EXPERT);
          break;
        case "multi_expert":
          earned = skills.filter(s => s.level === SkillLevel.EXPERT).length >= 3;
          break;
        case "full_expert":
          earned = skills.filter(s => s.level === SkillLevel.EXPERT).length >= 5;
          break;
        case "explorer_5":
          earned = skills.length >= 5;
          break;
        case "explorer_10":
          earned = skills.length >= 10;
          break;
        case "night_owl":
          earned = new Date().getHours() >= 0 && new Date().getHours() < 5;
          break;
        case "early_bird":
          earned = new Date().getHours() >= 5 && new Date().getHours() < 6;
          break;
      }

      if (earned) {
        unlocked.push(def);
      }
    }

    return unlocked;
  }

  private saveProfile(): void {
    try {
      const dir = join(homedir(), ".chittycan");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(PROFILE_FILE, JSON.stringify(this.profile, null, 2));
    } catch {
      // Silent fail
    }
  }

  private logProgress(events: ProgressEvent[]): void {
    try {
      const dir = join(homedir(), ".chittycan", "pipeline");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const { appendFileSync } = require("fs");
      for (const event of events) {
        appendFileSync(PROGRESS_LOG, JSON.stringify(event) + "\n");
      }
    } catch {
      // Silent fail
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const learningModel = LearningModel.getInstance();
