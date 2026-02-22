import { loadConfig, saveConfig } from "../lib/config.js";
import { PluginLoader } from "../lib/plugin.js";

export async function listExtensions(): Promise<void> {
  const config = loadConfig();
  const loader = new PluginLoader(config);

  await loader.loadAll();

  const plugins = loader.getAllPlugins();

  if (!plugins.length) {
    console.log("[chitty] No extensions installed");
    console.log("  → Run: npm install @chitty/cloudflare @chitty/neon @chitty/linear");
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
  console.log(`[chitty] Installing ${name}...`);
  console.log(`  → Run: npm install ${name}`);
  console.log();
  console.log("  Available extensions:");
  console.log("    @chitty/cloudflare - Manage Cloudflare Workers, DNS, KV, R2");
  console.log("    @chitty/neon - Manage Neon PostgreSQL databases");
  console.log("    @chitty/linear - Manage Linear issues");
  console.log("    @chitty/vercel - Manage Vercel deployments");
  console.log("    @chitty/railway - Manage Railway services");
}
