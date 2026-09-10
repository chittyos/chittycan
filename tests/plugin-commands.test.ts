import { describe, it, expect } from "vitest";
import { buildCommandTree, registerPluginCommands } from "../src/lib/plugin-commands.js";
import { PluginLoader } from "../src/lib/plugin.js";
import type { CommandDefinition } from "../src/lib/plugin.js";

const cmd = (name: string): CommandDefinition => ({ name, description: `desc ${name}`, handler: async () => {} });

describe("buildCommandTree", () => {
  it("nests a space-separated name instead of treating it as positionals", () => {
    // The whole reason this module exists: yargs would read "neon branch list" as a
    // command `neon` taking two positionals, accepting `can neon foo bar`.
    const root = buildCommandTree([cmd("neon branch list")]);
    const neon = root.children.get("neon")!;
    expect(neon).toBeDefined();
    expect(neon.leaf).toBeUndefined();
    const branch = neon.children.get("branch")!;
    expect(branch.leaf).toBeUndefined();
    expect(branch.children.get("list")!.leaf!.name).toBe("neon branch list");
  });

  it("shares intermediate nodes across sibling commands", () => {
    const root = buildCommandTree([cmd("neon branch list"), cmd("neon branch create"), cmd("neon db list")]);
    const neon = root.children.get("neon")!;
    expect([...neon.children.keys()].sort()).toEqual(["branch", "db"]);
    expect([...neon.children.get("branch")!.children.keys()].sort()).toEqual(["create", "list"]);
  });

  it("supports a single-word command", () => {
    const root = buildCommandTree([cmd("linear teams")]);
    expect(root.children.get("linear")!.children.get("teams")!.leaf!.name).toBe("linear teams");
  });

  it("allows a node to be both a leaf and a parent", () => {
    const root = buildCommandTree([cmd("linear issues"), cmd("linear issue create")]);
    const linear = root.children.get("linear")!;
    expect(linear.children.get("issues")!.leaf).toBeDefined();
    expect(linear.children.get("issue")!.leaf).toBeUndefined();
  });

  it("ignores an empty or whitespace-only name rather than creating a blank node", () => {
    const root = buildCommandTree([cmd("   "), cmd("")]);
    expect(root.children.size).toBe(0);
  });

  it("collapses repeated whitespace", () => {
    const root = buildCommandTree([cmd("cf   worker    list")]);
    expect(root.children.get("cf")!.children.get("worker")!.children.get("list")!.leaf).toBeDefined();
  });
});

describe("registerPluginCommands", () => {
  it("registers one top-level yargs command per root child", () => {
    const seen: string[] = [];
    const fakeYargs: any = { command: (name: string) => { seen.push(name); return fakeYargs; } };
    registerPluginCommands(fakeYargs, [cmd("neon branch list"), cmd("cf worker list")], {} as any);
    expect(seen.sort()).toEqual(["cf <subcommand>", "neon <subcommand>"]);
  });

  it("passes the config through to the leaf handler", async () => {
    let received: unknown = null;
    const def: CommandDefinition = { name: "x go", description: "d", handler: async (_a, c) => { received = c; } };
    const captured: any[] = [];
    const fakeYargs: any = {
      command: (_n: string, _d: string, builder: any, handler: any) => {
        captured.push({ builder, handler });
        builder({ command: fakeYargs.command, options: () => fakeYargs, demandCommand: () => fakeYargs });
        return fakeYargs;
      },
      options: () => fakeYargs,
      demandCommand: () => fakeYargs
    };
    const config = { marker: 42 } as any;
    registerPluginCommands(fakeYargs, [def], config);
    const leaf = captured[captured.length - 1];
    await leaf.handler({});
    expect(received).toBe(config);
  });
});

describe("PluginLoader bundled plugins — real modules, no mocks", () => {
  it("loads the in-tree plugins that shipped unreachable before this fix", async () => {
    const loader = new PluginLoader({} as any);
    await loader.loadAll();
    const names = loader.getAllPlugins().map(p => p.metadata.name).sort();
    expect(names).toEqual(["@chitty/cloudflare", "@chitty/linear", "@chitty/neon"]);
  });

  it("exposes their commands through getAllCommands, which nothing used to call", async () => {
    const loader = new PluginLoader({} as any);
    await loader.loadAll();
    const names = loader.getAllCommands().map(c => c.name);
    expect(names).toContain("neon branch list");
    expect(names.length).toBeGreaterThanOrEqual(8);
  });
});
