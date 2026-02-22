import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface OllamaRemote {
  type: "ollama";
  baseUrl: string;
  defaultModel?: string;
}

/**
 * Ollama Local Models Connector
 * Run models locally - perfect for privacy-sensitive workflows
 */
class OllamaClient {
  constructor(
    private baseUrl: string = "http://localhost:11434",
    private defaultModel: string = "llama3.2"
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Generate completion
  async generate(prompt: string, options: any = {}) {
    return this.request("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens,
          ...options,
        },
      }),
    });
  }

  // Chat completion
  async chat(messages: Array<{ role: string; content: string }>, options: any = {}) {
    return this.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens,
        },
      }),
    });
  }

  // Simple completion helper
  async complete(prompt: string, options: any = {}) {
    const response: any = await this.chat(
      [{ role: "user", content: prompt }],
      options
    );
    return response.message.content;
  }

  // Streaming chat
  async *chatStream(messages: Array<{ role: string; content: string }>, options: any = {}) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
          if (parsed.done) return;
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  // List local models
  async listModels() {
    return this.request("/api/tags");
  }

  // Pull model
  async pullModel(modelName: string) {
    return this.request("/api/pull", {
      method: "POST",
      body: JSON.stringify({ name: modelName, stream: false }),
    });
  }

  // Delete model
  async deleteModel(modelName: string) {
    return this.request("/api/delete", {
      method: "DELETE",
      body: JSON.stringify({ name: modelName }),
    });
  }

  // Show model info
  async showModel(modelName: string) {
    return this.request("/api/show", {
      method: "POST",
      body: JSON.stringify({ name: modelName }),
    });
  }

  // Create model from Modelfile
  async createModel(name: string, modelfile: string) {
    return this.request("/api/create", {
      method: "POST",
      body: JSON.stringify({ name, modelfile, stream: false }),
    });
  }

  // Copy model
  async copyModel(source: string, destination: string) {
    return this.request("/api/copy", {
      method: "POST",
      body: JSON.stringify({ source, destination }),
    });
  }

  // Generate embeddings
  async embeddings(model: string, prompt: string) {
    return this.request("/api/embeddings", {
      method: "POST",
      body: JSON.stringify({ model, prompt }),
    });
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "ollama",
    description: "Ollama local models commands",
    subcommands: {
      chat: {
        description: "Chat with local model",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl, remote.defaultModel);

          const response = await client.complete(args.prompt, {
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
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl, remote.defaultModel);

          process.stdout.write("Model: ");
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
        description: "List downloaded models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl);

          const result: any = await client.listModels();
          console.log("Downloaded Models:");
          result.models.forEach((model: any) => {
            const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
            console.log(`  - ${model.name} (${size} GB)`);
          });
        },
      },
      pull: {
        description: "Download a model",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl);

          console.log(`Pulling ${args.model}...`);
          await client.pullModel(args.model);
          console.log("✓ Model downloaded");
        },
      },
      info: {
        description: "Show model information",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl);

          const info: any = await client.showModel(args.model);
          console.log(JSON.stringify(info, null, 2));
        },
      },
      delete: {
        description: "Delete a model",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "ollama"] as unknown as OllamaRemote;
          const client = new OllamaClient(remote.baseUrl);

          await client.deleteModel(args.model);
          console.log(`✓ Deleted ${args.model}`);
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "ollama",
  name: "Ollama",
  description: "Ollama - Run local LLMs (Llama, Mistral, Phi, etc.)",
  configFields: [
    {
      name: "baseUrl",
      description: "Ollama API URL",
      required: true,
      default: "http://localhost:11434",
    },
    {
      name: "defaultModel",
      description: "Default model to use",
      required: false,
      default: "llama3.2",
    },
  ],
};

// Plugin Export
export const ollamaPlugin: ChittyPlugin = {
  metadata: {
    name: "ollama",
    version: "1.0.0",
    description: "Ollama local models connector - privacy-first, drop in anywhere",
    author: "ChittyCan Team",
    homepage: "https://ollama.com",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ Ollama local models connector initialized");
  },
};

export { OllamaClient };
export default ollamaPlugin;
