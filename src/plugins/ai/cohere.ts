import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface CohereRemote {
  type: "cohere";
  apiKey: string;
  defaultModel?: string;
}

class CohereClient {
  constructor(private apiKey: string, private defaultModel: string = "command-r-plus") {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.cohere.com/v1${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    return response.json();
  }

  async chat(message: string, options: any = {}) {
    return this.request("/chat", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        message,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens,
      }),
    });
  }

  async complete(prompt: string, options: any = {}) {
    const response: any = await this.chat(prompt, options);
    return response.text;
  }
}

const commands: CommandDefinition[] = [
  {
    name: "cohere",
    description: "Cohere platform commands",
    subcommands: {
      chat: {
        description: "Chat with Cohere models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "cohere"] as unknown as CohereRemote;
          const client = new CohereClient(remote.apiKey, remote.defaultModel);
          const response = await client.complete(args.prompt, { model: args.model });
          console.log(response);
        },
      },
    },
  },
];

const remoteType: RemoteTypeDefinition = {
  type: "cohere",
  name: "Cohere",
  description: "Cohere - Enterprise AI with RAG support",
  configFields: [
    { name: "apiKey", description: "Cohere API Key", required: true, sensitive: true },
    { name: "defaultModel", description: "Default model", required: false },
  ],
};

export const coherePlugin: ChittyPlugin = {
  metadata: {
    name: "cohere",
    version: "1.0.0",
    description: "Cohere connector - enterprise RAG and chat",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init() {
    console.log("✓ Cohere connector initialized");
  },
};

export default coherePlugin;
