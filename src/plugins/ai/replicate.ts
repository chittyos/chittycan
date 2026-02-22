import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface ReplicateRemote {
  type: "replicate";
  apiKey: string;
  defaultModel?: string;
}

class ReplicateClient {
  constructor(private apiKey: string, private defaultModel: string = "meta/llama-2-70b-chat") {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.replicate.com/v1${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Token ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Replicate API error: ${response.statusText}`);
    }

    return response.json();
  }

  async run(model: string, input: any) {
    return this.request("/predictions", {
      method: "POST",
      body: JSON.stringify({ version: model, input }),
    });
  }

  async complete(prompt: string, options: any = {}) {
    const prediction: any = await this.run(options.model || this.defaultModel, {
      prompt,
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature ?? 0.75,
    });

    // Poll for completion
    let result = prediction;
    while (result.status === "starting" || result.status === "processing") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await this.request(`/predictions/${result.id}`);
    }

    return result.output?.join("");
  }
}

const commands: CommandDefinition[] = [
  {
    name: "replicate",
    description: "Replicate platform commands",
    subcommands: {
      chat: {
        description: "Run model on Replicate",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "replicate"] as unknown as ReplicateRemote;
          const client = new ReplicateClient(remote.apiKey, remote.defaultModel);
          const response = await client.complete(args.prompt, { model: args.model });
          console.log(response);
        },
      },
    },
  },
];

const remoteType: RemoteTypeDefinition = {
  type: "replicate",
  name: "Replicate",
  description: "Replicate - Run any AI model in the cloud",
  configFields: [
    { name: "apiKey", description: "Replicate API Key", required: true, sensitive: true },
    { name: "defaultModel", description: "Default model", required: false },
  ],
};

export const replicatePlugin: ChittyPlugin = {
  metadata: {
    name: "replicate",
    version: "1.0.0",
    description: "Replicate connector - any model, drop in anywhere",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init() {
    console.log("✓ Replicate connector initialized");
  },
};

export default replicatePlugin;
