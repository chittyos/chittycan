/**
 * Workflow Auto-Generation
 *
 * Detects repeated command sequences and automatically suggests
 * creating workflows from them.
 *
 * Example:
 *   You run: git add . → git commit → git push (3 times in a week)
 *   ChittyCan suggests: Create "deploy" workflow?
 */

import { loadUsageStats, type CommandUsage } from "./usage-tracker.js";
import { addWorkflow, type Workflow, type WorkflowStep } from "./custom-workflows.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface CommandSequence {
  commands: string[];
  frequency: number;
  lastSeen: string;
  avgTimeBetween: number; // milliseconds
  suggestedName?: string;
  suggestedTrigger?: string;
}

export interface WorkflowSuggestion {
  name: string;
  trigger: string;
  description: string;
  steps: WorkflowStep[];
  reason: string;
  frequency: number;
}

const SUGGESTIONS_FILE = join(homedir(), ".chittycan", "workflow-suggestions.json");
const MIN_FREQUENCY = 3; // Must see sequence at least 3 times
const MAX_SEQUENCE_LENGTH = 6; // Max commands in a sequence
const MAX_TIME_BETWEEN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Analyze usage and detect repeated command sequences
 */
export function detectRepeatedSequences(): CommandSequence[] {
  const stats = loadUsageStats();
  const commands = stats.commands.filter(c => c.successful);

  if (commands.length < 6) {
    return []; // Not enough data
  }

  const sequences: Map<string, CommandSequence> = new Map();

  // Sliding window to detect sequences
  for (let length = 2; length <= MAX_SEQUENCE_LENGTH; length++) {
    for (let i = 0; i <= commands.length - length; i++) {
      const sequence = commands.slice(i, i + length);

      // Check time between commands (must be close together)
      let valid = true;
      for (let j = 1; j < sequence.length; j++) {
        const timeDiff = new Date(sequence[j].timestamp).getTime() -
                        new Date(sequence[j - 1].timestamp).getTime();
        if (timeDiff > MAX_TIME_BETWEEN_MS) {
          valid = false;
          break;
        }
      }

      if (!valid) continue;

      // Create sequence key
      const key = sequence.map(c => `${c.cli}:${c.interpretedCommand}`).join(" → ");

      if (sequences.has(key)) {
        const existing = sequences.get(key)!;
        existing.frequency++;
        existing.lastSeen = sequence[sequence.length - 1].timestamp;
      } else {
        sequences.set(key, {
          commands: sequence.map(c => c.interpretedCommand),
          frequency: 1,
          lastSeen: sequence[sequence.length - 1].timestamp,
          avgTimeBetween: 0
        });
      }
    }
  }

  // Filter by minimum frequency
  return Array.from(sequences.values())
    .filter(seq => seq.frequency >= MIN_FREQUENCY)
    .sort((a, b) => b.frequency - a.frequency);
}

/**
 * Generate workflow suggestions from repeated sequences
 */
