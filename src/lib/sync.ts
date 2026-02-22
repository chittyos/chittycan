import { NotionClient } from "./notion.js";
import { GitHubClient } from "./github.js";
import type { NotionAction, GitHubIssue, SyncMapping } from "../types/index.js";

export interface SyncConfig {
  notionToken: string;
  githubToken: string;
  notionDatabaseId: string;
  githubOwner: string;
  githubRepo: string;
  dryRun?: boolean;
}

export interface SyncResult {
  createdInNotion: number;
  createdInGitHub: number;
  updatedInNotion: number;
  updatedInGitHub: number;
  conflicts: Array<{ action: NotionAction; issue: GitHubIssue; reason: string }>;
  errors: Array<{ item: string; error: string }>;
}

const DEFAULT_MAPPINGS: SyncMapping[] = [
  { notionStatus: "To Do", githubState: "open", githubLabels: ["todo"] },
  { notionStatus: "In Progress", githubState: "open", githubLabels: ["in-progress"] },
  { notionStatus: "Done", githubState: "closed", githubLabels: ["done"] },
  { notionStatus: "Archived", githubState: "closed", githubLabels: ["archived"] }
];

export class SyncWorker {
  private notion: NotionClient;
  private github: GitHubClient;
  private config: SyncConfig;
  private mappings: SyncMapping[];

  constructor(config: SyncConfig, mappings?: SyncMapping[]) {
    this.notion = new NotionClient(config.notionToken);
    this.github = new GitHubClient(config.githubToken);
    this.config = config;
    this.mappings = mappings || DEFAULT_MAPPINGS;
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      createdInNotion: 0,
      createdInGitHub: 0,
      updatedInNotion: 0,
      updatedInGitHub: 0,
      conflicts: [],
      errors: []
    };

