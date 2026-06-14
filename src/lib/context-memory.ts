import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const MEMORY_FILE = path.join(os.homedir(), '.chittycan', 'context-memory.json');

export interface MemoryEntry {
  intent: string;
  command: string;
  success: boolean;
  cli: string;
  timestamp: number;
}

export interface ContextMemory {
  entries: MemoryEntry[];
}

export function loadContextMemory(): ContextMemory {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return fs.readJsonSync(MEMORY_FILE);
    }
  } catch (error) {
    // Ignore read errors
  }
  return { entries: [] };
}

export function saveContextMemory(memory: ContextMemory): void {
  try {
    fs.ensureDirSync(path.dirname(MEMORY_FILE));
    fs.writeJsonSync(MEMORY_FILE, memory, { spaces: 2 });
  } catch (error) {
    // Ignore write errors
  }
}

export function recordExecution(cli: string, intent: string, command: string, success: boolean): void {
  const memory = loadContextMemory();
  
  // Keep only the most recent 500 entries
  if (memory.entries.length >= 500) {
    memory.entries = memory.entries.slice(memory.entries.length - 499);
  }

  memory.entries.push({
    cli,
    intent,
    command,
    success,
    timestamp: Date.now()
  });

  saveContextMemory(memory);
}

export function getFewShotExamples(cli: string, limit = 3): { intent: string, command: string }[] {
  const memory = loadContextMemory();
  
  // Get successful recent entries for this CLI
  const successes = memory.entries
    .filter(e => e.cli === cli && e.success)
    .sort((a, b) => b.timestamp - a.timestamp);

  // Deduplicate by intent
  const seen = new Set<string>();
  const unique: { intent: string, command: string }[] = [];
  
  for (const entry of successes) {
    if (!seen.has(entry.intent)) {
      seen.add(entry.intent);
      unique.push({ intent: entry.intent, command: entry.command });
      if (unique.length >= limit) break;
    }
  }

  return unique.reverse(); // Return in chronological order
}
