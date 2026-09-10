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

  it("keeps sibling leaf and parent nodes distinct", () => {
    // NOTE: `issues` and `issue` are DIFFERENT nodes — one leaf-only, one parent-only.
    // This does not exercise a node that is both; see the test below for that.
    const root = buildCommandTree([cmd("linear issues"), cmd("linear issue create")]);
    const linear = root.children.get("linear")!;
    expect(linear.children.get("issues")!.leaf).toBeDefined();
    expect(linear.children.get("issue")!.leaf).toBeUndefined();
  });

  it("marks a node that is genuinely BOTH a leaf and a parent", () => {
    const root = buildCommandTree([cmd("lp thing"), cmd("lp thing create")]);
    const thing = root.children.get("lp")!.children.get("thing")!;
    expect(thing.leaf).toBeDefined();          // has its own handler
    expect(thing.children.has("create")).toBe(true); // and children
  });

  it("drops a command whose name contains yargs metacharacters", () => {
    // "zz <pos>" would create a literal "<pos>" tree segment: listed in --help, uninvokable.
    const root = buildCommandTree([cmd("zz <pos>"), cmd("ok go")]);
    expect(root.children.has("zz")).toBe(false);
    expect(root.children.has("ok")).toBe(true);
  });

  it("ignores an empty or whitespace-only name rather than creating a blank node", () => {
    const root = buildCommandTree([cmd("   "), cmd("")]);
    expect(root.children.size).toBe(0);
  });

  it("collapses repeated whitespace", () => {
    const root = buildCommandTree([cmd("cf   worker    list")]);
    expect(root.children.get("cf")!.children.get("worker")!.children.get("list")!.leaf).toBeDefined();
  });

  it("ignores a command whose name is not a string instead of throwing", () => {
    // A non-string name reached cmd.name.trim() and killed EVERY command, including
    // `can --version`, with a raw TypeError and no plugin named in the message.
    const bad = [{ name: 123, description: "d" }, { name: undefined, description: "d" }] as any;
    expect(() => buildCommandTree(bad)).not.toThrow();
    expect(buildCommandTree(bad).children.size).toBe(0);
  });
});

describe("registerNode subcommand demands", () => {
  // The fake must RECURSE: an earlier version only ran the top-level builder, so nested
  // nodes were never exercised and reverting the leaf/parent fix still passed. A fake that
  // does not mirror the real call graph is a test that asserts nothing.
  function collect(commands: any[]) {
    const strings: string[] = [];
    const demands: string[] = [];
    const makeArgv = (): any => {
      const argv: any = {
        command: (name: string, _d: string, builder?: any) => {
          strings.push(name);
          if (builder) builder(makeArgv());
          return argv;
        },
        options: () => argv,
        demandCommand: (_n: number, msg: string) => { demands.push(msg); return argv; }
      };
      return argv;
    };
    registerPluginCommands(makeArgv(), commands, {} as any);
    return { strings, demands };
  }

  it("registers one top-level yargs command per root child", () => {
    const { strings } = collect([cmd("neon branch list"), cmd("cf worker list")]);
    expect(strings).toContain("neon <subcommand>");
    expect(strings).toContain("cf <subcommand>");
  });

  it("passes the config through to the leaf handler", async () => {
    let received: unknown = null;
    const def: CommandDefinition = { name: "x go", description: "d", handler: async (_a, c) => { received = c; } };
    const handlers: any[] = [];
    const makeArgv = (): any => {
      const argv: any = {
        command: (_n: string, _d: string, builder?: any, handler?: any) => {
          if (handler) handlers.push(handler);
          if (builder) builder(makeArgv());
          return argv;
        },
        options: () => argv,
        demandCommand: () => argv
      };
      return argv;
    };
    const config = { marker: 42 } as any;
    registerPluginCommands(makeArgv(), [def], config);
    await handlers[handlers.length - 1]({});
    expect(received).toBe(config);
  });

  it("demands a subcommand for a parent with no handler of its own", () => {
    const { demands, strings } = collect([cmd("neon branch list")]);
    expect(demands).toContain("Specify a neon subcommand");
    expect(demands).toContain("Specify a branch subcommand");
    expect(strings).toContain("neon <subcommand>");
  });

  it("does NOT demand a subcommand when the parent has its own handler", () => {
    // Otherwise that handler is dead code while --help advertises its description.
    const { demands, strings } = collect([cmd("lp thing"), cmd("lp thing create")]);
    expect(demands).not.toContain("Specify a thing subcommand");
    expect(strings).toContain("thing [subcommand]");  // optional, not <required>
    expect(strings).not.toContain("thing <subcommand>");
  });
});

describe("PluginLoader bundled plugins — real modules, no mocks", () => {
  it("loads the in-tree plugins that shipped unreachable before this fix", async () => {
    const loader = new PluginLoader({} as any);
    await loader.loadAll();
    const names = loader.getAllPlugins().map(p => p.metadata.name);
    // cloudflare/linear/neon export a single plugin object...
    expect(names).toEqual(expect.arrayContaining(["@chitty/cloudflare", "@chitty/linear", "@chitty/neon"]));
    // ...while ai/ and chittyos/ export ARRAYS of them. An earlier version of this fix
    // excluded both, claiming they were metadata-less barrel files. They are not, and 13
    // working plugins were silently dropped. This assertion is that regression's guard.
    expect(names).toEqual(expect.arrayContaining(["openai", "anthropic", "@chitty/chittyid", "@chitty/chittyauth"]));
    expect(names.length).toBeGreaterThanOrEqual(16);
  });

  it("exposes remote types through getAllRemoteTypes, which had ZERO callers", async () => {
    // Without this, `can config` cannot create a neon-project remote, so every neon
    // command fails with "Remote db-prod not found" and the plugin is unusable
    // end-to-end even though its commands are registered.
    const loader = new PluginLoader({} as any);
    await loader.loadAll();
    const types = loader.getAllRemoteTypes().map(rt => rt.type);
    expect(types).toEqual(expect.arrayContaining(["neon-project", "cloudflare-account", "linear-workspace"]));
    expect(types.length).toBeGreaterThanOrEqual(16);
  });

  it("exposes their commands through getAllCommands, which nothing used to call", async () => {
    const loader = new PluginLoader({} as any);
    await loader.loadAll();
    const names = loader.getAllCommands().map(c => c.name);
    expect(names).toContain("neon branch list");
    expect(names.length).toBeGreaterThanOrEqual(8);
  });
});
