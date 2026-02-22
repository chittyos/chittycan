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
