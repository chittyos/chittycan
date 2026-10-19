import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginLoader, RemoteTypeDefinition } from "../src/lib/plugin.js";

const mocks = vi.hoisted(() => ({
  config: {
    remotes: {} as Record<string, any>,
    nudges: { enabled: true, intervalMinutes: 45 },
  },
  prompt: vi.fn(),
  saveConfig: vi.fn(),
}));

vi.mock("inquirer", () => ({
  default: { prompt: mocks.prompt },
}));

vi.mock("../src/lib/config.js", () => ({
  getConfigPath: () => "/etc/hosts",
  loadConfig: () => mocks.config,
  saveConfig: mocks.saveConfig,
}));

import { configMenu } from "../src/commands/config.js";

function loaderWith(definition: RemoteTypeDefinition): PluginLoader {
  return {
    getAllRemoteTypes: () => [definition],
    loadAll: vi.fn(() => {
      throw new Error("configMenu must reuse loaded plugins");
    }),
  } as unknown as PluginLoader;
}

function queueAnswers(...answers: Record<string, any>[]): void {
  for (const answer of answers) mocks.prompt.mockResolvedValueOnce(answer);
}

describe("plugin remote configuration", () => {
  beforeEach(() => {
    mocks.config.remotes = {};
    mocks.prompt.mockReset();
    mocks.saveConfig.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores a blank sensitive field as an env reference and validates its resolved value", async () => {
    vi.stubEnv("EXAMPLE_APIKEY", "runtime-secret");
    const validate = vi.fn(() => true);
    const definition: RemoteTypeDefinition = {
      type: "example",
      configFields: [
        { name: "apiKey", description: "API key", required: true, sensitive: true },
        { name: "project", description: "Project", required: true },
        { name: "note", description: "Note", required: false },
      ],
      validate,
    };
    const loader = loaderWith(definition);
    queueAnswers(
      { action: "n" },
      { remoteType: "example" },
      { name: "work" },
      { value: "" },
      { value: "project-id" },
      { value: "" },
      { action: "q" },
    );

    await configMenu(loader);

    expect(loader.loadAll).not.toHaveBeenCalled();
    expect(validate).toHaveBeenCalledWith({
      type: "example",
      apiKey: "runtime-secret",
      project: "project-id",
    });
    expect(mocks.config.remotes.work).toEqual({
      type: "example",
      apiKey: "${EXAMPLE_APIKEY}",
      project: "project-id",
    });
    expect(mocks.saveConfig).toHaveBeenCalledOnce();
  });

  it("rejects a blank required non-sensitive field", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const definition: RemoteTypeDefinition = {
      type: "example",
      configFields: [
        { name: "project", description: "Project", required: true },
      ],
    };
    queueAnswers(
      { action: "n" },
      { remoteType: "example" },
      { name: "work" },
      { value: "" },
      { action: "q" },
    );

    await configMenu(loaderWith(definition));

    expect(error).toHaveBeenCalledWith("[chitty] Project is required.");
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    expect(mocks.config.remotes).toEqual({});
  });

  it("reports a synchronous validation exception and returns to the menu", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const definition: RemoteTypeDefinition = {
      type: "example",
      configFields: [],
      validate: () => {
        throw new Error("validator exploded");
      },
    };
    queueAnswers(
      { action: "n" },
      { remoteType: "example" },
      { name: "work" },
      { action: "q" },
    );

    await expect(configMenu(loaderWith(definition))).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith("[chitty] Invalid example remote: validator exploded");
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    expect(mocks.config.remotes).toEqual({});
  });
});
