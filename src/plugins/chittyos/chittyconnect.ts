import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface ChittyConnectRemote {
  type: "chittyconnect";
  baseUrl: string;
  apiToken: string;
  mcpEnabled?: boolean;
  githubAppInstallation?: string;
}

/**
 * ChittyConnect Client - AI-intelligent integration spine
 * Capabilities: MCP server, integrations, OpenAPI, GitHub App, proxies
 */
class ChittyConnectClient {
  constructor(
    private baseUrl: string,
    private apiToken: string
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`ChittyConnect API error: ${response.statusText}`);
    }

    return response.json();
  }

  // MCP Server Management
  async startMcpServer() {
    return this.request("/api/v1/mcp/start", { method: "POST" });
  }

  async stopMcpServer() {
    return this.request("/api/v1/mcp/stop", { method: "POST" });
  }

  async getMcpStatus() {
    return this.request("/api/v1/mcp/status");
  }

  async listMcpTools() {
    return this.request("/api/v1/mcp/tools");
  }

  // Integrations
  async listIntegrations() {
    return this.request("/api/v1/integrations");
  }

  async addIntegration(provider: string, config: any) {
    return this.request("/api/v1/integrations", {
      method: "POST",
      body: JSON.stringify({ provider, config }),
    });
  }

  async testIntegration(integrationId: string) {
    return this.request(`/api/v1/integrations/${integrationId}/test`, {
      method: "POST",
    });
  }

  async removeIntegration(integrationId: string) {
    return this.request(`/api/v1/integrations/${integrationId}`, {
      method: "DELETE",
    });
  }

  // GitHub App
  async listGitHubWebhooks() {
    return this.request("/api/v1/github/webhooks");
  }

  async testGitHubWebhook(webhookId: string) {
    return this.request(`/api/v1/github/webhooks/${webhookId}/test`, {
      method: "POST",
    });
  }

  async syncGitHubRepo(owner: string, repo: string) {
    return this.request("/api/v1/github/sync", {
      method: "POST",
      body: JSON.stringify({ owner, repo }),
    });
  }

  async listGitHubInstallations() {
    return this.request("/api/v1/github/installations");
  }

  // OpenAPI / Custom GPT
  async exportOpenApiSpec() {
    return this.request("/api/v1/openapi/spec");
  }

  async validateOpenApiSpec() {
    return this.request("/api/v1/openapi/validate");
  }

  async createGptAction(name: string, description: string, endpoints: string[]) {
    return this.request("/api/v1/gpt-actions", {
      method: "POST",
      body: JSON.stringify({ name, description, endpoints }),
    });
  }

  async listGptActions() {
    return this.request("/api/v1/gpt-actions");
  }

  // Proxies
  async proxyNotion(action: string, params: any = {}) {
    return this.request("/api/v1/proxy/notion", {
      method: "POST",
      body: JSON.stringify({ action, params }),
    });
  }

  async proxyOpenAI(prompt: string, model?: string) {
    return this.request("/api/v1/proxy/openai", {
      method: "POST",
      body: JSON.stringify({ prompt, model }),
    });
  }

  async proxyGoogleCalendar(action: string, params: any = {}) {
    return this.request("/api/v1/proxy/gcal", {
      method: "POST",
      body: JSON.stringify({ action, params }),
    });
  }

  // Context & Memory
  async getContext(sessionId: string) {
    return this.request(`/api/v1/context/${sessionId}`);
  }

  async updateContext(sessionId: string, context: any) {
    return this.request(`/api/v1/context/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(context),
    });
  }

  async listSessions() {
    return this.request("/api/v1/sessions");
  }

  // Health & Monitoring
  async getHealth() {
    return this.request("/health");
  }

  async getMetrics() {
    return this.request("/api/v1/metrics");
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "connect",
    description: "ChittyConnect integration hub commands",
    subcommands: {
      // MCP commands
      "mcp start": {
        description: "Start MCP server",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.startMcpServer();
          console.log("✓ MCP server started:", result);
        },
      },
      "mcp stop": {
        description: "Stop MCP server",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.stopMcpServer();
          console.log("✓ MCP server stopped:", result);
        },
      },
      "mcp status": {
        description: "Get MCP server status",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const status = await client.getMcpStatus();
          console.log("MCP Status:", JSON.stringify(status, null, 2));
        },
      },
      "mcp tools": {
        description: "List MCP tools",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const tools: any = await client.listMcpTools();
          console.log("Available MCP Tools:");
          tools.forEach((tool: any) => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
        },
      },

      // Integration commands
      "integrations list": {
        description: "List all integrations",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const integrations: any = await client.listIntegrations();
          console.log("Integrations:");
          integrations.forEach((int: any) => {
            console.log(`  - ${int.provider} (${int.status})`);
          });
        },
      },
      "integration add": {
        description: "Add new integration",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.addIntegration(args.provider, args.config || {});
          console.log("✓ Integration added:", result);
        },
      },
      "integration test": {
        description: "Test integration",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.testIntegration(args.id);
          console.log("Test result:", result);
        },
      },

      // GitHub commands
      "github webhooks": {
        description: "List GitHub webhooks",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const webhooks: any = await client.listGitHubWebhooks();
          console.log("GitHub Webhooks:");
          webhooks.forEach((wh: any) => {
            console.log(`  - ${wh.event}: ${wh.url}`);
          });
        },
      },
      "github sync": {
        description: "Sync GitHub repository",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const [owner, repo] = args.repo.split("/");
          const result = await client.syncGitHubRepo(owner, repo);
          console.log("✓ Repository synced:", result);
        },
      },

      // OpenAPI commands
      "openapi export": {
        description: "Export OpenAPI spec",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const spec = await client.exportOpenApiSpec();
          console.log(JSON.stringify(spec, null, 2));
        },
      },
      "gpt-action create": {
        description: "Create Custom GPT action",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.createGptAction(
            args.name,
            args.description || "",
            args.endpoints || []
          );
          console.log("✓ GPT action created:", result);
        },
      },

      // Proxy commands
      "proxy notion": {
        description: "Proxy Notion API call",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result = await client.proxyNotion(args.action, args.params || {});
          console.log(JSON.stringify(result, null, 2));
        },
      },
      "proxy openai": {
        description: "Proxy OpenAI API call",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "connect"] as unknown as ChittyConnectRemote;
          const client = new ChittyConnectClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.proxyOpenAI(args.prompt, args.model);
          console.log(result.response);
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "chittyconnect",
  name: "ChittyConnect",
  description: "AI-intelligent integration spine with MCP, GitHub App, and proxies",
  configFields: [
    {
      name: "baseUrl",
      description: "ChittyConnect API base URL",
      required: true,
      default: "https://connect.chitty.cc",
    },
    {
      name: "apiToken",
      description: "ChittyConnect API token",
      required: true,
      sensitive: true,
    },
    {
      name: "mcpEnabled",
      description: "Enable MCP server",
      required: false,
      default: true,
    },
    {
      name: "githubAppInstallation",
      description: "GitHub App installation ID",
      required: false,
    },
  ],
};

// Plugin Export
export const chittyconnectPlugin: ChittyPlugin = {
  metadata: {
    name: "chittyconnect",
    version: "0.1.0",
    description: "ChittyConnect integration - MCP server, GitHub App, OpenAPI, proxies",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ ChittyConnect plugin initialized");
  },
};

export default chittyconnectPlugin;
