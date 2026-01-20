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

/**
 * Orchestrates a project cleanup: analyzes agent logs, scans the project for cleanup candidates, reports findings, and optionally performs interactive or automatic fixes.
 *
 * The command aggregates cleanup items and estimated reclaimable space, prints a categorized summary, and — when run with live mode (dryRun = false) or in interactive mode with confirmation — executes autofix actions. In quiet mode minimal progress output is shown.
 *
 * @param options - Configuration for the cleanup run:
 *   - `cwd`: working directory to scan (defaults to current working directory)
 *   - `interactive`: whether to prompt the user for interactive cleanup (defaults to true)
 *   - `dryRun`: when true only reports issues without performing fixes (defaults to true)
 *   - `deep`: enable deeper, more expensive checks (defaults to false)
 *   - `quiet`: suppress progress output (defaults to false)
 *   - `agent`: which agent logs to analyze (e.g., `"local"`, `"volume"`, `"kondo"`, or `"all"`)
 */
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

/**
 * Scan a project directory for cleanup opportunities and codebase health issues and produce actionable findings.
 *
 * @param cwd - Path to the project root to scan
 * @param deep - When true, enable deeper checks (git inspections, large-file discovery, duplicate-directory analysis, etc.)
 * @param cleanupConfig - Cleanup configuration (used to read remembered "safe to delete" keys and other scan settings)
 * @returns A CleanupReport containing the list of discovered CleanupItem entries, the total reclaimable bytes (`totalSize`), and the scan duration in milliseconds (`scanTime`)
 */
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

/**
 * Interactively prompt the user to select fixable cleanup items and execute their autofix handlers.
 *
 * Presents a checkbox list of autofixable CleanupItem entries (pre-checking items learned in `config.cleanup.safeToDelete`),
 * confirms the total selection, optionally remembers the choice, runs each selected item's `autofix` handler, and
 * persists any new learned preferences back into `config.cleanup.safeToDelete`.
 *
 * @param items - Array of discovered CleanupItem candidates; only items with `canAutofix` are offered for selection.
 * @param _cwd - Current working directory (unused by this routine).
 * @param config - Application configuration object; may include `cleanup.safeToDelete` (string[]) which is used to
 *                 pre-select known-safe items and to store new preferences when the user opts to remember choices.
 */

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

/**
 * Analyze available cleanup agent logs and collect their findings.
 *
 * @param mode - Which agent logs to analyze: `"local"` for the local machine log, `"volume"` for the external volume log, `"kondo"` for kondo insights, or `"all"` to run all available analyses
 * @returns An array of `AgentResult` entries summarizing discovered agent-driven cleanup actions; returns an empty array if the cleaner base path is not present or no agent logs are available
 */
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

/**
 * Parses the local cleanup log file (~/.cleanup-log.txt) and summarizes recorded removal actions.
 *
 * @returns An AgentResult with `name` set to `"local-cleanup"`, `actions` containing parsed removal entries (type, target basename, and `sizeMB`), `freedMB` as the total megabytes freed reported in the log, and `status` set to `"ok"`.
 */
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

/**
 * Parses the volume cleanup log and summarizes cleanup actions and disk usage.
 *
 * @returns An AgentResult summarizing parsed entries from /Volumes/chitty/temp/.cleanup.log: `actions` performed, total `freedMB`, `diskBefore` and `diskAfter` usage percentages (when present), and a derived `status` of `critical`, `warning`, or `ok`.
 */
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

/**
 * Parse the local Kondo insights log and extract recommendations as cleanup actions.
 *
 * Reads the file ~/.chittyos/insights/kondo.log and converts each line matching `RECOMMENDATION: ...` into
 * a cleanup action of type `"optimized"`. If the log is missing or cannot be read, an AgentResult with no actions is returned.
 *
 * @returns An AgentResult named `"kondo-analysis"` whose `actions` array contains one `"optimized"` action per recommendation,
 * `freedMB` equals `0`, and `status` is `"warning"` if any recommendations were found or `"ok"` otherwise.
 */
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

/**
 * Finds files under a directory that match any of the provided file name suffixes or exact names.
 *
 * @param dir - Root directory to search
 * @param options - Filtering options
 * @param options.extensions - List of filename suffixes to match (e.g., ".js" or "js"); a file matches if its name ends with any entry
 * @param options.names - List of exact file names to match (e.g., "README.md", ".env")
 * @returns An array of matching file paths (absolute or relative as produced by `path.join`), skipping common VCS and build directories (for example, `node_modules`, `.git`)
 */

