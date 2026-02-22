import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface TogetherRemote {
  type: "together";
  apiKey: string;
  defaultModel?: string;
}

class TogetherClient {
  constructor(private apiKey: string, private defaultModel: string = "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo") {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.together.xyz/v1${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Together AI error: ${response.statusText}`);
    }

    return response.json();
  }

  async chat(messages: Array<{ role: string; content: string }>, options: any = {}) {
    return this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        max_tokens: options.maxTokens || 512,
        temperature: options.temperature ?? 0.7,
        stream: false,
      }),
    });
  }

  async complete(prompt: string, options: any = {}) {
    const response: any = await this.chat([{ role: "user", content: prompt }], options);
    return response.choices[0].message.content;
  }
}

const commands: CommandDefinition[] = [
  {
    name: "together",
    description: "Together AI commands",
    subcommands: {
      chat: {
        description: "Chat with Together AI models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "together"] as unknown as TogetherRemote;
          const client = new TogetherClient(remote.apiKey, remote.defaultModel);
          const response = await client.complete(args.prompt, { model: args.model });
          console.log(response);
        },
      },
    },
  },
];

const remoteType: RemoteTypeDefinition = {
  type: "together",
  name: "Together AI",
  description: "Together AI - Fast, affordable inference",
  configFields: [
    { name: "apiKey", description: "Together API Key", required: true, sensitive: true },
    { name: "defaultModel", description: "Default model", required: false },
  ],
};

export const togetherPlugin: ChittyPlugin = {
  metadata: {
    name: "together",
    version: "1.0.0",
    description: "Together AI connector - fast and affordable",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init() {
    console.log("✓ Together AI connector initialized");
  },
};

export default togetherPlugin;
