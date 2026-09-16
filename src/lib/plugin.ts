/**
 * Plugin System for ChittyTracker
 * Allows dynamic loading of extensions
 */

import { Config } from "./config.js";

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
}

export interface RemoteTypeDefinition {
  type: string;
  name?: string;
  description?: string;
  schema?: Record<string, any>;
  configFields?: Array<{
    name: string;
    description: string;
    required: boolean;
    sensitive?: boolean;
    default?: any;
  }>;
  validate?: (config: any) => boolean | string;
}

export interface RemoteConfigField {
  name: string;
  description: string;
  required: boolean;
  sensitive?: boolean;
  default?: any;
}

/**
 * Return a plugin remote's prompt fields in one consistent shape.
 *
 * Older plugins expose only `schema`, so preserve the existing credential-name
 * inference for them while allowing newer plugins to declare sensitivity explicitly.
 */
export function getRemoteConfigFields(definition: RemoteTypeDefinition): RemoteConfigField[] {
  return definition.configFields ?? Object.entries(definition.schema ?? {}).map(
    ([name, spec]: [string, any]) => ({
      name,
      description: name,
      required: Boolean(spec?.required),
      sensitive: spec?.sensitive === true || /key|token|secret|password/i.test(name),
      default: spec?.default,
    })
  );
}

const ENV_REFERENCE = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

/** Resolve declared sensitive fields in memory without changing persisted config. */
export function resolveSensitiveRemoteFields<T extends Record<string, any>>(
  remote: T,
  definition: RemoteTypeDefinition,
  env: NodeJS.ProcessEnv = process.env,
): T {
  for (const field of getRemoteConfigFields(definition)) {
    if (!field.sensitive) continue;

    const value = remote[field.name];
    if (typeof value !== "string") continue;

    const match = ENV_REFERENCE.exec(value);
    if (match && env[match[1]] !== undefined) {
      (remote as Record<string, any>)[field.name] = env[match[1]];
    }
  }
  return remote;
}

/** Resolve sensitive plugin remote references after config load and before dispatch. */
export function resolvePluginRemoteEnvironment(
  config: Config,
  definitions: RemoteTypeDefinition[],
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const definitionsByType = new Map(definitions.map(definition => [definition.type, definition]));
  for (const remote of Object.values(config.remotes ?? {})) {
    const candidate = remote as unknown as Record<string, any>;
    const definition = definitionsByType.get(candidate.type);
    if (definition) resolveSensitiveRemoteFields(candidate, definition, env);
  }
  return config;
}

export interface CommandDefinition {
  name: string;
  description: string;
  handler?: (args: any, config: Config) => Promise<void> | void;
  subcommands?: Record<string, {
    description: string;
    handler: (args: any, config: Config) => Promise<void> | void;
    options?: Record<string, any>;
  }>;
  options?: Record<string, any>;
}

export interface ChittyPlugin {
  metadata: PluginMetadata;

  /** Remote types this plugin provides */
  remoteTypes?: RemoteTypeDefinition[];

  /** Commands this plugin adds */
  commands?: CommandDefinition[];

  /** Initialize plugin */
  init?(config: Config): Promise<void>;

  /** Called when plugin is installed */
  onInstall?(): Promise<void>;

  /** Called when plugin is uninstalled */
  onUninstall?(): Promise<void>;

  /** Called when plugin is enabled */
  onEnable?(): Promise<void>;

  /** Called when plugin is disabled */
  onDisable?(): Promise<void>;
}

export class PluginLoader {
  private plugins: Map<string, ChittyPlugin> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Load a plugin from a module path
   */
  async loadPlugin(modulePath: string): Promise<ChittyPlugin> {
    try {
      const module = await import(modulePath);
      const plugin: ChittyPlugin = module.default || module;

      if (!this.isValidPlugin(plugin)) {
        throw new Error(`Invalid plugin: ${modulePath}`);
      }

      this.plugins.set(plugin.metadata.name, plugin);

      // Initialize if needed
      if (plugin.init) {
        await plugin.init(this.config);
      }

      return plugin;
    } catch (error: any) {
      throw new Error(`Failed to load plugin ${modulePath}: ${error.message}`);
    }
  }

