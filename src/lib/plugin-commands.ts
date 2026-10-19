import type { Argv } from "yargs";
import type { CommandDefinition } from "./plugin.js";
import type { Config } from "./config.js";

/**
 * Register plugin-supplied commands with yargs.
 *
 * Plugin command names are space-separated paths ("neon branch list"), not yargs command
 * strings. Passing one straight to `.command()` would declare a command `neon` taking two
 * positionals called `branch` and `list` — accepting `can neon foo bar` and rejecting
 * nothing. So the names are first assembled into a tree and registered as nested commands.
 *
 * Leaf handlers receive yargs' argv plus the CLI config, matching CommandDefinition.
 */

interface Node {
  children: Map<string, Node>;
  leaf?: CommandDefinition;
}

export function buildCommandTree(commands: CommandDefinition[]): Node {
  const root: Node = { children: new Map() };
  for (const cmd of commands) {
    if (typeof cmd?.name !== "string") continue;
    const parts = cmd.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    // yargs metacharacters would be parsed as positional syntax and yield a command that
    // is listed in --help but can never be invoked.
    if (parts.some(p => /[<>[\]|.]/.test(p))) {
      console.warn(`[chitty] Ignoring plugin command with reserved characters in its name: ${cmd.name}`);
      continue;
    }
    let node = root;
    for (const part of parts) {
      let next = node.children.get(part);
      if (!next) {
        next = { children: new Map() };
        node.children.set(part, next);
      }
      node = next;
    }
    if (node.leaf && node.leaf !== cmd) {
      console.warn(`[chitty] Two plugins declare the command "${cmd.name}"; the later one wins.`);
    }
    node.leaf = cmd;
  }
  return root;
}

function describe(node: Node, name: string): string {
  if (node.leaf) return node.leaf.description;
  const kids = Array.from(node.children.keys()).join(", ");
  return `${name} subcommands: ${kids}`;
}

function registerNode(y: Argv, name: string, node: Node, config: Config): Argv {
  const hasChildren = node.children.size > 0;
  const hasOwnHandler = Boolean(node.leaf?.handler);
  // A node with children AND its own handler must accept both forms, so the positional is
  // optional and demandCommand is not applied — otherwise its handler is dead code.
  const commandString = hasChildren ? `${name} ${hasOwnHandler ? "[subcommand]" : "<subcommand>"}` : name;
  return y.command(
    commandString,
    describe(node, name),
    (sub: Argv) => {
      for (const [childName, child] of node.children) {
        registerNode(sub, childName, child, config);
      }
      if (node.leaf?.options) sub.options(node.leaf.options);
      // A branch with children and no handler of its own must not silently succeed.
      return hasChildren && !hasOwnHandler
        ? sub.demandCommand(1, `Specify a ${name} subcommand`)
        : sub;
    },
    async (argv: any) => {
      if (!node.leaf?.handler) return;
      await node.leaf.handler(argv, config);
    }
  );
}

export function registerPluginCommands(
  cli: Argv,
  commands: CommandDefinition[],
  config: Config
): Argv {
  const root = buildCommandTree(commands);
  for (const [name, node] of root.children) {
    registerNode(cli, name, node, config);
  }
  return cli;
}
