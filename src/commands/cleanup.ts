/**
 * Cleanup command - Intelligent project cleanup with smart detection
 *
 * Features:
 * - Smart file detection (temp, backup, orphaned, stale)
 * - Interactive mode with user prompts
 * - Git-aware cleanup (untracked, ignored, stale branches)
 * - Learning from user choices (remembers safe deletions)
 * - Progress indicators and colored output
 * - Categorized reports with severity levels
 * - Integration with chittyagent-cleaner for system-wide cleanup
 * - Comprehensive codebase health checks
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, saveConfig, CleanupConfig } from "../lib/config.js";

// ChittyAgent-Cleaner path
const CLEANER_BASE = "/Volumes/chitty/github.com/CHITTYOS/chittyagent-cleaner";

// Cleanup categories with priorities
type Severity = "critical" | "warning" | "info" | "suggestion";

interface CleanupItem {
  id: string;
  severity: Severity;
  category: string;
  description: string;
  files: string[];
  sizeBytes: number;
  canAutofix: boolean;
  autofix?: () => Promise<void>;
  learnKey?: string;
  preApproved?: boolean;
}

interface CleanupReport {
  items: CleanupItem[];
  totalSize: number;
  scanTime: number;
}

interface CleanupOptions {
  cwd?: string;
  interactive?: boolean;
  autofix?: boolean;
  dryRun?: boolean;
  deep?: boolean;
  quiet?: boolean;
  agent?: "local" | "volume" | "kondo" | "all";
}

const SEVERITY_STYLE = {
  critical: { icon: "🚨", color: chalk.red },
  warning: { icon: "⚠️ ", color: chalk.yellow },
  info: { icon: "ℹ️ ", color: chalk.blue },
  suggestion: { icon: "💡", color: chalk.gray },
};

export async function cleanup(options: CleanupOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const interactive = options.interactive !== false;
  const dryRun = options.dryRun ?? true;
  const deep = options.deep ?? false;
  const quiet = options.quiet ?? false;

  const config = loadConfig();
  const cleanupConfig = config.cleanup || {};

  if (!quiet) console.log();

  let totalIssues = 0;
  let totalFreed = 0;
  const allActions: Array<{ category: string; action: string; size?: number }> = [];

  // Step 1: Agent cleanup analysis
  const runAgent = options.agent || "all";
  const agentResults = await analyzeAgentLogs(runAgent);

  for (const result of agentResults) {
    totalFreed += result.freedMB;
    for (const action of result.actions) {
      totalIssues++;
      allActions.push({
        category: result.name,
        action: action.target,
        size: action.sizeMB,
      });
    }
  }

  // Step 2: Project scan
  if (!quiet) process.stdout.write("Scanning project...");

  const report = await scanProject(cwd, deep, cleanupConfig);

  if (!quiet) process.stdout.write("\r" + " ".repeat(30) + "\r");

  for (const item of report.items) {
    totalIssues++;
    allActions.push({
      category: item.category,
      action: item.description,
      size: Math.round(item.sizeBytes / (1024 * 1024)),
    });
    totalFreed += Math.round(item.sizeBytes / (1024 * 1024));
  }

  // npm audit style output
  if (totalIssues === 0) {
    console.log(chalk.green("found 0 issues"));
    console.log();
    return;
  }

  const byCategory = groupBy(allActions, (a) => a.category);

  for (const [category, actions] of Object.entries(byCategory)) {
    console.log(chalk.bold(`${category}:`));
    for (const action of (actions as typeof allActions).slice(0, 6)) {
      const icon = chalk.yellow("~");
      const size = action.size && action.size > 0 ? chalk.gray(` (${action.size}MB)`) : "";
      console.log(`  ${icon} ${action.action}${size}`);
    }
    if ((actions as typeof allActions).length > 6) {
      console.log(chalk.gray(`  ... and ${(actions as typeof allActions).length - 6} more`));
    }
    console.log();
  }

  const issueWord = totalIssues === 1 ? "issue" : "issues";
  if (dryRun) {
    console.log(chalk.bold(`found ${totalIssues} ${issueWord}, ${totalFreed}MB reclaimable`));
    console.log(chalk.gray("run with --live to fix"));
  } else {
    console.log(chalk.bold.green(`fixed ${totalIssues} ${issueWord}, freed ${totalFreed}MB`));
  }
  console.log();

  if (!interactive || dryRun) return;

  // Interactive mode
  await handleInteractiveCleanup(report.items, cwd, config);
}

async function scanProject(
  cwd: string,
  deep: boolean,
  cleanupConfig: CleanupConfig
): Promise<CleanupReport> {
  const items: CleanupItem[] = [];
  let totalSize = 0;
  const startTime = Date.now();
  const safeToDelete = cleanupConfig.safeToDelete || [];

  // 1. Temporary files
  const tempExts = [".log", ".tmp", ".temp", ".swp", ".swo", "~"];
  const tempFiles = findFiles(cwd, { extensions: tempExts });
  if (tempFiles.length > 0) {
    const size = sumFileSizes(tempFiles);
    totalSize += size;
    items.push({
      id: "temp-files",
      severity: "info",
      category: "Temporary Files",
      description: "Editor and system temporary files",
      files: tempFiles,
      sizeBytes: size,
      canAutofix: true,
      learnKey: "temp-files",
      preApproved: safeToDelete.includes("temp-files"),
      autofix: async () => deleteFiles(tempFiles),
    });
  }

  // 2. OS metadata
  const metadataNames = [".DS_Store", "Thumbs.db", "desktop.ini"];
  const metadataFiles = findFilesByName(cwd, metadataNames);
  if (metadataFiles.length > 0) {
    const size = sumFileSizes(metadataFiles);
    totalSize += size;
    items.push({
      id: "os-metadata",
      severity: "info",
      category: "OS Metadata",
      description: "System-generated metadata files",
      files: metadataFiles,
      sizeBytes: size,
      canAutofix: true,
      learnKey: "os-metadata",
      preApproved: safeToDelete.includes("os-metadata"),
      autofix: async () => deleteFiles(metadataFiles),
    });
  }

  // 3. Backup files
  const backupExts = [".bak", ".backup", ".old", ".orig"];
  const backupFiles = findFiles(cwd, { extensions: backupExts });
  if (backupFiles.length > 0) {
    const size = sumFileSizes(backupFiles);
    totalSize += size;
    items.push({
      id: "backup-files",
      severity: "warning",
      category: "Backup Files",
      description: "Old backup files that may be outdated",
      files: backupFiles,
      sizeBytes: size,
      canAutofix: true,
      learnKey: "backup-files",
      preApproved: safeToDelete.includes("backup-files"),
      autofix: async () => deleteFiles(backupFiles),
    });
  }

  // 4. Wrong package manager lock files
  const lockIssue = checkPackageManagerLocks(cwd);
  if (lockIssue) {
    totalSize += lockIssue.sizeBytes;
    items.push(lockIssue);
  }

  // 5. .env files in git (CRITICAL)
  const envInGit = findEnvFilesInGit(cwd);
  if (envInGit.length > 0) {
    items.push({
      id: "env-in-git",
      severity: "critical",
      category: "Secrets Exposed",
      description: ".env files tracked by git - contains secrets!",
      files: envInGit,
      sizeBytes: sumFileSizes(envInGit),
      canAutofix: false,
    });
  }

  // 6. Large node_modules
  const nodeModulesPath = path.join(cwd, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    const nodeModulesSize = await getDirectorySizeAsync(nodeModulesPath);
    if (nodeModulesSize > 500 * 1024 * 1024) {
      items.push({
        id: "large-node-modules",
        severity: "warning",
        category: "Large Dependencies",
        description: `node_modules is ${formatBytes(nodeModulesSize)} - consider pruning`,
        files: ["node_modules/"],
        sizeBytes: nodeModulesSize,
        canAutofix: true,
        autofix: async () => {
          fs.rmSync(nodeModulesPath, { recursive: true, force: true });
          execSync("pnpm install --prefer-offline", { cwd, stdio: "inherit" });
        },
      });
    }
  }

  // 7. Build artifacts
  const buildDirs = ["dist", "build", ".next", ".nuxt", "coverage", ".turbo"];
  for (const dir of buildDirs) {
    const dirPath = path.join(cwd, dir);
    if (fs.existsSync(dirPath)) {
      const size = await getDirectorySizeAsync(dirPath);
      if (size > 10 * 1024 * 1024) {
        totalSize += size;
        items.push({
          id: `build-${dir}`,
          severity: "suggestion",
          category: "Build Artifacts",
          description: `${dir}/ can be regenerated (${formatBytes(size)})`,
          files: [`${dir}/`],
          sizeBytes: size,
          canAutofix: true,
          learnKey: `build-${dir}`,
          autofix: async () => fs.rmSync(dirPath, { recursive: true, force: true }),
        });
      }
    }
  }

  // 8-10. Git checks (deep mode)
  if (deep && isGitRepo(cwd)) {
    const ignoredFiles = getGitIgnoredFiles(cwd);
    if (ignoredFiles.length > 0) {
      const size = sumFileSizes(ignoredFiles.filter((f) => fs.existsSync(f)));
      if (size > 1024 * 1024) {
        totalSize += size;
        items.push({
          id: "git-ignored",
          severity: "suggestion",
          category: "Git Ignored Files",
          description: `${formatBytes(size)} of ignored files`,
          files: ignoredFiles.slice(0, 10),
          sizeBytes: size,
          canAutofix: true,
          autofix: async () => { execSync("git clean -fdX", { cwd, stdio: "inherit" }); },
        });
      }
    }

    const staleBranches = getStaleBranches(cwd, 90);
    if (staleBranches.length > 0) {
      items.push({
        id: "stale-branches",
        severity: "suggestion",
        category: "Stale Git Branches",
        description: `${staleBranches.length} branch(es) not updated in 90+ days`,
        files: staleBranches.map((b) => `branch: ${b}`),
        sizeBytes: 0,
        canAutofix: false,
      });
    }
  }

  // 11. Large files (deep mode)
  if (deep) {
    const largeFiles = findLargeFiles(cwd, 5 * 1024 * 1024);
    const unexpectedLarge = largeFiles.filter(
      (f) => !f.file.includes("node_modules") && !f.file.endsWith(".lock")
    );
    if (unexpectedLarge.length > 0) {
      const size = unexpectedLarge.reduce((sum, f) => sum + f.size, 0);
      items.push({
        id: "large-files",
        severity: "info",
        category: "Large Files",
        description: "Files > 5MB that might not belong in git",
        files: unexpectedLarge.map((f) => `${path.relative(cwd, f.file)} (${formatBytes(f.size)})`),
        sizeBytes: size,
        canAutofix: false,
      });
    }
  }

  // ============ CODEBASE HEALTH CHECKS ============

  // 12. Outdated terms
  const outdatedTerms = findOutdatedTerms(cwd);
  if (outdatedTerms.length > 0) {
    items.push({
      id: "outdated-terms",
      severity: "warning",
      category: "Outdated Terms",
      description: `${outdatedTerms.length} file(s) using deprecated naming`,
      files: outdatedTerms.map(t => `${t.file}: "${t.term}" → "${t.replacement}"`),
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 13. Non-canonical patterns
  const nonCanonical = findNonCanonicalPatterns(cwd);
  if (nonCanonical.length > 0) {
    items.push({
      id: "non-canonical",
      severity: "warning",
      category: "Non-Canonical Uses",
      description: `${nonCanonical.length} pattern(s) deviating from standards`,
      files: nonCanonical.map(n => `${n.file}: ${n.issue}`),
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 14. Orphan markdown
  const orphanDocs = findOrphanMarkdown(cwd);
  if (orphanDocs.length > 0) {
    items.push({
      id: "orphan-docs",
      severity: "info",
      category: "Orphan Documentation",
      description: `${orphanDocs.length} .md file(s) not linked from anywhere`,
      files: orphanDocs,
      sizeBytes: sumFileSizes(orphanDocs.filter(f => fs.existsSync(f))),
      canAutofix: false,
    });
  }

  // 15. Tech debt markers
  const techDebt = findTechDebtIndicators(cwd);
  if (techDebt.total > 0) {
    items.push({
      id: "tech-debt",
      severity: "info",
      category: "Tech Debt Markers",
      description: `${techDebt.total} TODO/FIXME/HACK comment(s) found`,
      files: [
        `TODO: ${techDebt.todos}`,
        `FIXME: ${techDebt.fixmes}`,
        `HACK: ${techDebt.hacks}`,
        ...techDebt.files.slice(0, 5),
      ],
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 16. Duplicate content (deep)
  if (deep) {
    const duplicateFiles = findDuplicateContent(cwd);
    if (duplicateFiles.length > 0) {
      const size = duplicateFiles.reduce((sum, d) => sum + d.size * (d.count - 1), 0);
      items.push({
        id: "duplicate-content",
        severity: "warning",
        category: "Duplicate Files",
        description: `${duplicateFiles.length} file(s) with identical content`,
        files: duplicateFiles.map(d => `${d.files[0]} (${d.count} copies, ${formatBytes(d.size)} each)`),
        sizeBytes: size,
        canAutofix: false,
      });
    }
  }

  // 17. Empty directories
  const emptyDirs = findEmptyDirectories(cwd);
  if (emptyDirs.length > 0) {
    items.push({
      id: "empty-dirs",
      severity: "suggestion",
      category: "Empty Directories",
      description: `${emptyDirs.length} empty directory(ies)`,
      files: emptyDirs,
      sizeBytes: 0,
      canAutofix: true,
      autofix: async () => {
        for (const dir of emptyDirs) {
          try { fs.rmdirSync(dir); } catch {}
        }
      },
    });
  }

  // 18. Inconsistent naming
  const namingIssues = findInconsistentNaming(cwd);
  if (namingIssues.length > 0) {
    items.push({
      id: "naming-inconsistent",
      severity: "info",
      category: "Inconsistent Naming",
      description: `${namingIssues.length} file(s) with inconsistent naming style`,
      files: namingIssues,
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 19. Copied files that should be symlinks
  const copiedFiles = findCopiedInsteadOfSymlinks(cwd);
  if (copiedFiles.length > 0) {
    items.push({
      id: "copied-not-symlinked",
      severity: "warning",
      category: "Copied Config Files",
      description: `${copiedFiles.length} file(s) should be symlinks`,
      files: copiedFiles.map(c => `${c.file} → ${c.shouldLinkTo}`),
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 20. Projects without clear purpose
  const unclearProjects = findUnclearProjects(cwd);
  if (unclearProjects.length > 0) {
    items.push({
      id: "unclear-projects",
      severity: "warning",
      category: "Unclear Projects",
      description: `${unclearProjects.length} project(s) without README or description`,
      files: unclearProjects,
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  // 21. Duplicate directories (deep)
  if (deep) {
    const duplicateDirs = findDuplicateDirectories(cwd);
    if (duplicateDirs.length > 0) {
      items.push({
        id: "duplicate-dirs",
        severity: "warning",
        category: "Duplicate Directories",
        description: `${duplicateDirs.length} directory name(s) appear in multiple locations`,
        files: duplicateDirs.map(d => `${d.name}: ${d.locations.join(", ")}`),
        sizeBytes: 0,
        canAutofix: false,
      });
    }
  }

  // 22. Rogue local tools
  const rogueTools = findRogueLocalTools(cwd);
  if (rogueTools.length > 0) {
    items.push({
      id: "rogue-tools",
      severity: "warning",
      category: "Rogue Local Tools",
      description: `${rogueTools.length} local tool(s) that should use central resources`,
      files: rogueTools.map(t => `${t.file}: ${t.issue}`),
      sizeBytes: 0,
      canAutofix: false,
    });
  }

  return { items, totalSize, scanTime: Date.now() - startTime };
}

// ============ Interactive Cleanup ============

async function handleInteractiveCleanup(
  items: CleanupItem[],
  _cwd: string,
  config: any
): Promise<void> {
  const fixableItems = items.filter((item) => item.canAutofix);
  if (fixableItems.length === 0) {
    console.log(chalk.yellow("No auto-fixable issues found."));
    return;
  }

  console.log(chalk.bold("\n🔧 Interactive Cleanup\n"));

  const choices = fixableItems.map((item) => ({
    name: `${SEVERITY_STYLE[item.severity].icon} ${item.category} (${formatBytes(item.sizeBytes)})`,
    value: item.id,
    checked: item.severity === "info" || (item.learnKey && config.cleanup?.safeToDelete?.includes(item.learnKey)),
  }));

  const { selectedItems } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedItems",
      message: "Select items to clean:",
      choices,
      pageSize: 15,
    },
  ]);

  if (selectedItems.length === 0) {
    console.log(chalk.yellow("\nNo items selected. Cleanup cancelled."));
    return;
  }

  const totalSize = fixableItems
    .filter((item) => selectedItems.includes(item.id))
    .reduce((sum, item) => sum + item.sizeBytes, 0);

  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `Delete ${selectedItems.length} item(s) (${formatBytes(totalSize)})?`,
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.yellow("\nCleanup cancelled."));
    return;
  }

  const { remember } = await inquirer.prompt([
    {
      type: "confirm",
      name: "remember",
      message: "Remember these choices for future cleanups?",
      default: true,
    },
  ]);

  console.log();
  const spinner = ora("Cleaning up...").start();

  let cleaned = 0;
  let freedBytes = 0;
  const newSafeToDelete: string[] = [];

  for (const itemId of selectedItems) {
    const item = fixableItems.find((i) => i.id === itemId);
    if (item?.autofix) {
      try {
        await item.autofix();
        cleaned++;
        freedBytes += item.sizeBytes;
        if (item.learnKey && remember) {
          newSafeToDelete.push(item.learnKey);
        }
      } catch (error) {
        console.error(chalk.red(`\nFailed to clean ${item.category}:`), error);
      }
    }
  }

  spinner.succeed(`Cleaned ${cleaned} item(s), freed ${formatBytes(freedBytes)}`);

  if (remember && newSafeToDelete.length > 0) {
    const existingSafe = config.cleanup?.safeToDelete || [];
    const allSafe = [...new Set([...existingSafe, ...newSafeToDelete])];
    saveConfig({
      ...config,
      cleanup: { ...config.cleanup, safeToDelete: allSafe },
    });
    console.log(chalk.gray(`\n💾 Saved ${newSafeToDelete.length} preference(s)`));
  }

  console.log();
}

// ============ Agent Integration ============

interface CleanupAction {
  type: "removed" | "cleaned" | "optimized";
  target: string;
  sizeMB?: number;
}

interface AgentResult {
  name: string;
  actions: CleanupAction[];
  freedMB: number;
  diskBefore?: number;
  diskAfter?: number;
  status: "ok" | "warning" | "critical";
}

async function analyzeAgentLogs(
  mode: "local" | "volume" | "kondo" | "all"
): Promise<AgentResult[]> {
  if (!fs.existsSync(CLEANER_BASE)) return [];

  const results: AgentResult[] = [];

  if (mode === "all" || mode === "local") results.push(parseLocalLog());
  if (mode === "all" || mode === "volume") results.push(parseVolumeLog());
  if (mode === "all" || mode === "kondo") results.push(parseKondoResults());

  return results;
}

function parseLocalLog(): AgentResult {
  const logPath = path.join(process.env.HOME || "", ".cleanup-log.txt");
  const actions: CleanupAction[] = [];
  let freedMB = 0;

  if (fs.existsSync(logPath)) {
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const removeMatches = content.matchAll(/Removing:\s*(.+?)\s*\((\d+)MB\)/g);
      for (const match of removeMatches) {
        actions.push({ type: "removed", target: path.basename(match[1]), sizeMB: parseInt(match[2]) });
      }
      const freedMatch = content.match(/Freed:\s*(\d+)MB/i);
      if (freedMatch) freedMB = parseInt(freedMatch[1]);
    } catch {}
  }

  return { name: "local-cleanup", actions, freedMB, status: "ok" };
}

function parseVolumeLog(): AgentResult {
  const logPath = "/Volumes/chitty/temp/.cleanup.log";
  const actions: CleanupAction[] = [];
  let freedMB = 0;
  let diskBefore: number | undefined;
  let diskAfter: number | undefined;

  if (fs.existsSync(logPath)) {
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const removeMatches = content.matchAll(/Removing:\s*(.+?)\s*\((\d+)MB\)/g);
      for (const match of removeMatches) {
        actions.push({ type: "removed", target: match[1].replace(/.*\//, ""), sizeMB: parseInt(match[2]) });
      }
      const freedMatch = content.match(/Freed:\s*(\d+)MB/i);
      if (freedMatch) freedMB = parseInt(freedMatch[1]);
      const usageMatch = content.match(/Usage:\s*(\d+)%\s*->\s*(\d+)%/);
      if (usageMatch) {
        diskBefore = parseInt(usageMatch[1]);
        diskAfter = parseInt(usageMatch[2]);
      }
    } catch {}
  }

  return {
    name: "volume-cleanup",
    actions,
    freedMB,
    diskBefore,
    diskAfter,
    status: diskAfter && diskAfter > 85 ? "critical" : diskAfter && diskAfter > 70 ? "warning" : "ok",
  };
}

function parseKondoResults(): AgentResult {
  const logPath = path.join(process.env.HOME || "", ".chittyos/insights/kondo.log");
  const actions: CleanupAction[] = [];

  if (fs.existsSync(logPath)) {
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const recMatches = content.matchAll(/RECOMMENDATION:\s*(.+)/g);
      for (const match of recMatches) {
        actions.push({ type: "optimized", target: match[1].trim() });
      }
    } catch {}
  }

  return { name: "kondo-analysis", actions, freedMB: 0, status: actions.length > 0 ? "warning" : "ok" };
}

// ============ File System Helpers ============

function findFiles(dir: string, options: { extensions?: string[]; names?: string[] }): string[] {
  const files: string[] = [];
  const excludeDirs = new Set(["node_modules", ".git", ".wrangler", "dist", "build", ".next", "coverage"]);

  function scan(currentDir: string, depth: number = 0) {
    if (depth > 10) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (excludeDirs.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const matchesExt = options.extensions?.some((ext) => entry.name.endsWith(ext)) ?? false;
          const matchesName = options.names?.includes(entry.name) ?? false;
          if (matchesExt || matchesName) files.push(fullPath);
        }
      }
    } catch {}
  }

  scan(dir);
  return files;
}

function findFilesByName(dir: string, names: string[]): string[] {
  return findFiles(dir, { names });
}

function checkPackageManagerLocks(cwd: string): CleanupItem | null {
  const locks = {
    npm: path.join(cwd, "package-lock.json"),
    yarn: path.join(cwd, "yarn.lock"),
    pnpm: path.join(cwd, "pnpm-lock.yaml"),
  };

  const existing = Object.entries(locks).filter(([_, p]) => fs.existsSync(p));
  if (existing.length <= 1) return null;

  const hasPnpm = fs.existsSync(locks.pnpm);
  if (!hasPnpm) return null;

  const wrongLocks = existing.filter(([name]) => name !== "pnpm").map(([_, p]) => p);
  if (wrongLocks.length === 0) return null;

  return {
    id: "wrong-lock-files",
    severity: "warning",
    category: "Package Manager Conflict",
    description: "Multiple lock files found (project uses pnpm)",
    files: wrongLocks,
    sizeBytes: sumFileSizes(wrongLocks),
    canAutofix: true,
    autofix: async () => deleteFiles(wrongLocks),
  };
}

function findEnvFilesInGit(cwd: string): string[] {
  if (!isGitRepo(cwd)) return [];
  const envFiles = findFiles(cwd, { names: [".env", ".env.local", ".env.production"] });
  return envFiles.filter((f) => {
    try {
      const rel = path.relative(cwd, f);
      execSync(`git ls-files --error-unmatch "${rel}"`, { cwd, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".git"));
}

function getGitIgnoredFiles(cwd: string): string[] {
  try {
    const output = execSync("git ls-files --others --ignored --exclude-standard", { cwd, encoding: "utf-8" });
    return output.trim().split("\n").filter(Boolean).map((f) => path.join(cwd, f));
  } catch {
    return [];
  }
}

function getStaleBranches(cwd: string, days: number): string[] {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const output = execSync(
      `git for-each-ref --sort=committerdate --format='%(refname:short) %(committerdate:iso8601)' refs/heads/`,
      { cwd, encoding: "utf-8" }
    );
    const branches: string[] = [];
    for (const line of output.trim().split("\n")) {
      const [branch, ...dateParts] = line.split(" ");
      const date = new Date(dateParts.join(" "));
      if (date < cutoffDate && branch !== "main" && branch !== "master") {
        branches.push(branch);
      }
    }
    return branches;
  } catch {
    return [];
  }
}

function findLargeFiles(dir: string, minSize: number): Array<{ file: string; size: number }> {
  const largeFiles: Array<{ file: string; size: number }> = [];
  const excludeDirs = new Set(["node_modules", ".git"]);

  function scan(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (excludeDirs.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          if (stats.size > minSize) largeFiles.push({ file: fullPath, size: stats.size });
        }
      }
    } catch {}
  }

  scan(dir);
  return largeFiles.sort((a, b) => b.size - a.size);
}

async function getDirectorySizeAsync(dir: string): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  let size = 0;

  const walk = async (currentDir: string) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        try { size += fs.statSync(fullPath).size; } catch {}
      }
    }
  };

  await walk(dir);
  return size;
}

function sumFileSizes(files: string[]): number {
  return files.reduce((sum, f) => {
    try { return sum + fs.statSync(f).size; } catch { return sum; }
  }, 0);
}

async function deleteFiles(files: string[]): Promise<void> {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// ============ Codebase Health Helpers ============

interface OutdatedTerm {
  file: string;
  term: string;
  replacement: string;
}

function findOutdatedTerms(cwd: string): OutdatedTerm[] {
  const results: OutdatedTerm[] = [];
  const termMap: Record<string, string> = {
    "ChittyTracker": "ChittyCan",
    "chittytracker": "chittycan",
    "chitty-tracker": "chitty-can",
    "chittyID": "ChittyID",
    "chittyConnect": "ChittyConnect",
    "chitty-connect": "chittyconnect",
    "chittyAuth": "ChittyAuth",
    "api-gateway": "chittyapi",
    "mcp-gateway": "chittymcp",
  };
  const codeExts = [".ts", ".tsx", ".js", ".jsx", ".json", ".md"];

  function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    const skipDirs = ["node_modules", ".git", "dist", "build"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (codeExts.some(ext => entry.name.endsWith(ext))) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            for (const [oldTerm, newTerm] of Object.entries(termMap)) {
              if (content.includes(oldTerm)) {
                results.push({ file: path.relative(cwd, fullPath), term: oldTerm, replacement: newTerm });
                break;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(cwd);
  return results;
}

interface NonCanonicalPattern {
  file: string;
  issue: string;
}

function findNonCanonicalPatterns(cwd: string): NonCanonicalPattern[] {
  const results: NonCanonicalPattern[] = [];
  const patterns = [
    { regex: /console\.log\s*\(/g, issue: "console.log in production" },
    { regex: /any\s*[;,)]/g, issue: "TypeScript 'any' type" },
    { regex: /\@ts-ignore/g, issue: "@ts-ignore suppression" },
    { regex: /\/\/\s*eslint-disable/g, issue: "ESLint disabled" },
  ];

  function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    const skipDirs = ["node_modules", ".git", "dist", "build"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            for (const pattern of patterns) {
              if (pattern.regex.test(content)) {
                results.push({ file: path.relative(cwd, fullPath), issue: pattern.issue });
              }
              pattern.regex.lastIndex = 0;
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(cwd);
  return results;
}

function findOrphanMarkdown(cwd: string): string[] {
  const mdFiles: string[] = [];
  const linkedFiles = new Set<string>();

  function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    const skipDirs = ["node_modules", ".git", "dist"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath, depth + 1);
        else if (entry.name.endsWith(".md")) mdFiles.push(fullPath);
      }
    } catch {}
  }

  walk(cwd);

  for (const mdFile of mdFiles) {
    try {
      const content = fs.readFileSync(mdFile, "utf-8");
      const linkMatches = content.matchAll(/\[.*?\]\(([^)]+\.md)\)/g);
      for (const match of linkMatches) {
        linkedFiles.add(path.resolve(path.dirname(mdFile), match[1]));
      }
    } catch {}
  }

  const importantFiles = ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "CLAUDE.md"];
  return mdFiles.filter(f => !linkedFiles.has(f) && !importantFiles.some(imp => f.endsWith(imp)))
    .map(f => path.relative(cwd, f));
}

interface TechDebtResult {
  todos: number;
  fixmes: number;
  hacks: number;
  total: number;
  files: string[];
}

function findTechDebtIndicators(cwd: string): TechDebtResult {
  const result: TechDebtResult = { todos: 0, fixmes: 0, hacks: 0, total: 0, files: [] };
  const codeExts = [".ts", ".tsx", ".js", ".jsx"];

  function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    const skipDirs = ["node_modules", ".git", "dist", "build"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (codeExts.some(ext => entry.name.endsWith(ext))) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const todos = (content.match(/\/\/\s*TODO/gi) || []).length;
            const fixmes = (content.match(/\/\/\s*FIXME/gi) || []).length;
            const hacks = (content.match(/\/\/\s*HACK/gi) || []).length;
            if (todos + fixmes + hacks > 0) {
              result.todos += todos;
              result.fixmes += fixmes;
              result.hacks += hacks;
              result.files.push(`${path.relative(cwd, fullPath)} (${todos + fixmes + hacks})`);
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(cwd);
  result.total = result.todos + result.fixmes + result.hacks;
  return result;
}

interface DuplicateContent {
  hash: string;
  size: number;
  count: number;
  files: string[];
}

function findDuplicateContent(cwd: string): DuplicateContent[] {
  const fileHashes = new Map<string, { size: number; files: string[] }>();

  function simpleHash(content: string): string {
    let hash = 2166136261;
    for (let i = 0; i < Math.min(content.length, 10000); i++) {
      hash ^= content.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16) + "_" + content.length;
  }

  function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    const skipDirs = ["node_modules", ".git", "dist", "build", ".next"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size < 1024) continue;
            const content = fs.readFileSync(fullPath, "utf-8");
            const hash = simpleHash(content);
            if (!fileHashes.has(hash)) fileHashes.set(hash, { size: stats.size, files: [] });
            fileHashes.get(hash)!.files.push(path.relative(cwd, fullPath));
          } catch {}
        }
      }
    } catch {}
  }

  walk(cwd);
  return Array.from(fileHashes.entries())
    .filter(([_, data]) => data.files.length > 1)
    .map(([hash, data]) => ({ hash, size: data.size, count: data.files.length, files: data.files }));
}

function findEmptyDirectories(cwd: string): string[] {
  const emptyDirs: string[] = [];
  const skipDirs = ["node_modules", ".git"];

  function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        walk(fullPath, depth + 1);
      }
      const currentEntries = fs.readdirSync(dir);
      if (currentEntries.length === 0 && dir !== cwd) {
        emptyDirs.push(path.relative(cwd, dir));
      }
    } catch {}
  }

  walk(cwd);
  return emptyDirs;
}

function findInconsistentNaming(cwd: string): string[] {
  const issues: string[] = [];
  const codeExts = [".ts", ".tsx", ".js", ".jsx"];

  function walk(dir: string, depth = 0) {
    if (depth > 4) return;
    const skipDirs = ["node_modules", ".git", "dist"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (codeExts.some(ext => entry.name.endsWith(ext))) {
          const baseName = entry.name.replace(/\.[^.]+$/, "");
          const hasUpperCase = /[A-Z]/.test(baseName);
          const hasKebab = baseName.includes("-");
          const hasSnake = baseName.includes("_");
          if ((hasUpperCase && hasKebab) || (hasUpperCase && hasSnake) || (hasKebab && hasSnake)) {
            issues.push(`${path.relative(cwd, fullPath)} (mixed naming)`);
          }
        }
      }
    } catch {}
  }

  walk(cwd);
  return issues;
}

function findCopiedInsteadOfSymlinks(cwd: string): Array<{ file: string; shouldLinkTo: string }> {
  const results: Array<{ file: string; shouldLinkTo: string }> = [];
  const sharedConfigs = ["tsconfig.json", ".eslintrc.js", ".prettierrc"];
  const rootConfigs = new Map<string, { path: string; content: string }>();

  for (const config of sharedConfigs) {
    const rootPath = path.join(cwd, config);
    if (fs.existsSync(rootPath)) {
      try {
        const stats = fs.lstatSync(rootPath);
        if (stats.isFile() && !stats.isSymbolicLink()) {
          rootConfigs.set(config, { path: rootPath, content: fs.readFileSync(rootPath, "utf-8") });
        }
      } catch {}
    }
  }

  function walk(dir: string, depth = 0) {
    if (depth > 3 || depth === 0) return;
    const skipDirs = ["node_modules", ".git", "dist"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (sharedConfigs.includes(entry.name)) {
          const stats = fs.lstatSync(fullPath);
          if (stats.isSymbolicLink()) continue;
          const rootConfig = rootConfigs.get(entry.name);
          if (rootConfig) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              if (content === rootConfig.content) {
                results.push({
                  file: path.relative(cwd, fullPath),
                  shouldLinkTo: path.relative(path.dirname(fullPath), rootConfig.path),
                });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  const workspaceDirs = ["packages", "apps", "services", "libs"];
  for (const wsDir of workspaceDirs) {
    const wsPath = path.join(cwd, wsDir);
    if (fs.existsSync(wsPath)) walk(wsPath, 1);
  }

  return results;
}

function findUnclearProjects(cwd: string): string[] {
  const unclearProjects: string[] = [];
  const workspaceDirs = ["packages", "apps", "services", "libs"];

  for (const wsDir of workspaceDirs) {
    const wsPath = path.join(cwd, wsDir);
    if (!fs.existsSync(wsPath)) continue;
    try {
      const entries = fs.readdirSync(wsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const projectPath = path.join(wsPath, entry.name);
        const hasReadme = fs.existsSync(path.join(projectPath, "README.md"));
        const pkgJsonPath = path.join(projectPath, "package.json");
        let hasDescription = false;
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
            hasDescription = !!pkg.description && pkg.description.length > 10;
          } catch {}
        }
        if (!hasReadme && !hasDescription) {
          unclearProjects.push(`${wsDir}/${entry.name} (no README or description)`);
        }
      }
    } catch {}
  }

  return unclearProjects;
}

interface DuplicateDirectory {
  name: string;
  locations: string[];
}

function findDuplicateDirectories(cwd: string): DuplicateDirectory[] {
  const dirNames = new Map<string, string[]>();
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
  const ignoredNames = new Set(["src", "lib", "test", "tests", "utils", "types", "components"]);

  function walk(dir: string, depth = 0) {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (!ignoredNames.has(entry.name)) {
          if (!dirNames.has(entry.name)) dirNames.set(entry.name, []);
          dirNames.get(entry.name)!.push(path.relative(cwd, fullPath));
        }
        walk(fullPath, depth + 1);
      }
    } catch {}
  }

  walk(cwd);
  return Array.from(dirNames.entries())
    .filter(([_, locations]) => locations.length > 1)
    .map(([name, locations]) => ({ name, locations }));
}

interface RogueTool {
  file: string;
  issue: string;
}

function findRogueLocalTools(cwd: string): RogueTool[] {
  const results: RogueTool[] = [];
  const roguePatterns = [
    { pattern: /fetch\s*\(\s*['"`]https:\/\/api\.github\.com/, issue: "Direct GitHub API call" },
    { pattern: /fetch\s*\(\s*['"`]https:\/\/api\.notion\.com/, issue: "Direct Notion API call" },
    { pattern: /jwt\.sign|jsonwebtoken/, issue: "Local JWT implementation" },
    { pattern: /import.*uuid.*from\s*['"]uuid['"]/, issue: "Generic UUID (use ChittyID)" },
  ];

  function walk(dir: string, depth = 0) {
    if (depth > 4) return;
    const skipDirs = ["node_modules", ".git", "dist", "build"];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            for (const { pattern, issue } of roguePatterns) {
              if (pattern.test(content)) {
                results.push({ file: path.relative(cwd, fullPath), issue });
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(cwd);
  return results;
}
