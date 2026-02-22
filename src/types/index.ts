export type SyncState = "synced" | "changed-in-notion" | "changed-in-github" | "conflict";

export interface NotionAction {
  id: string;
  title: string;
  status: "To Do" | "In Progress" | "Done" | "Archived";
  due?: string;
  assignee?: string;
  notes?: string;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  githubRepo?: string;
  syncState?: SyncState;
  lastSync?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  body?: string;
  assignees?: string[];
  due_on?: string;
  html_url: string;
  repository: string;
}

export interface SyncMapping {
  notionStatus: string;
  githubState: "open" | "closed";
  githubLabels?: string[];
}
