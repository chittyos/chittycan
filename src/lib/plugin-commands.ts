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
    const parts = cmd.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    for (const part of parts) {
      let next = node.children.get(part);
      if (!next) {
        next = { children: new Map() };
        node.children.set(part, next);
      }
      node = next;
    }
    // Last definition wins, matching the loader's "a configured extension wins" ordering.
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
  return y.command(
    node.children.size > 0 ? `${name} <subcommand>` : name,
    describe(node, name),
    (sub: Argv) => {
      for (const [childName, child] of node.children) {
        registerNode(sub, childName, child, config);
      }
      if (node.leaf?.options) sub.options(node.leaf.options);
      // A branch with children but no handler of its own must not silently succeed.
      return node.children.size > 0 ? sub.demandCommand(1, `Specify a ${name} subcommand`) : sub;
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