    try {
      // Fetch all data
      const [actions, issues] = await Promise.all([
        this.notion.queryDatabase(this.config.notionDatabaseId),
        this.github.listIssues(this.config.githubOwner, this.config.githubRepo)
      ]);

      // Build lookup maps
      const actionsById = new Map(actions.map(a => [a.id, a]));
      const actionsByIssueNumber = new Map(
        actions.filter(a => a.githubIssueNumber).map(a => [a.githubIssueNumber!, a])
      );
      const issuesByNumber = new Map(issues.map(i => [i.number, i]));

      // Process GitHub issues → Notion
      for (const issue of issues) {
        const action = actionsByIssueNumber.get(issue.number);

        if (!action) {
          // Create new action in Notion
          if (!this.config.dryRun) {
            try {
              const newAction = this.issueToAction(issue);
              await this.notion.createPage(this.config.notionDatabaseId, newAction);
              result.createdInNotion++;
            } catch (error: any) {
              result.errors.push({
                item: `GitHub Issue #${issue.number}`,
                error: error.message
              });
            }
          } else {
            result.createdInNotion++;
          }
        } else {
          // Check for conflicts or updates
          const conflict = this.detectConflict(action, issue);

          if (conflict) {
            result.conflicts.push(conflict);
          } else if (this.needsUpdate(action, issue, "from-github")) {
            // Update Notion from GitHub
            if (!this.config.dryRun) {
              try {
                await this.notion.updatePage(action.id, this.getUpdatesFromIssue(issue));
                result.updatedInNotion++;
              } catch (error: any) {
                result.errors.push({
                  item: `Notion Action ${action.title}`,
                  error: error.message
                });
              }
            } else {
              result.updatedInNotion++;
            }
          }
        }
      }

      // Process Notion actions → GitHub
      for (const action of actions) {
        if (!action.githubIssueNumber) {
          // Create new issue in GitHub
          if (!this.config.dryRun) {
            try {
              const issue = await this.createIssueFromAction(action);
              await this.notion.updatePage(action.id, {
                githubIssueNumber: issue.number,
                githubIssueUrl: issue.html_url,
                githubRepo: issue.repository,
                syncState: "synced",
                lastSync: new Date().toISOString()
              });
              result.createdInGitHub++;
            } catch (error: any) {
              result.errors.push({
                item: `Notion Action ${action.title}`,
                error: error.message
              });
            }
          } else {
            result.createdInGitHub++;
          }
        } else {
          const issue = issuesByNumber.get(action.githubIssueNumber);

          if (issue && this.needsUpdate(action, issue, "from-notion")) {
            // Update GitHub from Notion
            if (!this.config.dryRun) {
              try {
                await this.updateIssueFromAction(action, issue);
                await this.notion.updatePage(action.id, {
                  syncState: "synced",
                  lastSync: new Date().toISOString()
                });
                result.updatedInGitHub++;
              } catch (error: any) {
                result.errors.push({
                  item: `GitHub Issue #${action.githubIssueNumber}`,
                  error: error.message
                });
              }
            } else {
              result.updatedInGitHub++;
            }
          }
        }
      }

      return result;
    } catch (error: any) {
      result.errors.push({
        item: "Sync process",
        error: error.message
      });
      return result;
    }
  }

  private issueToAction(issue: GitHubIssue): NotionAction {
    const mapping = this.getMapping(issue.state, issue);

    return {
      id: "",
      title: issue.title,
      status: mapping.notionStatus as any,
      due: issue.due_on,
      assignee: issue.assignees?.[0],
      notes: issue.body,
      githubIssueUrl: issue.html_url,
      githubIssueNumber: issue.number,
      githubRepo: issue.repository,
      syncState: "synced",
      lastSync: new Date().toISOString()
    };
  }

  private async createIssueFromAction(action: NotionAction): Promise<GitHubIssue> {
    const mapping = this.mappings.find(m => m.notionStatus === action.status);

    return await this.github.createIssue(
      this.config.githubOwner,
      this.config.githubRepo,
      action.title,
      action.notes,
      mapping?.githubLabels
    );
  }

  private async updateIssueFromAction(action: NotionAction, issue: GitHubIssue): Promise<void> {
    const mapping = this.mappings.find(m => m.notionStatus === action.status);

    await this.github.updateIssue(this.config.githubOwner, this.config.githubRepo, issue.number, {
      title: action.title,
      body: action.notes,
      state: mapping?.githubState,
      labels: mapping?.githubLabels
    });
  }

  private getUpdatesFromIssue(issue: GitHubIssue): Partial<NotionAction> {
    const mapping = this.getMapping(issue.state, issue);

    return {
      title: issue.title,
      status: mapping.notionStatus as any,
      notes: issue.body,
      syncState: "synced",
      lastSync: new Date().toISOString()
    };
  }

  private getMapping(githubState: "open" | "closed", issue: GitHubIssue): SyncMapping {
    // Try to find specific mapping (future: could check labels)
    const defaultMapping = this.mappings.find(m => m.githubState === githubState);
    return defaultMapping || this.mappings[0];
  }

  private needsUpdate(action: NotionAction, issue: GitHubIssue, direction: "from-github" | "from-notion"): boolean {
    if (!action.lastSync) return true;

    const lastSync = new Date(action.lastSync).getTime();
    const now = Date.now();

    // Simple heuristic: if changed in the last hour, check for differences
    if (now - lastSync < 3600000) return false;

    if (direction === "from-github") {
      // Check if GitHub has newer data
      return action.title !== issue.title || action.notes !== issue.body;
    } else {
      // Check if Notion has newer data
      const mapping = this.mappings.find(m => m.notionStatus === action.status);
      return issue.state !== mapping?.githubState || issue.title !== action.title;
    }
  }

  private detectConflict(action: NotionAction, issue: GitHubIssue): { action: NotionAction; issue: GitHubIssue; reason: string } | null {
    if (action.syncState === "conflict") {
      return { action, issue, reason: "Previous conflict not resolved" };
    }

    // Both changed since last sync
    if (action.lastSync) {
      const lastSync = new Date(action.lastSync).getTime();
      const notionChanged = action.title !== issue.title || action.notes !== issue.body;
      const githubChanged = issue.title !== action.title || issue.body !== action.notes;

      if (notionChanged && githubChanged) {
        return { action, issue, reason: "Both Notion and GitHub modified since last sync" };
      }
    }

    return null;
  }
}
