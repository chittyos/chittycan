import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface ChittyRouterRemote {
  type: "chittyrouter";
  baseUrl: string;
  apiToken: string;
  emailDomain?: string;
}

/**
 * ChittyRouter Client - AI-powered email gateway with multi-agent orchestration
 */
class ChittyRouterClient {
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
      throw new Error(`ChittyRouter API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Email Inbox Management
  async listInbox(filters?: { unread?: boolean; priority?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.unread !== undefined) params.append("unread", String(filters.unread));
    if (filters?.priority) params.append("priority", filters.priority);
    if (filters?.limit) params.append("limit", String(filters.limit));

    return this.request(`/api/v1/inbox?${params}`);
  }

  async getEmail(emailId: string) {
    return this.request(`/api/v1/inbox/${emailId}`);
  }

  async processInbox(dryRun: boolean = false) {
    return this.request("/api/v1/inbox/process", {
      method: "POST",
      body: JSON.stringify({ dryRun }),
    });
  }

  async getInboxStats() {
    return this.request("/api/v1/inbox/stats");
  }

  async archiveEmail(emailId: string) {
    return this.request(`/api/v1/inbox/${emailId}/archive`, {
      method: "POST",
    });
  }

  async markAsRead(emailId: string) {
    return this.request(`/api/v1/inbox/${emailId}/read`, {
      method: "POST",
    });
  }

  // AI Agent Management
  async listAgents() {
    return this.request("/api/v1/agents");
  }

  async getAgent(agentName: string) {
    return this.request(`/api/v1/agents/${agentName}`);
  }

  async invokeAgent(
    agentName: "triage" | "priority" | "response" | "document",
    emailId: string,
    options: any = {}
  ) {
    return this.request(`/api/v1/agents/${agentName}/invoke`, {
      method: "POST",
      body: JSON.stringify({ emailId, ...options }),
    });
  }

  async getAgentHistory(agentName: string, limit: number = 50) {
    return this.request(`/api/v1/agents/${agentName}/history?limit=${limit}`);
  }

  // Routing Rules
  async listRules() {
    return this.request("/api/v1/rules");
  }

  async getRule(ruleId: string) {
    return this.request(`/api/v1/rules/${ruleId}`);
  }

  async createRule(rule: {
    name: string;
    condition: string;
    action: string;
    priority?: number;
    enabled?: boolean;
  }) {
    return this.request("/api/v1/rules", {
      method: "POST",
      body: JSON.stringify(rule),
    });
  }

  async updateRule(ruleId: string, updates: any) {
    return this.request(`/api/v1/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteRule(ruleId: string) {
    return this.request(`/api/v1/rules/${ruleId}`, {
      method: "DELETE",
    });
  }

  async testRule(ruleId: string, emailSample: any) {
    return this.request(`/api/v1/rules/${ruleId}/test`, {
      method: "POST",
      body: JSON.stringify({ emailSample }),
    });
  }

  // AI Model Management
  async listModels() {
    return this.request("/api/v1/models");
  }

  async testModels() {
    return this.request("/api/v1/models/test", {
      method: "POST",
    });
  }

  async getFallbackChain() {
    return this.request("/api/v1/models/fallback-chain");
  }

  async updateFallbackChain(chain: string[]) {
    return this.request("/api/v1/models/fallback-chain", {
      method: "PUT",
      body: JSON.stringify({ chain }),
    });
  }

  async getModelUsage(modelName?: string) {
    const params = modelName ? `?model=${modelName}` : "";
    return this.request(`/api/v1/models/usage${params}`);
  }

  // Response Templates
  async listTemplates() {
    return this.request("/api/v1/templates");
  }

  async getTemplate(templateId: string) {
    return this.request(`/api/v1/templates/${templateId}`);
  }

  async createTemplate(template: {
    name: string;
    subject: string;
    body: string;
    category?: string;
  }) {
    return this.request("/api/v1/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async renderTemplate(templateId: string, variables: any) {
    return this.request(`/api/v1/templates/${templateId}/render`, {
      method: "POST",
      body: JSON.stringify({ variables }),
    });
  }

  // Draft Management
  async listDrafts() {
    return this.request("/api/v1/drafts");
  }

  async getDraft(draftId: string) {
    return this.request(`/api/v1/drafts/${draftId}`);
  }

  async createDraft(draft: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
  }) {
    return this.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(draft),
    });
  }

  async sendDraft(draftId: string) {
    return this.request(`/api/v1/drafts/${draftId}/send`, {
      method: "POST",
    });
  }

  // Analytics & Insights
  async getRoutingInsights(timeRange: string = "7d") {
    return this.request(`/api/v1/analytics/routing?range=${timeRange}`);
  }

  async getAgentPerformance(agentName?: string) {
    const params = agentName ? `?agent=${agentName}` : "";
    return this.request(`/api/v1/analytics/agents${params}`);
  }

  async getPriorityDistribution() {
    return this.request("/api/v1/analytics/priority");
  }

  // Health & Monitoring
  async getHealth() {
    return this.request("/health");
  }

  async getWorkerStatus() {
    return this.request("/api/v1/workers/status");
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "router",
    description: "ChittyRouter AI email gateway commands",
    subcommands: {
      // Inbox commands
      "inbox list": {
        description: "List inbox messages",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const emails: any = await client.listInbox(args.filters);
          console.log(`Inbox (${emails.length} messages):`);
          emails.forEach((email: any) => {
            console.log(`  [${email.priority}] ${email.from}: ${email.subject}`);
          });
        },
      },
      "inbox process": {
        description: "Process inbox with AI agents",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.processInbox(args.dryRun || false);
          console.log(`Processed ${result.processed} messages`);
          console.log(`Triaged: ${result.triaged}`);
          console.log(`Responded: ${result.responded}`);
        },
      },
      "inbox stats": {
        description: "Get inbox statistics",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const stats: any = await client.getInboxStats();
          console.log("Inbox Statistics:");
          console.log(`  Total: ${stats.total}`);
          console.log(`  Unread: ${stats.unread}`);
          console.log(`  High Priority: ${stats.highPriority}`);
          console.log(`  Pending Response: ${stats.pendingResponse}`);
        },
      },

      // Agent commands
      "agents list": {
        description: "List available AI agents",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const agents: any = await client.listAgents();
          console.log("Available Agents:");
          agents.forEach((agent: any) => {
            console.log(`  - ${agent.name}: ${agent.description}`);
            console.log(`    Status: ${agent.status} | Invocations: ${agent.invocations}`);
          });
        },
      },
      "agent invoke": {
        description: "Invoke an AI agent",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.invokeAgent(args.agent, args.emailId, args.options || {});
          console.log("Agent Result:");
          console.log(JSON.stringify(result, null, 2));
        },
      },
      "agent history": {
        description: "Get agent invocation history",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const history: any = await client.getAgentHistory(args.agent, args.limit);
          console.log(`Recent invocations of ${args.agent}:`);
          history.forEach((inv: any) => {
            console.log(`  ${inv.timestamp}: ${inv.result.summary}`);
          });
        },
      },

      // Rules commands
      "rules list": {
        description: "List routing rules",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const rules: any = await client.listRules();
          console.log(`Routing Rules (${rules.length}):`);
          rules.forEach((rule: any) => {
            const status = rule.enabled ? "✓" : "✗";
            console.log(`  ${status} ${rule.name}`);
            console.log(`    Condition: ${rule.condition}`);
            console.log(`    Action: ${rule.action}`);
          });
        },
      },
      "rule create": {
        description: "Create routing rule",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.createRule({
            name: args.name,
            condition: args.condition,
            action: args.action,
            priority: args.priority,
            enabled: args.enabled !== false,
          });
          console.log("✓ Rule created:", result.id);
        },
      },
      "rule test": {
        description: "Test routing rule",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const result: any = await client.testRule(args.ruleId, args.emailSample);
          console.log("Test Result:", result.matches ? "✓ Match" : "✗ No match");
        },
      },

      // Model commands
      "models list": {
        description: "List AI models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const models: any = await client.listModels();
          console.log("Available Models:");
          models.forEach((model: any) => {
            console.log(`  - ${model.name} (${model.provider})`);
            console.log(`    Status: ${model.status} | Latency: ${model.avgLatency}ms`);
          });
        },
      },
      "models test": {
        description: "Test all AI models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const results: any = await client.testModels();
          console.log("Model Test Results:");
          results.forEach((result: any) => {
            const status = result.success ? "✓" : "✗";
            console.log(`  ${status} ${result.model}: ${result.latency}ms`);
          });
        },
      },
      "models fallback-chain": {
        description: "Show AI model fallback chain",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const chain: any = await client.getFallbackChain();
          console.log("AI Model Fallback Chain:");
          chain.forEach((model: string, i: number) => {
            console.log(`  ${i + 1}. ${model}`);
          });
        },
      },

      // Template commands
      "templates list": {
        description: "List response templates",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const templates: any = await client.listTemplates();
          console.log(`Response Templates (${templates.length}):`);
          templates.forEach((tpl: any) => {
            console.log(`  - ${tpl.name} [${tpl.category}]`);
          });
        },
      },

      // Analytics commands
      "analytics routing": {
        description: "Get routing insights",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const insights: any = await client.getRoutingInsights(args.range || "7d");
          console.log("Routing Insights:");
          console.log(`  Total Routed: ${insights.totalRouted}`);
          console.log(`  Auto-Responded: ${insights.autoResponded}`);
          console.log(`  Avg Response Time: ${insights.avgResponseTime}`);
        },
      },
      "analytics agents": {
        description: "Get agent performance metrics",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "router"] as unknown as ChittyRouterRemote;
          const client = new ChittyRouterClient(remote.baseUrl, remote.apiToken);
          const performance: any = await client.getAgentPerformance(args.agent);
          console.log("Agent Performance:");
          Object.entries(performance).forEach(([agent, metrics]: [string, any]) => {
            console.log(`  ${agent}:`);
            console.log(`    Invocations: ${metrics.invocations}`);
            console.log(`    Success Rate: ${metrics.successRate}%`);
            console.log(`    Avg Latency: ${metrics.avgLatency}ms`);
          });
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "chittyrouter",
  name: "ChittyRouter",
  description: "AI-powered email gateway with multi-agent orchestration",
  configFields: [
    {
      name: "baseUrl",
      description: "ChittyRouter API base URL",
      required: true,
      default: "https://router.chitty.cc",
    },
    {
      name: "apiToken",
      description: "ChittyRouter API token",
      required: true,
      sensitive: true,
    },
    {
      name: "emailDomain",
      description: "Email domain for routing",
      required: false,
    },
  ],
};

// Plugin Export
export const chittyrouterPlugin: ChittyPlugin = {
  metadata: {
    name: "chittyrouter",
    version: "0.1.0",
    description: "ChittyRouter integration - AI email gateway and agent orchestration",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ ChittyRouter plugin initialized");
  },
};

export default chittyrouterPlugin;
