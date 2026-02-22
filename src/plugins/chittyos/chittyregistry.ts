import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface ChittyRegistryRemote {
  type: "chittyregistry";
  baseUrl: string;
  apiToken: string;
}

/**
 * ChittyRegistry Client - Universal tool/script registry and service discovery
 */
class ChittyRegistryClient {
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
      throw new Error(`ChittyRegistry API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Tool Registry
  async listTools(filters?: { category?: string; tags?: string[] }) {
    const params = new URLSearchParams();
    if (filters?.category) params.append("category", filters.category);
    if (filters?.tags) params.append("tags", filters.tags.join(","));

    return this.request(`/api/v1/tools?${params}`);
  }

  async getTool(toolId: string) {
    return this.request(`/api/v1/tools/${toolId}`);
  }

  async registerTool(tool: {
    name: string;
    description: string;
    version: string;
    category: string;
    tags?: string[];
    executable?: string;
    schema?: any;
  }) {
    return this.request("/api/v1/tools", {
      method: "POST",
      body: JSON.stringify(tool),
    });
  }

  async updateTool(toolId: string, updates: any) {
    return this.request(`/api/v1/tools/${toolId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteTool(toolId: string) {
    return this.request(`/api/v1/tools/${toolId}`, {
      method: "DELETE",
    });
  }

  async searchTools(query: string) {
    return this.request(`/api/v1/tools/search?q=${encodeURIComponent(query)}`);
  }

  // Service Discovery
  async listServices(filters?: { status?: string; environment?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.environment) params.append("environment", filters.environment);

    return this.request(`/api/v1/services?${params}`);
  }

  async getService(serviceId: string) {
    return this.request(`/api/v1/services/${serviceId}`);
  }

  async registerService(service: {
    name: string;
    url: string;
    version: string;
    healthEndpoint?: string;
    description?: string;
    environment?: string;
  }) {
    return this.request("/api/v1/services", {
      method: "POST",
      body: JSON.stringify(service),
    });
  }

  async updateServiceStatus(serviceId: string, status: "active" | "degraded" | "down") {
    return this.request(`/api/v1/services/${serviceId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  async checkServiceHealth(serviceId: string) {
    return this.request(`/api/v1/services/${serviceId}/health`, {
      method: "POST",
    });
  }

  async discoverService(serviceName: string) {
    return this.request(`/api/v1/services/discover/${serviceName}`);
  }

  // Scripts & Automation
  async listScripts(category?: string) {
    const params = category ? `?category=${category}` : "";
    return this.request(`/api/v1/scripts${params}`);
  }

  async getScript(scriptId: string) {
    return this.request(`/api/v1/scripts/${scriptId}`);
  }

  async registerScript(script: {
    name: string;
    description: string;
    language: string;
    code?: string;
    url?: string;
    category: string;
  }) {
    return this.request("/api/v1/scripts", {
      method: "POST",
      body: JSON.stringify(script),
    });
  }

  async executeScript(scriptId: string, params: any = {}) {
    return this.request(`/api/v1/scripts/${scriptId}/execute`, {
      method: "POST",
      body: JSON.stringify({ params }),
    });
  }

  // Versioning & Releases
  async listVersions(toolId: string) {
    return this.request(`/api/v1/tools/${toolId}/versions`);
  }

  async publishVersion(toolId: string, version: string, changelog: string) {
    return this.request(`/api/v1/tools/${toolId}/versions`, {
      method: "POST",
      body: JSON.stringify({ version, changelog }),
    });
  }

  // Statistics & Analytics
  async getToolStats(toolId: string) {
    return this.request(`/api/v1/tools/${toolId}/stats`);
  }

  async getPopularTools(limit: number = 10) {
    return this.request(`/api/v1/tools/popular?limit=${limit}`);
  }

  async getRecentTools(limit: number = 10) {
    return this.request(`/api/v1/tools/recent?limit=${limit}`);
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "registry",
    description: "ChittyRegistry tool and service discovery commands",
    subcommands: {
      // Tool commands
      "tools list": {
        description: "List all registered tools",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const tools: any = await client.listTools(args.filters);
          console.log(`Found ${tools.length} tools:`);
          tools.forEach((tool: any) => {
            console.log(`  - ${tool.name} v${tool.version} - ${tool.description}`);
          });
        },
      },
      "tool get": {
        description: "Get tool details",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const tool = await client.getTool(args.id);
          console.log(JSON.stringify(tool, null, 2));
        },
      },
      "tool register": {
        description: "Register a new tool",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);

          // Read tool definition from file if provided
          let toolDef = args.tool;
          if (args.file) {
            const fs = await import("fs/promises");
            const content = await fs.readFile(args.file, "utf-8");
            toolDef = JSON.parse(content);
          }

          const result: any = await client.registerTool(toolDef);
          console.log("✓ Tool registered:", result.id);
        },
      },
      "tool search": {
        description: "Search for tools",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const results: any = await client.searchTools(args.query);
          console.log(`Found ${results.length} matching tools:`);
          results.forEach((tool: any) => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
        },
      },

      // Service commands
      "services list": {
        description: "List all registered services",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const services: any = await client.listServices(args.filters);
          console.log(`ChittyOS Services (${services.length}):`);
          services.forEach((svc: any) => {
            console.log(`  - ${svc.name} (${svc.status}) - ${svc.url}`);
          });
        },
      },
      "service get": {
        description: "Get service details",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const service: any = await client.getService(args.id);
          console.log(JSON.stringify(service, null, 2));
        },
      },
      "service register": {
        description: "Register a new service",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.registerService({
            name: args.name,
            url: args.url,
            version: args.version,
            healthEndpoint: args.health,
            description: args.description,
            environment: args.environment || "production",
          });
          console.log("✓ Service registered:", result.id);
        },
      },
      "service health": {
        description: "Check service health",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const health: any = await client.checkServiceHealth(args.id);
          console.log("Health Status:", health.status);
          console.log("Response Time:", health.responseTime + "ms");
        },
      },
      "service discover": {
        description: "Discover service by name",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const service: any = await client.discoverService(args.name);
          console.log("Service discovered:");
          console.log(`  Name: ${service.name}`);
          console.log(`  URL: ${service.url}`);
          console.log(`  Version: ${service.version}`);
          console.log(`  Status: ${service.status}`);
        },
      },

      // Script commands
      "scripts list": {
        description: "List all scripts",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const scripts: any = await client.listScripts(args.category);
          console.log(`Scripts (${scripts.length}):`);
          scripts.forEach((script: any) => {
            console.log(`  - ${script.name} [${script.language}] - ${script.description}`);
          });
        },
      },
      "script execute": {
        description: "Execute a script",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.executeScript(args.id, args.params || {});
          console.log("Script output:");
          console.log(result.output);
        },
      },

      // Analytics commands
      "tools popular": {
        description: "Show popular tools",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "registry"] as unknown as ChittyRegistryRemote;
          const client = new ChittyRegistryClient(remote.baseUrl, remote.apiToken);
          const tools: any = await client.getPopularTools(args.limit || 10);
          console.log("Most Popular Tools:");
          tools.forEach((tool: any, i: number) => {
            console.log(`  ${i + 1}. ${tool.name} (${tool.downloads} downloads)`);
          });
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "chittyregistry",
  name: "ChittyRegistry",
  description: "Universal tool/script registry and service discovery",
  configFields: [
    {
      name: "baseUrl",
      description: "ChittyRegistry API base URL",
      required: true,
      default: "https://registry.chitty.cc",
    },
    {
      name: "apiToken",
      description: "ChittyRegistry API token",
      required: true,
      sensitive: true,
    },
  ],
};

// Plugin Export
export const chittyregistryPlugin: ChittyPlugin = {
  metadata: {
    name: "chittyregistry",
    version: "0.1.0",
    description: "ChittyRegistry integration - Tool registry and service discovery",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ ChittyRegistry plugin initialized");
  },
};

export default chittyregistryPlugin;
