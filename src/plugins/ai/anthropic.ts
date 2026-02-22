import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface AnthropicRemote {
  type: "anthropic";
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

/**
 * Anthropic Platform Connector
 * Drop-in Claude at any juncture in your async workstream
 */
class AnthropicClient {
  constructor(
    private apiKey: string,
    private options: {
      baseUrl?: string;
      defaultModel?: string;
    } = {}
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const baseUrl = this.options.baseUrl || "https://api.anthropic.com/v1";
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: any = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // Messages API
  async createMessage(messages: Array<{ role: string; content: string }>, options: any = {}) {
    return this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.options.defaultModel || "claude-sonnet-4-5-20250929",
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1.0,
        system: options.system,
        stream: options.stream ?? false,
        ...options,
      }),
    });
  }

  // Simple completion helper
  async complete(prompt: string, options: any = {}) {
    const response: any = await this.createMessage(
      [{ role: "user", content: prompt }],
      options
    );
    return response.content[0].text;
  }

  // Streaming helper
  async *messageStream(messages: Array<{ role: string; content: string }>, options: any = {}) {
    const baseUrl = this.options.baseUrl || "https://api.anthropic.com/v1";
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || this.options.defaultModel || "claude-sonnet-4-5-20250929",
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1.0,
        system: options.system,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta") {
              const text = parsed.delta?.text;
              if (text) yield text;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Get usage info
  async getUsage() {
    // Anthropic doesn't have a usage endpoint yet
    // Return mock data for now
    return {
      note: "Anthropic API doesn't provide usage endpoint. Check dashboard at console.anthropic.com",
    };
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "anthropic",
    description: "Anthropic Claude platform commands",
    subcommands: {
      chat: {
        description: "Chat with Claude models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "anthropic"] as unknown as AnthropicRemote;
          const client = new AnthropicClient(remote.apiKey, {
            baseUrl: remote.baseUrl,
            defaultModel: remote.defaultModel,
          });

          const response = await client.complete(args.prompt, {
            model: args.model,
            temperature: args.temperature,
            maxTokens: args.maxTokens,
            system: args.system,
          });

          console.log(response);
        },
      },
      stream: {
        description: "Stream chat response",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "anthropic"] as unknown as AnthropicRemote;
          const client = new AnthropicClient(remote.apiKey, {
            baseUrl: remote.baseUrl,
            defaultModel: remote.defaultModel,
          });

          process.stdout.write("Claude: ");
          for await (const chunk of client.messageStream(
            [{ role: "user", content: args.prompt }],
            { model: args.model, system: args.system }
          )) {
            process.stdout.write(chunk);
          }
          process.stdout.write("\n");
        },
      },
      models: {
        description: "List available models",
        handler: async () => {
          console.log("Available Claude Models:");
          console.log("  - claude-sonnet-4-5-20250929 (recommended)");
          console.log("  - claude-sonnet-4-20250514");
          console.log("  - claude-opus-4-20250514");
          console.log("  - claude-3-5-sonnet-20241022");
          console.log("  - claude-3-5-haiku-20241022");
          console.log("\nNote: Anthropic doesn't provide a models endpoint");
        },
      },
      usage: {
        description: "Get API usage info",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "anthropic"] as unknown as AnthropicRemote;
          const client = new AnthropicClient(remote.apiKey, {
            baseUrl: remote.baseUrl,
          });

          const usage = await client.getUsage();
          console.log(JSON.stringify(usage, null, 2));
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "anthropic",
  name: "Anthropic Claude",
  description: "Anthropic Claude Platform (Sonnet, Opus, Haiku)",
  configFields: [
    {
      name: "apiKey",
      description: "Anthropic API Key",
      required: true,
      sensitive: true,
    },
    {
      name: "defaultModel",
      description: "Default model to use",
      required: false,
      default: "claude-sonnet-4-5-20250929",
    },
    {
      name: "baseUrl",
      description: "API base URL (for proxies)",
      required: false,
      default: "https://api.anthropic.com/v1",
    },
  ],
};

// Plugin Export
export const anthropicPlugin: ChittyPlugin = {
  metadata: {
    name: "anthropic",
    version: "1.0.0",
    description: "Anthropic Claude connector - drop in at any juncture",
    author: "ChittyCan Team",
    homepage: "https://console.anthropic.com",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ Anthropic Claude connector initialized");
  },
};

export { AnthropicClient };
export default anthropicPlugin;
