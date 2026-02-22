/**
 * Linear Extension for ChittyTracker
 * Manage issues, projects, and sync with Notion
 */

import type { ChittyPlugin } from "../../lib/plugin.js";
import type { Config } from "../../lib/config.js";

export interface LinearRemote {
  type: "linear-workspace";
  apiKey: string;
  workspaceId?: string;
  teamId?: string;
}

class LinearClient {
  private apiKey: string;

  constructor(remote: LinearRemote) {
    this.apiKey = remote.apiKey;
  }

  private async query(query: string, variables: any = {}) {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Authorization": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`);
    }

    const result: any = await response.json();

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  // Issues
  async listIssues(teamId?: string) {
    const query = `
      query Issues($teamId: String) {
        issues(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            title
            description
            state {
              name
            }
            assignee {
              name
            }
            dueDate
            url
          }
        }
      }
    `;

    const data = await this.query(query, { teamId });
    return data.issues.nodes;
  }

  async createIssue(title: string, description?: string, teamId?: string) {
    const query = `
      mutation CreateIssue($title: String!, $description: String, $teamId: String!) {
        issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
          success
          issue {
            id
            title
            url
          }
        }
      }
    `;

    const data = await this.query(query, { title, description, teamId });
    return data.issueCreate.issue;
  }

  async updateIssue(issueId: string, updates: any) {
    const query = `
      mutation UpdateIssue($issueId: String!, $updates: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $updates) {
          success
          issue {
            id
            title
          }
        }
      }
    `;

    const data = await this.query(query, { issueId, updates });
    return data.issueUpdate.issue;
  }

  // Teams
  async listTeams() {
    const query = `
      query Teams {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    const data = await this.query(query);
    return data.teams.nodes;
  }

  // Projects
  async listProjects(teamId?: string) {
    const query = `
      query Projects($teamId: String) {
        projects(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            description
            state
          }
        }
      }
    `;

    const data = await this.query(query, { teamId });
    return data.projects.nodes;
  }
}

// Command handlers
async function listIssues(args: any, config: Config) {
  const remoteName = args.remote || "linear";
  const remote = config.remotes[remoteName] as unknown as LinearRemote;

  if (!remote || remote.type !== "linear-workspace") {
    throw new Error(`Remote ${remoteName} not found or not a Linear workspace`);
  }

  const client = new LinearClient(remote);
  const issues = await client.listIssues(remote.teamId);

  console.log("\nLinear Issues:\n");
  issues.forEach((issue: any) => {
    console.log(`  ${issue.title}`);
    console.log(`    State: ${issue.state.name}`);
    if (issue.assignee) {
      console.log(`    Assignee: ${issue.assignee.name}`);
    }
    if (issue.dueDate) {
      console.log(`    Due: ${issue.dueDate}`);
    }
    console.log(`    URL: ${issue.url}`);
    console.log();
  });
}

async function createIssue(args: any, config: Config) {
  const remoteName = args.remote || "linear";
  const remote = config.remotes[remoteName] as unknown as LinearRemote;

  if (!remote || remote.type !== "linear-workspace") {
    throw new Error(`Remote ${remoteName} not found or not a Linear workspace`);
  }

  if (!args.title) {
    throw new Error("Issue title is required");
  }

  if (!remote.teamId) {
    throw new Error("Team ID not configured for this remote");
  }

  const client = new LinearClient(remote);
  const issue = await client.createIssue(args.title, args.description, remote.teamId);

  console.log(`\n✓ Created issue: ${issue.title}`);
  console.log(`  URL: ${issue.url}`);
}

async function listTeams(args: any, config: Config) {
  const remoteName = args.remote || "linear";
  const remote = config.remotes[remoteName] as unknown as LinearRemote;

  if (!remote || remote.type !== "linear-workspace") {
    throw new Error(`Remote ${remoteName} not found or not a Linear workspace`);
  }

  const client = new LinearClient(remote);
  const teams = await client.listTeams();

  console.log("\nLinear Teams:\n");
  teams.forEach((team: any) => {
    console.log(`  ${team.name} (${team.key})`);
    console.log(`    ID: ${team.id}`);
    console.log();
  });
}

// Plugin definition
const LinearPlugin: ChittyPlugin = {
  metadata: {
    name: "@chitty/linear",
    version: "1.0.0",
    description: "Manage Linear issues and sync with Notion",
    author: "ChittyTracker",
    homepage: "https://github.com/chittytracker/chittytracker",
  },

  remoteTypes: [
    {
      type: "linear-workspace",
      schema: {
        apiKey: { type: "string", required: true },
        workspaceId: { type: "string", required: false },
        teamId: { type: "string", required: false },
      },
      validate: (config: any) => {
        if (!config.apiKey) return "apiKey is required";
        return true;
      },
    },
  ],

  commands: [
    {
      name: "linear issues",
      description: "List all Linear issues",
      handler: listIssues,
      options: {
        remote: { type: "string", description: "Remote name", default: "linear" },
      },
    },
    {
      name: "linear issue create",
      description: "Create a new issue",
      handler: createIssue,
      options: {
        remote: { type: "string", description: "Remote name", default: "linear" },
        title: { type: "string", description: "Issue title", required: true },
        description: { type: "string", description: "Issue description" },
      },
    },
    {
      name: "linear teams",
      description: "List all teams",
      handler: listTeams,
      options: {
        remote: { type: "string", description: "Remote name", default: "linear" },
      },
    },
  ],

  async init(config: Config) {
    console.log("[chitty] Linear extension loaded");
  },
};

export default LinearPlugin;