function findFiles(dir: string, options: { extensions?: string[]; names?: string[] }): string[] {
  const files: string[] = [];
  const excludeDirs = new Set(["node_modules", ".git", ".wrangler", "dist", "build", ".next", "coverage"]);

  /**
   * Recursively traverses a directory tree and collects matching file paths.
   *
   * Recurses into subdirectories up to a depth of 10, skipping directories listed in `excludeDirs`. For each file, if its name matches `options.names` or its extension matches `options.extensions`, the function appends the file's full path to the surrounding `files` array. IO errors during a directory read are ignored so the scan continues.
   *
   * @param currentDir - Directory path to scan
   * @param depth - Current recursion depth (internal); recursion stops when this exceeds 10
   */
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

/**
 * Finds files with specific names under a directory.
 *
 * @param dir - Directory to search within
 * @param names - File names to match (for example, `.env` or `README.md`)
 * @returns Full paths to files whose base name matches any entry in `names`
 */
function findFilesByName(dir: string, names: string[]): string[] {
  return findFiles(dir, { names });
}

/**
 * Detects when multiple package-manager lockfiles exist and, if the repository uses pnpm, returns a CleanupItem that removes the non-pnpm lockfiles.
 *
 * @returns A CleanupItem describing the conflicting lockfiles and an autofix to delete the non-pnpm lockfiles, or `null` if no conflict is detected.
 */
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

/**
 * Locate environment-like files that are tracked in the repository.
 *
 * Searches the working tree at `cwd` for files named `.env`, `.env.local`, or `.env.production`
 * and returns those that are tracked by Git. If `cwd` is not a Git repository, an empty array is returned.
 *
 * @param cwd - Repository root (working directory) to search
 * @returns An array of full file paths for matching files that are tracked by Git
 */
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

/**
 * Determines whether a given directory is a Git repository by checking for a `.git` directory.
 *
 * @param cwd - Path to the directory to check
 * @returns `true` if a `.git` directory exists under `cwd`, `false` otherwise.
 */
function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".git"));
}

/**
 * Lists files that Git considers ignored or untracked-and-ignored within the specified working directory.
 *
 * @param cwd - Path to the repository root or directory to run Git in
 * @returns Absolute paths of files reported by Git as ignored or untracked-and-ignored; returns an empty array if Git cannot be invoked or the command fails
 */
function getGitIgnoredFiles(cwd: string): string[] {
  try {
    const output = execSync("git ls-files --others --ignored --exclude-standard", { cwd, encoding: "utf-8" });
    return output.trim().split("\n").filter(Boolean).map((f) => path.join(cwd, f));
  } catch {
    return [];
  }
}

/**
 * Identify local Git branches that have not been updated within the given number of days.
 *
 * @param cwd - Path to the Git repository to inspect
 * @param days - Age threshold in days; branches with last commit older than this are considered stale
 * @returns An array of branch names whose most recent commit is older than `days` days; returns an empty array if the repository cannot be read or an error occurs
 */
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

/**
 * Find files whose size exceeds a given threshold under a directory, skipping `node_modules` and `.git`.
 *
 * @param dir - Root directory to scan
 * @param minSize - Minimum file size in bytes; files with size greater than this value are reported
 * @returns An array of objects each containing `file` (full path) and `size` (bytes), sorted by size descending
 */
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

/**
 * Computes the total size in bytes of all files under the given directory.
 *
 * @param dir - Filesystem path to the directory to measure
 * @returns The sum in bytes of every file contained (recursively). Returns `0` if the directory does not exist. Files that cannot be read are skipped.
 */
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

/**
 * Compute the total size in bytes of the given files.
 *
 * @param files - Paths to files whose sizes should be summed; missing or unreadable files are ignored
 * @returns The sum of sizes (in bytes) of all readable files
 */
function sumFileSizes(files: string[]): number {
  return files.reduce((sum, f) => {
    try { return sum + fs.statSync(f).size; } catch { return sum; }
  }, 0);
}

/**
 * Deletes the provided files, attempting removal for each path and ignoring errors.
 *
 * @param files - Array of file paths to remove; failures for individual files are suppressed.
 */
async function deleteFiles(files: string[]): Promise<void> {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}

/**
 * Format a byte count into a compact, human-readable string using B, KB, MB, or GB.
 *
 * @param bytes - The number of bytes to format
 * @returns A string formatted with one decimal place for KB/MB/GB (e.g. `1.2 KB`) or an integer for bytes (e.g. `512 B`)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Groups elements of an array by a string key produced for each element.
 *
 * @param keyFn - Function that returns the group key for a given item
 * @returns An object mapping each key to an array of items that produced that key
 */
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

/**
 * Scans a codebase directory for occurrences of known deprecated or renamed terms and suggests their replacements.
 *
 * Searches source and documentation files under `cwd` (limited depth) for a predefined set of outdated identifiers and records the file and suggested replacement for each occurrence.
 *
 * @param cwd - Root directory to scan for outdated terms
 * @returns A list of `OutdatedTerm` entries each containing the relative `file` path, the discovered `term`, and the suggested `replacement`
 */
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

