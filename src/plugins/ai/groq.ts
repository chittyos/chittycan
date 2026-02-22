import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface GroqRemote {
  type: "groq";
  apiKey: string;
  defaultModel?: string;
}

/**
 * Groq Fast Inference Connector
 * Lightning-fast LLM inference on LPU hardware
 */
class GroqClient {
  constructor(
    private apiKey: string,
    private defaultModel: string = "llama-3.2-90b-text-preview"
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.groq.com/openai/v1${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: any = await response.json().catch(() => ({}));
      throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // Chat completions (OpenAI-compatible)
  async chat(messages: Array<{ role: string; content: string }>, options: any = {}) {
    return this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.defaultModel,
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

  // Streaming helper
  async *chatStream(messages: Array<{ role: string; content: string }>, options: any = {}) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
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

  // List models
  async listModels() {
    return this.request("/models");
  }
}

// Command Handlers
const commands: CommandDefinition[] = [
  {
    name: "groq",
    description: "Groq fast inference commands",
    subcommands: {
      chat: {
        description: "Ultra-fast chat with Groq LPUs",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "groq"] as unknown as GroqRemote;
          const client = new GroqClient(remote.apiKey, remote.defaultModel);

          const startTime = Date.now();
          const response = await client.complete(args.prompt, {
            model: args.model,
            temperature: args.temperature,
            maxTokens: args.maxTokens,
          });
          const elapsed = Date.now() - startTime;

          console.log(response);
          console.log(`\n⚡ Response time: ${elapsed}ms`);
        },
      },
      stream: {
        description: "Stream ultra-fast response",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "groq"] as unknown as GroqRemote;
          const client = new GroqClient(remote.apiKey, remote.defaultModel);

          const startTime = Date.now();
          process.stdout.write("Groq: ");

          let firstTokenTime = 0;
          let tokenCount = 0;

          for await (const chunk of client.chatStream(
            [{ role: "user", content: args.prompt }],
            { model: args.model }
          )) {
            if (!firstTokenTime) {
              firstTokenTime = Date.now() - startTime;
            }
            tokenCount++;
            process.stdout.write(chunk);
          }

          const totalTime = Date.now() - startTime;
          const tokensPerSec = (tokenCount / totalTime) * 1000;

          process.stdout.write(`\n\n⚡ TTFT: ${firstTokenTime}ms | Total: ${totalTime}ms | ${tokensPerSec.toFixed(0)} tok/s\n`);
        },
      },
      models: {
        description: "List available models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "groq"] as unknown as GroqRemote;
          const client = new GroqClient(remote.apiKey);

          const result: any = await client.listModels();
          console.log("Available Groq Models:");
          result.data.forEach((model: any) => {
            console.log(`  - ${model.id}`);
          });
          console.log("\nRecommended:");
          console.log("  - llama-3.2-90b-text-preview (best quality)");
          console.log("  - llama-3.2-11b-text-preview (fast)");
          console.log("  - mixtral-8x7b-32768 (large context)");
        },
      },
    },
  },
];

// Remote Type Definition
const remoteType: RemoteTypeDefinition = {
  type: "groq",
  name: "Groq",
  description: "Groq - Lightning-fast LLM inference on LPU hardware",
  configFields: [
    {
      name: "apiKey",
      description: "Groq API Key",
      required: true,
      sensitive: true,
    },
    {
      name: "defaultModel",
      description: "Default model to use",
      required: false,
      default: "llama-3.2-90b-text-preview",
    },
  ],
};

// Plugin Export
export const groqPlugin: ChittyPlugin = {
  metadata: {
    name: "groq",
    version: "1.0.0",
    description: "Groq fast inference connector - ultra-fast, drop in anywhere",
    author: "ChittyCan Team",
    homepage: "https://groq.com",
  },
  remoteTypes: [remoteType],
  commands,
  async init(config: Config) {
    console.log("✓ Groq fast inference connector initialized");
  },
};

export { GroqClient };
export default groqPlugin;