export function generateWorkflowSuggestions(): WorkflowSuggestion[] {
  const sequences = detectRepeatedSequences();
  const suggestions: WorkflowSuggestion[] = [];

  for (const seq of sequences) {
    const suggestion = sequenceToWorkflow(seq);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

/**
 * Convert a command sequence to a workflow suggestion
 */
function sequenceToWorkflow(seq: CommandSequence): WorkflowSuggestion | null {
  // Analyze the sequence to generate a good name
  const analysis = analyzeSequence(seq.commands);

  if (!analysis) return null;

  const steps: WorkflowStep[] = seq.commands.map(cmd => ({
    type: "command",
    value: cmd,
    description: cmd
  }));

  return {
    name: analysis.name,
    trigger: analysis.trigger,
    description: analysis.description,
    steps,
    reason: `You've run this sequence ${seq.frequency} times`,
    frequency: seq.frequency
  };
}

/**
 * Analyze sequence and suggest names/triggers
 */
function analyzeSequence(commands: string[]): {
  name: string;
  trigger: string;
  description: string;
} | null {
  const cmdStr = commands.join(" ");

  // Pattern 1: Git deployment flow
  if (cmdStr.includes("git add") && cmdStr.includes("git commit") && cmdStr.includes("git push")) {
    return {
      name: "Deploy Changes",
      trigger: "deploy",
      description: "Add, commit, and push changes to git"
    };
  }

  // Pattern 2: Docker rebuild
  if (cmdStr.includes("docker build") && cmdStr.includes("docker run")) {
    return {
      name: "Rebuild Docker",
      trigger: "rebuild docker",
      description: "Build and run Docker container"
    };
  }

  // Pattern 3: Test and deploy
  if (cmdStr.includes("test") && cmdStr.includes("deploy")) {
    return {
      name: "Test and Deploy",
      trigger: "test deploy",
      description: "Run tests then deploy if passing"
    };
  }

  // Pattern 4: Build and publish
  if (cmdStr.includes("build") && cmdStr.includes("publish")) {
    return {
      name: "Build and Publish",
      trigger: "publish",
      description: "Build and publish package"
    };
  }

  // Pattern 5: Database migration
  if (cmdStr.includes("migrate") || cmdStr.includes("db")) {
    return {
      name: "Run Migrations",
      trigger: "migrate",
      description: "Run database migrations"
    };
  }

  // Pattern 6: PR workflow
  if (cmdStr.includes("gh pr")) {
    return {
      name: "PR Workflow",
      trigger: "pr flow",
      description: "GitHub pull request operations"
    };
  }

  // Pattern 7: Kubernetes deployment
  if (cmdStr.includes("kubectl")) {
    return {
      name: "K8s Deploy",
      trigger: "k8s deploy",
      description: "Kubernetes deployment workflow"
    };
  }

  // Generic pattern
  const firstCmd = commands[0].split(" ")[0];
  return {
    name: `${firstCmd} Workflow`,
    trigger: `${firstCmd} flow`,
    description: `Automated ${firstCmd} sequence`
  };
}

/**
 * Save workflow suggestions to file
 */
export function saveSuggestions(suggestions: WorkflowSuggestion[]): void {
  writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
}

/**
 * Load saved workflow suggestions
 */
export function loadSuggestions(): WorkflowSuggestion[] {
  if (!existsSync(SUGGESTIONS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(SUGGESTIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Accept a workflow suggestion and create the workflow
 */
export function acceptSuggestion(suggestion: WorkflowSuggestion): void {
  const workflow: Workflow = {
    name: suggestion.name,
    trigger: suggestion.trigger,
    description: suggestion.description,
    steps: suggestion.steps,
    createdAt: new Date().toISOString(),
    usageCount: 0
  };

  addWorkflow(workflow);

  // Remove from suggestions
  const suggestions = loadSuggestions();
  const filtered = suggestions.filter(s => s.trigger !== suggestion.trigger);
  saveSuggestions(filtered);
}

/**
 * Dismiss a workflow suggestion
 */
export function dismissSuggestion(trigger: string): void {
  const suggestions = loadSuggestions();
  const filtered = suggestions.filter(s => s.trigger !== trigger);
  saveSuggestions(filtered);
}

/**
 * Check for new suggestions and notify user
 */
export function checkForNewSuggestions(): WorkflowSuggestion[] {
  const newSuggestions = generateWorkflowSuggestions();
  const existingSuggestions = loadSuggestions();

  // Filter out already suggested
  const existingTriggers = new Set(existingSuggestions.map(s => s.trigger));
  const fresh = newSuggestions.filter(s => !existingTriggers.has(s.trigger));

  if (fresh.length > 0) {
    // Merge and save
    const merged = [...existingSuggestions, ...fresh];
    saveSuggestions(merged);
  }

  return fresh;
}

/**
 * Smart learning: Track command sequences in real-time
 */
export class SequenceTracker {
  private currentSequence: CommandUsage[] = [];
  private lastCommandTime: number = 0;

  trackCommand(command: CommandUsage): void {
    const now = Date.now();
    const timeSinceLastCmd = now - this.lastCommandTime;

    // Reset sequence if too much time passed
    if (timeSinceLastCmd > MAX_TIME_BETWEEN_MS) {
      this.currentSequence = [];
    }

    this.currentSequence.push(command);
    this.lastCommandTime = now;

    // Check if we should suggest a workflow
    if (this.currentSequence.length >= 3) {
      this.checkForSuggestion();
    }
  }

  private checkForSuggestion(): void {
    // Check if this sequence has been repeated
    const seq = this.currentSequence.map(c => c.interpretedCommand).join(" → ");
    const stats = loadUsageStats();

    let count = 0;
    for (let i = 0; i <= stats.commands.length - this.currentSequence.length; i++) {
      const slice = stats.commands.slice(i, i + this.currentSequence.length);
      const sliceStr = slice.map(c => c.interpretedCommand).join(" → ");

      if (sliceStr === seq) {
        count++;
      }
    }

    if (count >= MIN_FREQUENCY) {
      // Generate suggestion
      const suggestions = generateWorkflowSuggestions();
      if (suggestions.length > 0) {
        console.log(`\n💡 ChittyCan noticed you repeat this sequence often.`);
        console.log(`   Would you like to create a workflow? Run: can chitty suggestions\n`);
      }
    }
  }

  reset(): void {
    this.currentSequence = [];
    this.lastCommandTime = 0;
  }
}
