import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface OpenAIRemote {
  type: "openai";
  apiKey: string;
  organization?: string;
  defaultModel?: string;
  baseUrl?: string;
}

/**
 * OpenAI Platform Connector
 * Drop-in at any juncture in your async workstream
 */
class OpenAIClient {
  constructor(
    private apiKey: string,
    private options: {
      organization?: string;
      baseUrl?: string;
      defaultModel?: string;
    } = {}
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const baseUrl = this.options.baseUrl || "https://api.openai.com/v1";
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(this.options.organization ? { "OpenAI-Organization": this.options.organization } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: any = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // Chat Completions
  async chat(messages: Array<{ role: string; content: string }>, options: any = {}) {
    return this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.options.defaultModel || "gpt-4",
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: options.stream ?? false,
        ...options,
      }),
    });
  }

  // Simple completion helper
  async complete(prompt: string, options: any = {}) {
    const response: any = await this.chat(
      [{ role: "user", content: prompt }],
      options
    );
    return response.choices[0].message.content;
  }

  // List Models
  async listModels() {
    return this.request("/models");
  }

  // Get Model Info
  async getModel(modelId: string) {
    return this.request(`/models/${modelId}`);
  }

  // Embeddings
  async createEmbedding(input: string | string[], model: string = "text-embedding-3-small") {
    return this.request("/embeddings", {
      method: "POST",
      body: JSON.stringify({ model, input }),
    });
  }

  // Images
  async generateImage(prompt: string, options: any = {}) {
    return this.request("/images/generations", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        model: options.model || "dall-e-3",
        n: options.n || 1,
        size: options.size || "1024x1024",
        quality: options.quality || "standard",
      }),
    });
  }

  // Assistants (beta)
  async createAssistant(config: any) {
    return this.request("/assistants", {
      method: "POST",
      body: JSON.stringify(config),
      headers: { "OpenAI-Beta": "assistants=v2" },
    });
  }

  async listAssistants() {
    return this.request("/assistants", {
      headers: { "OpenAI-Beta": "assistants=v2" },
    });
  }

  // Streaming helper
  async *chatStream(messages: Array<{ role: string; content: string }>, options: any = {}) {
    const baseUrl = this.options.baseUrl || "https://api.openai.com/v1";
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(this.options.organization ? { "OpenAI-Organization": this.options.organization } : {}),
      },
      body: JSON.stringify({
        model: options.model || this.options.defaultModel || "gpt-4",
        messages,
        stream: true,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
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
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "openai",
    description: "OpenAI platform commands",
    subcommands: {
      chat: {
        description: "Chat with GPT models (auto-briefed with project context)",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "openai"] as unknown as OpenAIRemote;
          const client = new OpenAIClient(remote.apiKey, {
            organization: remote.organization,
            baseUrl: remote.baseUrl,
            defaultModel: remote.defaultModel,
          });

          // Auto-brief the AI with project context
          let prompt = args.prompt;
          if (args.brief !== false) {
            const { briefAI } = await import("./stemcell-integration.js");
            prompt = await briefAI({ task: args.prompt, projectPath: args.project });
          }

          const response = await client.complete(prompt, {
            model: args.model,
            temperature: args.temperature,
            maxTokens: args.maxTokens,
          });

          console.log(response);
        },
      },
      stream: {
        description: "Stream chat response",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "openai"] as unknown as OpenAIRemote;
          const client = new OpenAIClient(remote.apiKey, {
            organization: remote.organization,
            baseUrl: remote.baseUrl,
            defaultModel: remote.defaultModel,
          });

          process.stdout.write("Response: ");
          for await (const chunk of client.chatStream(
            [{ role: "user", content: args.prompt }],
            { model: args.model }
          )) {
            process.stdout.write(chunk);
          }
          process.stdout.write("\n");
        },
      },
      models: {
        description: "List available models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "openai"] as unknown as OpenAIRemote;
          const client = new OpenAIClient(remote.apiKey, {
            organization: remote.organization,
            baseUrl: remote.baseUrl,
          });

          const result: any = await client.listModels();
          console.log("Available Models:");
          result.data.forEach((model: any) => {
            console.log(`  - ${model.id}`);
          });
        },
      },
      image: {
        description: "Generate image with DALL-E",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "openai"] as unknown as OpenAIRemote;
          const client = new OpenAIClient(remote.apiKey, {
            organization: remote.organization,
            baseUrl: remote.baseUrl,
          });

          const result: any = await client.generateImage(args.prompt, {
            model: args.model,
            size: args.size,
            quality: args.quality,
          });

          console.log("Image URL:", result.data[0].url);
        },
      },
      assistants: {
        description: "List assistants",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "openai"] as unknown as OpenAIRemote;
          const client = new OpenAIClient(remote.apiKey, {
            organization: remote.organization,
            baseUrl: remote.baseUrl,
          });

          const result: any = await client.listAssistants();
          console.log("Assistants:");
          result.data.forEach((assistant: any) => {
            console.log(`  - ${assistant.name || assistant.id}: ${assistant.model}`);
          });
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "openai",
  name: "OpenAI",
  description: "OpenAI Platform (GPT-4, GPT-3.5, DALL-E, Embeddings)",
  configFields: [
    {
      name: "apiKey",
      description: "OpenAI API Key",
      required: true,
      sensitive: true,
    },
    {
      name: "organization",
      description: "Organization ID (optional)",
      required: false,
      sensitive: true,
    },
    {
      name: "defaultModel",
      description: "Default model to use",
      required: false,
      default: "gpt-4",
    },
    {
      name: "baseUrl",
      description: "API base URL (for proxies/compatible APIs)",
      required: false,
      default: "https://api.openai.com/v1",
    },
  ],
};

// Plugin Export
export const openaiPlugin: ChittyPlugin = {
  metadata: {
    name: "openai",
    version: "1.0.0",
    description: "OpenAI Platform connector - drop in at any juncture",
    author: "ChittyCan Team",
    homepage: "https://platform.openai.com",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ OpenAI connector initialized");
  },
};

export { OpenAIClient };
export default openaiPlugin;