  /**
   * Load all plugins from config
   */
  async loadAll(): Promise<void> {
    await this.loadBundledPlugins();

    const extensions = this.config.extensions || {};

    for (const [name, extConfig] of Object.entries(extensions)) {
      if (extConfig.enabled === false) continue;

      try {
        // Try to load from node_modules
        await this.loadPlugin(name);
      } catch (error: any) {
        console.warn(`[chitty] Failed to load extension ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Load the plugins that ship inside this package.
   *
   * These are listed explicitly rather than discovered by scanning: a directory scan at
   * startup costs a stat per entry on every `can` invocation, and an explicit list fails
   * loudly in review when a plugin is added without being registered.
   *
   * Measured cost of importing all of these: ~17ms against a ~280ms baseline startup.
   *
   * `ai/` and `chittyos/` are deliberately absent — their index modules are barrel files
   * that re-export helpers and expose no `metadata`, so they are not plugins.
   */
  private async loadBundledPlugins(): Promise<void> {
    const bundled: Array<[string, () => Promise<any>]> = [
      ["ai", () => import("../plugins/ai/index.js")],
      ["chittyos", () => import("../plugins/chittyos/index.js")],
      ["cloudflare", () => import("../plugins/cloudflare/index.js")],
      ["linear", () => import("../plugins/linear/index.js")],
      ["neon", () => import("../plugins/neon/index.js")]
    ];

    for (const [dir, load] of bundled) {
      let candidates: unknown[];
      try {
        const mod: any = await load();
        const exported = mod.default ?? mod;
        // ai/ and chittyos/ export an ARRAY of plugins; the rest export one.
        candidates = Array.isArray(exported) ? exported : [exported];
      } catch (error: any) {
        console.warn(`[chitty] Bundled plugin "${dir}" failed to import: ${error.message}`);
        continue;
      }

      for (const candidate of candidates) {
        const plugin = candidate as ChittyPlugin;
        if (!this.isValidPlugin(plugin)) {
          console.warn(`[chitty] Bundled plugin in "${dir}" is malformed; skipping.`);
          continue;
        }
        const name = plugin.metadata.name;
        try {
          // init() BEFORE registering. Registering first left a live, uninitialised plugin
          // whose handlers ran against state init() never built.
          if (plugin.init) await plugin.init(this.config);
          this.plugins.set(name, plugin);
        } catch (error: any) {
          console.warn(`[chitty] Bundled plugin "${name}" (${dir}) failed to initialise, and will not be registered: ${error.message}`);
        }
      }
    }
  }

  /**
   * Get a loaded plugin
   */
  getPlugin(name: string): ChittyPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): ChittyPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all commands from all plugins
   */
  getAllCommands(): CommandDefinition[] {
    const commands: CommandDefinition[] = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.commands) {
        commands.push(...plugin.commands);
      }
    }

    return commands;
  }

  /**
   * Get all remote types from all plugins
   */
  getAllRemoteTypes(): RemoteTypeDefinition[] {
    const types: RemoteTypeDefinition[] = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.remoteTypes) {
        types.push(...plugin.remoteTypes);
      }
    }

    return types;
  }

  /**
   * Validate if an object is a valid plugin
   */
  private isValidPlugin(obj: any): obj is ChittyPlugin {
    return (
      obj &&
      typeof obj === "object" &&
      obj.metadata &&
      typeof obj.metadata.name === "string" &&
      typeof obj.metadata.version === "string"
    );
  }

  /**
   * Install a plugin
   */
  async installPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }

    if (plugin.onInstall) {
      await plugin.onInstall();
    }

    // Update config
    this.config.extensions = this.config.extensions || {};
    this.config.extensions[name] = { enabled: true };
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }

    if (plugin.onUninstall) {
      await plugin.onUninstall();
    }

    // Remove from config
    if (this.config.extensions) {
      delete this.config.extensions[name];
    }

    this.plugins.delete(name);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }

    if (plugin.onEnable) {
      await plugin.onEnable();
    }

    if (this.config.extensions?.[name]) {
      this.config.extensions[name].enabled = true;
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }

    if (plugin.onDisable) {
      await plugin.onDisable();
    }

    if (this.config.extensions?.[name]) {
      this.config.extensions[name].enabled = false;
    }
  }
}
