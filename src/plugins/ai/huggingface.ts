import type { ChittyPlugin, CommandDefinition, RemoteTypeDefinition } from "@/lib/plugin";
import type { Config } from "@/lib/config";

interface HuggingFaceRemote {
  type: "huggingface";
  apiKey: string;
  defaultModel?: string;
}

class HuggingFaceClient {
  constructor(private apiKey: string, private defaultModel: string = "meta-llama/Llama-3.1-70B-Instruct") {}

  private async request(model: string, inputs: any) {
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.statusText}`);
    }

    return response.json();
  }

  async complete(prompt: string, options: any = {}) {
    const result: any = await this.request(options.model || this.defaultModel, prompt);
    return Array.isArray(result) ? result[0]?.generated_text : result.generated_text;
  }
}

const commands: CommandDefinition[] = [
  {
    name: "huggingface",
    description: "Hugging Face commands",
    subcommands: {
      chat: {
        description: "Run Hugging Face models",
        handler: async (args: any, config: Config) => {
          const remote = config.remotes[args.remote || "huggingface"] as unknown as HuggingFaceRemote;
          const client = new HuggingFaceClient(remote.apiKey, remote.defaultModel);
          const response = await client.complete(args.prompt, { model: args.model });
          console.log(response);
        },
      },
    },
  },
];

const remoteType: RemoteTypeDefinition = {
  type: "huggingface",
  name: "Hugging Face",
  description: "Hugging Face - Thousands of open models",
  configFields: [
    { name: "apiKey", description: "Hugging Face API Key", required: true, sensitive: true },
    { name: "defaultModel", description: "Default model", required: false },
  ],
};

export const huggingfacePlugin: ChittyPlugin = {
  metadata: {
    name: "huggingface",
    version: "1.0.0",
    description: "Hugging Face connector - thousands of models",
    author: "ChittyCan Team",
  },
  remoteTypes: [remoteType],
  commands,
  async init() {
    console.log("✓ Hugging Face connector initialized");
  },
};

export default huggingfacePlugin;