/**
 * Scans a workspace for common non-canonical or risky TypeScript patterns and returns found occurrences.
 *
 * This performs a best-effort search of `.ts` and `.tsx` files under `cwd`, reporting each match as a
 * `NonCanonicalPattern` with a relative file path and a short issue description. The scan limits recursion
 * to five directory levels and skips typical build and dependency directories (`node_modules`, `.git`, `dist`, `build`).
 * Unreadable files or directories are skipped without throwing.
 *
 * @param cwd - Root directory to scan
 * @returns A list of detected non-canonical pattern occurrences (file path relative to `cwd` and issue)
 */
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

/**
 * Finds markdown files that are not linked from any other markdown document under the given root.
 *
 * Scans up to 5 levels deep, skipping node_modules, .git and dist directories. Files named
 * README.md, CHANGELOG.md, CONTRIBUTING.md and CLAUDE.md are treated as canonical and are excluded.
 *
 * @param cwd - Root directory to scan for markdown files
 * @returns Relative paths (to `cwd`) of markdown files that are not linked by other markdown files and are not canonical docs
 */
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

/**
 * Scan the given directory tree for TODO, FIXME, and HACK comment markers and aggregate counts and affected files.
 *
 * @param cwd - Root directory to scan for code files
 * @returns An object with aggregated counts (`todos`, `fixmes`, `hacks`, `total`) and `files`, where each entry is a relative file path followed by the number of markers in that file (e.g., `src/foo.ts (3)`).
 */
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

/**
 * Finds groups of files with identical content within a project directory.
 *
 * Scans up to five directory levels, ignores common build/VC directories, and only considers files at least 1 KB in size; files are grouped by a fast content-derived fingerprint so large exact duplicates are reported.
 *
 * @param cwd - The root directory to scan (relative paths in results are computed from this directory)
 * @returns An array of duplicate groups; each entry contains `hash` (fingerprint), `size` (bytes of a representative file), `count` (number of duplicate files) and `files` (relative file paths)
 */
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

/**
 * Finds empty directories under the given workspace root.
 *
 * Searches up to 6 levels deep for directories that contain no entries and returns their paths
 * relative to `cwd`. Skips traversing `node_modules` and `.git`. Filesystem errors encountered
 * while reading directories are ignored.
 *
 * @param cwd - Root directory to scan for empty directories
 * @returns Relative paths of empty directories found (excluding the root `cwd`)
 */
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

/**
 * Finds code files whose base filenames mix different naming conventions.
 *
 * Scans the directory tree rooted at `cwd` (limited depth) for .ts/.tsx/.js/.jsx files and reports files whose base name combines two or more naming styles (uppercase / camelCase / kebab-case / snake_case).
 *
 * @param cwd - Root directory to scan for inconsistent naming
 * @returns An array of relative file paths for files whose base names mix naming conventions
 */
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

/**
 * Finds workspace-local copies of shared root config files and suggests replacing them with symlinks to the root copies.
 *
 * Scans common workspace directories ("packages", "apps", "services", "libs") up to three levels deep for files
 * named like root shared configs (e.g., "tsconfig.json", ".eslintrc.js", ".prettierrc"). Ignores entries that are
 * already symbolic links or that do not exactly match the root file content. Only files within the specified workspace
 * subdirectories are considered.
 *
 * @param cwd - Project root directory to scan for duplicated config files
 * @returns An array of objects where `file` is the relative path to the duplicated config file and `shouldLinkTo` is
 *          the relative path (from the duplicated file's directory) pointing to the root config that it should be
 *          symlinked to.
 */
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

/**
 * Identifies workspace subprojects that lack both a README.md and a meaningful package.json description.
 *
 * @param cwd - The repository or workspace root directory to scan
 * @returns A list of relative project identifiers (e.g., "packages/foo") for projects without a README or a description longer than 10 characters
 */
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

/**
 * Finds directory names that appear in more than one location under the given root.
 *
 * Scans the filesystem from `cwd` (up to four levels deep) and collects directories
 * whose base name occurs multiple times. Common workspace/build folders (e.g. node_modules,
 * .git, dist, build, .next, coverage) are skipped and several generic names (e.g. src, lib,
 * test, tests, utils, types, components) are treated as ignored for duplication reporting.
 *
 * @param cwd - Root directory to scan for duplicate directory names
 * @returns An array of objects with `name` and `locations`, where `locations` are paths
 *          relative to `cwd` for each directory that shares the same `name` in multiple places
 */
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

/**
 * Scans a codebase for local tools that call external services or implement sensitive behaviors.
 *
 * @param cwd - Root directory to scan
 * @returns An array of detected rogue tool occurrences; each entry contains `file` (path relative to `cwd`) and `issue` describing the problem
 */
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