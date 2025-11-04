/**
 * AI Connector Tests
 */

import { describe, it, expect } from "vitest";
import { openaiPlugin } from "../src/plugins/ai/openai";
import { anthropicPlugin } from "../src/plugins/ai/anthropic";
import { ollamaPlugin } from "../src/plugins/ai/ollama";
import { groqPlugin } from "../src/plugins/ai/groq";
import { replicatePlugin } from "../src/plugins/ai/replicate";
import { togetherPlugin } from "../src/plugins/ai/together";
import { huggingfacePlugin } from "../src/plugins/ai/huggingface";
import { coherePlugin } from "../src/plugins/ai/cohere";
import { aiPlugins } from "../src/plugins/ai/index";

describe("AI Connectors", () => {
  it("should have valid metadata for all connectors", () => {
    const connectors = [
      openaiPlugin,
      anthropicPlugin,
      ollamaPlugin,
      groqPlugin,
      replicatePlugin,
      togetherPlugin,
      huggingfacePlugin,
      coherePlugin,
    ];

    connectors.forEach((plugin) => {
      expect(plugin.metadata).toBeDefined();
      expect(plugin.metadata.name).toBeDefined();
      expect(plugin.metadata.version).toBeDefined();
      expect(plugin.metadata.description).toBeDefined();
      expect(plugin.metadata.author).toBe("ChittyCan Team");
    });
  });

  it("should have remote type definitions", () => {
    const connectors = [
      openaiPlugin,
      anthropicPlugin,
      ollamaPlugin,
      groqPlugin,
      replicatePlugin,
      togetherPlugin,
      huggingfacePlugin,
      coherePlugin,
    ];

    connectors.forEach((plugin) => {
      expect(plugin.remoteTypes).toBeDefined();
      expect(plugin.remoteTypes?.length).toBeGreaterThan(0);

      const remoteType = plugin.remoteTypes![0];
      expect(remoteType.type).toBeDefined();
      expect(remoteType.name).toBeDefined();
      expect(remoteType.description).toBeDefined();
      expect(remoteType.configFields).toBeDefined();
    });
  });

  it("should have commands defined", () => {
    const connectors = [
      openaiPlugin,
      anthropicPlugin,
      ollamaPlugin,
      groqPlugin,
      replicatePlugin,
      togetherPlugin,
      huggingfacePlugin,
      coherePlugin,
    ];

    connectors.forEach((plugin) => {
      expect(plugin.commands).toBeDefined();
      expect(plugin.commands?.length).toBeGreaterThan(0);

      const command = plugin.commands![0];
      expect(command.name).toBeDefined();
      expect(command.description).toBeDefined();
      expect(command.subcommands).toBeDefined();
    });
  });

  it("should have init function", () => {
    const connectors = [
      openaiPlugin,
      anthropicPlugin,
      ollamaPlugin,
      groqPlugin,
      replicatePlugin,
      togetherPlugin,
      huggingfacePlugin,
      coherePlugin,
    ];

    connectors.forEach((plugin) => {
      expect(plugin.init).toBeDefined();
      expect(typeof plugin.init).toBe("function");
    });
  });

  it("should export all 8 plugins in collection", () => {
    expect(aiPlugins.length).toBe(8);

    const names = aiPlugins.map((p) => p.metadata.name);
    expect(names).toContain("openai");
    expect(names).toContain("anthropic");
    expect(names).toContain("ollama");
    expect(names).toContain("groq");
    expect(names).toContain("replicate");
    expect(names).toContain("together");
    expect(names).toContain("huggingface");
    expect(names).toContain("cohere");
  });

  it("should have chat subcommand for all connectors", () => {
    const connectors = [
      openaiPlugin,
      anthropicPlugin,
      ollamaPlugin,
      groqPlugin,
      replicatePlugin,
      togetherPlugin,
      huggingfacePlugin,
      coherePlugin,
    ];

    connectors.forEach((plugin) => {
      const command = plugin.commands![0];
      expect(command.subcommands).toBeDefined();
      expect(command.subcommands!["chat"]).toBeDefined();
      expect(command.subcommands!["chat"].description).toBeDefined();
      expect(command.subcommands!["chat"].handler).toBeDefined();
    });
  });
});
