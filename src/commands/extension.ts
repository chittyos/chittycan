import { loadConfig, saveConfig } from "../lib/config.js";
import { PluginLoader } from "../lib/plugin.js";

export async function listExtensions(): Promise<void> {
  const config = loadConfig();
  const loader = new PluginLoader(config);

  await loader.loadAll();

  const plugins = loader.getAllPlugins();

  if (!plugins.length) {
    console.log("[chitty] No extensions loaded — the bundled plugins failed to load.");
    console.log("  → Reinstall: npm install -g chittycan");
    return;
  }

  console.log("\nInstalled Extensions:\n");

  plugins.forEach(plugin => {
    const enabled = config.extensions?.[plugin.metadata.name]?.enabled !== false;
    const status = enabled ? "✓" : "○";

    console.log(`  ${status} ${plugin.metadata.name}@${plugin.metadata.version}`);
    console.log(`    ${plugin.metadata.description}`);

    if (plugin.commands?.length) {
      console.log(`    Commands: ${plugin.commands.length}`);
    }

    if (plugin.remoteTypes?.length) {
      console.log(`    Remote types: ${plugin.remoteTypes.map(t => t.type).join(", ")}`);
    }

    console.log();
  });
}

export async function enableExtension(name: string): Promise<void> {
  const config = loadConfig();
  const loader = new PluginLoader(config);

  try {
    await loader.loadPlugin(name);
    await loader.enablePlugin(name);

    saveConfig(config);

    console.log(`[chitty] ✓ Enabled extension: ${name}`);
  } catch (error: any) {
    console.error(`[chitty] Failed to enable extension: ${error.message}`);
    process.exit(1);
  }
}

export async function disableExtension(name: string): Promise<void> {
  const config = loadConfig();
  const loader = new PluginLoader(config);

  try {
    await loader.loadPlugin(name);
    await loader.disablePlugin(name);

    saveConfig(config);

    console.log(`[chitty] ✓ Disabled extension: ${name}`);
  } catch (error: any) {
    console.error(`[chitty] Failed to disable extension: ${error.message}`);
    process.exit(1);
  }
}

export async function installExtension(name: string): Promise<void> {
  // Third-party extensions are not installable yet: enablePlugin() only flips an entry
  // that already exists in config, so `can ext enable <pkg>` reports success and saves
  // nothing. (A package installed next to chittycan does resolve if its entry is added to
  // config by hand.) Say so rather than print steps that cannot work. neon, cf, linear
  // etc. are bundled.
  console.error(`[chitty] Cannot install "${name}": third-party extensions are not supported in this release.`);
  console.error("  Bundled plugins need no install — see: can ext list");
  process.exit(1);
}
