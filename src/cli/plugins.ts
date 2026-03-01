import { loadConfig } from "../lib/config.js";
import { PluginLoader } from "../lib/plugin.js";

export async function loadCliPlugins(): Promise<void> {
  const config = loadConfig();
  const pluginLoader = new PluginLoader(config);
  await pluginLoader.loadAll();
}
