/**
 * Goal Synthesizer - Intelligent Goal Merging and Analysis
 *
 * Analyzes learning goals to:
 * - Find overlapping/similar goals
 * - Merge redundant goals into unified ones
 * - Detect cross-goal patterns
 * - Archive stale/dormant goals
 * - Prioritize active goals
 *
 * This creates a more focused and efficient learning system.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface LearningGoal {
  id: string;
  concept: string;
  relatedCLI: string | null;
  createdAt: string;
  lastReflectedAt: string;
  reflectionCount: number;
  insights: string[];
  currentFocus: string;
  status: "active" | "mastered" | "dormant";
}

export interface GoalCluster {
  masterGoal: LearningGoal;
  relatedGoals: LearningGoal[];
  similarity: number;
  mergeRecommendation: "merge" | "link" | "keep_separate";
  reason: string;
}

export interface CrossPattern {
  goalIds: string[];
  goals: string[];
  pattern: string;
  frequency: number;
  description: string;
}

export interface MergeResult {
  id: string;
  concept: string;
  relatedCLI: string | null;
  insights: string[];
  sourceGoals: string[];
}

// ============================================================================
// Constants
// ============================================================================

const GOALS_FILE = join(homedir(), ".chittycan", "learning-goals.json");
const SYNTHESIS_LOG = join(homedir(), ".chittycan", "pipeline", "synthesis.jsonl");

// Similarity thresholds
const MERGE_THRESHOLD = 0.7;      // Goals > 70% similar should be merged
const LINK_THRESHOLD = 0.4;       // Goals 40-70% similar should be linked
const STALE_DAYS = 30;            // Goals inactive for 30+ days become dormant

// ============================================================================
// Goal Synthesizer Class
// ============================================================================

export class GoalSynthesizer {
  private static instance: GoalSynthesizer;

  private constructor() {}

  static getInstance(): GoalSynthesizer {
    if (!GoalSynthesizer.instance) {
      GoalSynthesizer.instance = new GoalSynthesizer();
    }
    return GoalSynthesizer.instance;
  }

  /**
   * Analyze all goals for overlapping concepts
   */
  async analyzeOverlap(): Promise<GoalCluster[]> {
    const goals = this.loadGoals();
    const activeGoals = goals.filter(g => g.status === "active");
    const clusters: GoalCluster[] = [];
    const clustered = new Set<string>();

    for (const goal of activeGoals) {
      if (clustered.has(goal.id)) continue;

      const related: LearningGoal[] = [];
      let maxSimilarity = 0;

      for (const other of activeGoals) {
        if (goal.id === other.id || clustered.has(other.id)) continue;

        const similarity = this.calculateSimilarity(goal, other);
        if (similarity >= LINK_THRESHOLD) {
          related.push(other);
          clustered.add(other.id);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
      }

      if (related.length > 0) {
        clustered.add(goal.id);

        const recommendation = maxSimilarity >= MERGE_THRESHOLD
          ? "merge"
          : maxSimilarity >= LINK_THRESHOLD
            ? "link"
            : "keep_separate";

        clusters.push({
          masterGoal: goal,
          relatedGoals: related,
          similarity: maxSimilarity,
          mergeRecommendation: recommendation,
          reason: this.explainSimilarity(goal, related[0], maxSimilarity)
        });
      }
    }

    return clusters;
  }

  /**
   * Merge multiple goals into a unified goal
   */
  async mergeGoals(goalIds: string[]): Promise<MergeResult> {
    const goals = this.loadGoals();
    const toMerge = goals.filter(g => goalIds.includes(g.id));

    if (toMerge.length === 0) {
      throw new Error("No goals found to merge");
    }

    // Determine the master goal (most insights or most recent)
    const master = toMerge.reduce((best, curr) =>
      curr.reflectionCount > best.reflectionCount ? curr : best
    );

    // Combine all insights (deduplicated)
    const allInsights = new Set<string>();
    for (const goal of toMerge) {
      for (const insight of goal.insights) {
        allInsights.add(insight);
      }
    }

    // Combine concepts
    const concepts = toMerge.map(g => g.concept);
    const unifiedConcept = this.synthesizeConcept(concepts);

    // Combine CLIs
    const clis = toMerge
      .filter(g => g.relatedCLI)
      .map(g => g.relatedCLI!);
    const unifiedCLI = clis.length > 0 ? clis[0] : null;

    // Create merged result
    const result: MergeResult = {
      id: master.id,
      concept: unifiedConcept,
      relatedCLI: unifiedCLI,
      insights: Array.from(allInsights),
      sourceGoals: goalIds
    };

    // Update the master goal and remove others
    await this.applyMerge(master.id, result, goalIds);

    // Log the synthesis
    this.logSynthesis("merge", { goalIds, result });

    return result;
  }

  /**
   * Find patterns that span multiple goals
   */
  async findCrossPatterns(): Promise<CrossPattern[]> {
    const goals = this.loadGoals();
    const activeGoals = goals.filter(g => g.status === "active");
    const patterns: CrossPattern[] = [];

    // Analyze insight overlap
    const insightGoals: Record<string, string[]> = {};

    for (const goal of activeGoals) {
      for (const insight of goal.insights) {
        // Extract keywords from insight
        const keywords = this.extractKeywords(insight);
        for (const keyword of keywords) {
          if (!insightGoals[keyword]) {
            insightGoals[keyword] = [];
          }
          if (!insightGoals[keyword].includes(goal.id)) {
            insightGoals[keyword].push(goal.id);
          }
        }
      }
    }

    // Find keywords that appear across multiple goals
    for (const [keyword, goalIds] of Object.entries(insightGoals)) {
      if (goalIds.length >= 2) {
        const goalConcepts = goalIds.map(id => {
          const goal = activeGoals.find(g => g.id === id);
          return goal?.concept || "unknown";
        });

        patterns.push({
          goalIds,
          goals: goalConcepts,
          pattern: keyword,
          frequency: goalIds.length,
          description: `Pattern "${keyword}" appears in ${goalIds.length} goals: ${goalConcepts.join(", ")}`
        });
      }
    }

    // Sort by frequency
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Prioritize goals based on activity and relevance
   */
  async prioritizeGoals(): Promise<LearningGoal[]> {
    const goals = this.loadGoals();
    const activeGoals = goals.filter(g => g.status === "active");

    // Score each goal
    const scored = activeGoals.map(goal => {
      let score = 0;

      // Recency boost
      const daysSinceReflection = this.daysSince(goal.lastReflectedAt);
      score += Math.max(0, 30 - daysSinceReflection); // More recent = higher score

      // Reflection count boost
      score += Math.min(goal.reflectionCount * 2, 20);

      // Insight richness boost
      score += goal.insights.length;

      // CLI relevance boost (goals with CLI are more actionable)
      if (goal.relatedCLI) score += 5;

      return { goal, score };
    });

    // Sort by score descending
    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.goal);
  }

  /**
   * Archive stale goals as dormant
   */
  async archiveStaleGoals(): Promise<string[]> {
    const goals = this.loadGoals();
    const archived: string[] = [];

    for (const goal of goals) {
      if (goal.status !== "active") continue;

      const daysSinceReflection = this.daysSince(goal.lastReflectedAt);

      if (daysSinceReflection > STALE_DAYS) {
        goal.status = "dormant";
        archived.push(goal.id);
      }
    }

    if (archived.length > 0) {
      this.saveGoals(goals);
      this.logSynthesis("archive", { archivedIds: archived });
    }

    return archived;
  }

  /**
   * Reactivate a dormant goal
   */
  async reactivateGoal(goalId: string): Promise<boolean> {
    const goals = this.loadGoals();
    const goal = goals.find(g => g.id === goalId);

    if (!goal || goal.status !== "dormant") {
      return false;
    }

    goal.status = "active";
    goal.lastReflectedAt = new Date().toISOString();
    this.saveGoals(goals);

    this.logSynthesis("reactivate", { goalId });

    return true;
  }

  /**
   * Get synthesis statistics
   */
  getStats(): {
    total: number;
    active: number;
    mastered: number;
    dormant: number;
    avgInsights: number;
  } {
    const goals = this.loadGoals();

    const active = goals.filter(g => g.status === "active").length;
    const mastered = goals.filter(g => g.status === "mastered").length;
    const dormant = goals.filter(g => g.status === "dormant").length;
    const totalInsights = goals.reduce((sum, g) => sum + g.insights.length, 0);

    return {
      total: goals.length,
      active,
      mastered,
      dormant,
      avgInsights: goals.length > 0 ? totalInsights / goals.length : 0
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private loadGoals(): LearningGoal[] {
    if (!existsSync(GOALS_FILE)) {
      return [];
    }

    try {
      return JSON.parse(readFileSync(GOALS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveGoals(goals: LearningGoal[]): void {
    writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2));
  }

  private calculateSimilarity(goal1: LearningGoal, goal2: LearningGoal): number {
    let similarity = 0;

    // Concept similarity (word overlap)
    const words1 = this.extractWords(goal1.concept);
    const words2 = this.extractWords(goal2.concept);
    const conceptSim = this.jaccardSimilarity(words1, words2);
    similarity += conceptSim * 0.4;

    // CLI similarity
    if (goal1.relatedCLI && goal2.relatedCLI && goal1.relatedCLI === goal2.relatedCLI) {
      similarity += 0.3;
    }

    // Insight overlap
    const insight1 = goal1.insights.join(" ").toLowerCase();
    const insight2 = goal2.insights.join(" ").toLowerCase();
    const insightWords1 = this.extractWords(insight1);
    const insightWords2 = this.extractWords(insight2);
    const insightSim = this.jaccardSimilarity(insightWords1, insightWords2);
    similarity += insightSim * 0.3;

    return similarity;
  }

  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  private extractWords(text: string): Set<string> {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will", "would",
      "could", "should", "may", "might", "must", "about", "started", "learning"
    ]);

    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ""))
        .filter(w => w.length > 2 && !stopWords.has(w))
    );
  }

  private extractKeywords(text: string): string[] {
    const words = this.extractWords(text);
    return Array.from(words).slice(0, 5);
  }

  private explainSimilarity(goal1: LearningGoal, goal2: LearningGoal, similarity: number): string {
    const reasons: string[] = [];

    if (goal1.relatedCLI === goal2.relatedCLI && goal1.relatedCLI) {
      reasons.push(`both relate to ${goal1.relatedCLI} CLI`);
    }

    const sharedWords = [...this.extractWords(goal1.concept)]
      .filter(w => this.extractWords(goal2.concept).has(w));

    if (sharedWords.length > 0) {
      reasons.push(`shared concepts: ${sharedWords.slice(0, 3).join(", ")}`);
    }

    if (reasons.length === 0) {
      reasons.push(`${(similarity * 100).toFixed(0)}% content overlap`);
    }

    return reasons.join("; ");
  }

  private synthesizeConcept(concepts: string[]): string {
    // Extract common words and create unified concept
    const wordCounts: Record<string, number> = {};

    for (const concept of concepts) {
      const words = this.extractWords(concept);
      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    // Get most common words
    const commonWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word]) => word);

    if (commonWords.length === 0) {
      return concepts[0]; // Fallback to first concept
    }

    return commonWords.join(" + ");
  }

  private async applyMerge(masterId: string, result: MergeResult, allIds: string[]): Promise<void> {
    const goals = this.loadGoals();

    // Update master goal
    const master = goals.find(g => g.id === masterId);
    if (master) {
      master.concept = result.concept;
      master.insights = result.insights;
      master.relatedCLI = result.relatedCLI;
      master.lastReflectedAt = new Date().toISOString();
    }

    // Remove merged goals (keep only master)
    const otherIds = allIds.filter(id => id !== masterId);
    const filtered = goals.filter(g => !otherIds.includes(g.id));

    this.saveGoals(filtered);
  }

  private daysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private logSynthesis(action: string, data: any): void {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      ...data
    };

    try {
      const { appendFileSync, mkdirSync } = require("fs");
      const { dirname } = require("path");

      const dir = dirname(SYNTHESIS_LOG);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      appendFileSync(SYNTHESIS_LOG, JSON.stringify(entry) + "\n");
    } catch {
      // Silent fail
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const goalSynthesizer = GoalSynthesizer.getInstance();
