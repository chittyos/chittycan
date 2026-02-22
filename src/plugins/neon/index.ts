/**
 * Neon PostgreSQL Extension for ChittyTracker
 * Manage databases, branches, migrations, schema
 */

import type { ChittyPlugin } from "../../lib/plugin.js";
import type { Config } from "../../lib/config.js";

export interface NeonRemote {
  type: "neon-project";
  projectId: string;
  apiKey: string;
  defaultBranch?: string;
}

class NeonClient {
  private projectId: string;
  private apiKey: string;

  constructor(remote: NeonRemote) {
    this.projectId = remote.projectId;
    this.apiKey = remote.apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `https://console.neon.tech/api/v2${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Neon API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Projects
  async getProject() {
    return this.request(`/projects/${this.projectId}`);
  }

  async listProjects() {
    return this.request(`/projects`);
  }

  // Branches
  async listBranches() {
    return this.request(`/projects/${this.projectId}/branches`);
  }

  async createBranch(name: string, parentId?: string) {
    return this.request(`/projects/${this.projectId}/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: { name, parent_id: parentId },
      }),
    });
  }

  async deleteBranch(branchId: string) {
    return this.request(`/projects/${this.projectId}/branches/${branchId}`, {
      method: "DELETE",
    });
  }

  // Databases
  async listDatabases(branchId: string) {
    return this.request(`/projects/${this.projectId}/branches/${branchId}/databases`);
  }

  async createDatabase(branchId: string, name: string, owner: string) {
    return this.request(`/projects/${this.projectId}/branches/${branchId}/databases`, {
      method: "POST",
      body: JSON.stringify({
        database: { name, owner_name: owner },
      }),
    });
  }

  // Endpoints (connection strings)
  async listEndpoints() {
    return this.request(`/projects/${this.projectId}/endpoints`);
  }

  async getConnectionString(branchId: string, databaseName: string) {
    const endpoints: any = await this.listEndpoints();
    const endpoint = endpoints.endpoints.find((e: any) => e.branch_id === branchId);

    if (!endpoint) {
      throw new Error(`No endpoint found for branch ${branchId}`);
    }

    return `postgresql://${endpoint.host}/${databaseName}`;
  }
}

// Command handlers
async function listBranches(args: any, config: Config) {
  const remoteName = args.remote || "db-prod";
  const remote = config.remotes[remoteName] as unknown as NeonRemote;

  if (!remote || remote.type !== "neon-project") {
    throw new Error(`Remote ${remoteName} not found or not a Neon project`);
  }

  const client = new NeonClient(remote);
  const result: any = await client.listBranches();

  console.log("\nNeon Branches:\n");
  result.branches?.forEach((branch: any) => {
    const current = branch.name === remote.defaultBranch ? " (default)" : "";
    console.log(`  ${branch.name}${current}`);
    console.log(`    ID: ${branch.id}`);
    console.log(`    Created: ${new Date(branch.created_at).toLocaleString()}`);
    console.log();
  });
}

async function createBranch(args: any, config: Config) {
  const remoteName = args.remote || "db-prod";
  const remote = config.remotes[remoteName] as unknown as NeonRemote;

  if (!remote || remote.type !== "neon-project") {
    throw new Error(`Remote ${remoteName} not found or not a Neon project`);
  }

  if (!args.name) {
    throw new Error("Branch name is required");
  }

  const client = new NeonClient(remote);
  const result: any = await client.createBranch(args.name, args.parent);

  console.log(`\n✓ Created branch: ${result.branch.name}`);
  console.log(`  ID: ${result.branch.id}`);
}

async function listDatabases(args: any, config: Config) {
  const remoteName = args.remote || "db-prod";
  const remote = config.remotes[remoteName] as unknown as NeonRemote;

  if (!remote || remote.type !== "neon-project") {
    throw new Error(`Remote ${remoteName} not found or not a Neon project`);
  }

  const client = new NeonClient(remote);
  const branches: any = await client.listBranches();

  console.log("\nNeon Databases:\n");

  for (const branch of branches.branches || []) {
    const databases: any = await client.listDatabases(branch.id);

    if (databases.databases?.length) {
      console.log(`Branch: ${branch.name}`);
      databases.databases.forEach((db: any) => {
        console.log(`  - ${db.name} (owner: ${db.owner_name})`);
      });
      console.log();
    }
  }
}

// Plugin definition
const NeonPlugin: ChittyPlugin = {
  metadata: {
    name: "@chitty/neon",
    version: "1.0.0",
    description: "Manage Neon PostgreSQL databases, branches, and migrations",
    author: "ChittyTracker",
    homepage: "https://github.com/chittytracker/chittytracker",
  },

  remoteTypes: [
    {
      type: "neon-project",
      schema: {
        projectId: { type: "string", required: true },
        apiKey: { type: "string", required: true },
        defaultBranch: { type: "string", required: false },
      },
      validate: (config: any) => {
        if (!config.projectId) return "projectId is required";
        if (!config.apiKey) return "apiKey is required";
        return true;
      },
    },
  ],

  commands: [
    {
      name: "neon branch list",
      description: "List all branches in Neon project",
      handler: listBranches,
      options: {
        remote: { type: "string", description: "Remote name", default: "db-prod" },
      },
    },
    {
      name: "neon branch create",
      description: "Create a new branch",
      handler: createBranch,
      options: {
        remote: { type: "string", description: "Remote name", default: "db-prod" },
        name: { type: "string", description: "Branch name", required: true },
        parent: { type: "string", description: "Parent branch ID" },
      },
    },
    {
      name: "neon db list",
      description: "List all databases",
      handler: listDatabases,
      options: {
        remote: { type: "string", description: "Remote name", default: "db-prod" },
      },
    },
  ],

  async init(config: Config) {
    console.log("[chitty] Neon extension loaded");
  },
};

export default NeonPlugin;
