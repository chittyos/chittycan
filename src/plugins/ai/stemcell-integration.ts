/**
 * Stemcell Integration for AI Connectors
 *
 * Automatically brief any AI when it pops on
 */

import { generateStemcellBrief, formatStemcellBrief, type StemcellBrief } from "@/lib/stemcell";

/**
 * Generate a brief for an AI about to work on a task
 */
export async function briefAI(options: {
  task?: string;
  projectPath?: string;
  includeFullContext?: boolean;
}): Promise<string> {
  const { task, projectPath = process.cwd(), includeFullContext = true } = options;

  const brief = await generateStemcellBrief(projectPath, {
    includeInstructions: includeFullContext,
    includeDependencies: includeFullContext,
    includeStructure: includeFullContext,
  });

  const formattedBrief = formatStemcellBrief(brief);

  const sections = [formattedBrief];

  if (task) {
    sections.push("\n## Current Task");
    sections.push(task);
    sections.push("");
  }

  sections.push("## Instructions");
  sections.push("You have just been brought in to work on this project.");
  sections.push("Use the context above to understand:");
  sections.push("- What this project does");
  sections.push("- Current state (git branch, modified files)");
  sections.push("- Project conventions (from CLAUDE.md)");
  sections.push("- How to proceed with the task");
  sections.push("");

  return sections.join("\n");
}

/**
 * Wrapper for AI chat that auto-briefs on first message
 */
export async function chatWithBrief(
  aiChat: (messages: Array<{ role: string; content: string }>) => Promise<string>,
  userPrompt: string,
  options: {
    projectPath?: string;
    includeContext?: boolean;
  } = {}
): Promise<string> {
  const { projectPath = process.cwd(), includeContext = true } = options;

  const messages: Array<{ role: string; content: string }> = [];

  if (includeContext) {
    const brief = await briefAI({ task: userPrompt, projectPath });
    messages.push({
      role: "user",
      content: brief,
    });
  } else {
    messages.push({
      role: "user",
      content: userPrompt,
    });
  }

  return aiChat(messages);
}

/**
 * Get a quick brief (just the essentials)
 */
export async function getQuickBrief(projectPath: string = process.cwd()): Promise<string> {
  const brief = await generateStemcellBrief(projectPath, {
    includeInstructions: false,
    includeDependencies: false,
    includeStructure: true,
    maxCommits: 3,
  });

  return `Project: ${brief.project.name} (${brief.project.type})
Branch: ${brief.context.branch}
Modified: ${brief.context.modifiedFiles.length} files
Recent: ${brief.context.recentCommits[0] || "No commits"}`;
}
