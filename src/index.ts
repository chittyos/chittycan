#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { configMenu } from "./commands/config.js";
import { open, listRemotes } from "./commands/open.js";
import { nudgeNow, nudgeQuiet } from "./commands/nudge.js";
import { checkpoint, listCheckpoints } from "./commands/checkpoint.js";
import { installZsh, uninstallZsh } from "./commands/hook.js";
import { syncSetup, syncRun, syncStatus } from "./commands/sync.js";
import { listExtensions, enableExtension, disableExtension, installExtension } from "./commands/extension.js";
import { PluginLoader } from "./lib/plugin.js";
import { doctor } from "./commands/doctor.js";
import { briefCommand } from "./commands/brief.js";
import { chittyCommand } from "./commands/chitty.js";
import {
  listMcpServers,
  startMcpServer,
  stopMcpServer,
  mcpServerStatus,
  listMcpTools,
  testMcpConnection
} from "./commands/mcp.js";
import { connectSetup, connectStatus, connectToken } from "./commands/connect.js";
import { generateMcpConfig, installMcpConfig } from "./commands/mcp-config.js";
import {
  exportDNACommand,
  importDNACommand,
  dnaStatusCommand,
  dnaHistoryCommand,
  revokeDNACommand,
  restoreDNACommand
} from "./commands/dna.js";
import { complianceReportCommand } from "./commands/compliance.js";

// Load plugins early
const config = (await import("./lib/config.js")).loadConfig();
const pluginLoader = new PluginLoader(config);
await pluginLoader.loadAll();

// Check for direct CLI routing (can gh ... instead of can chitty gh ...)
const args = hideBin(process.argv);
const firstArg = args[0];

// Import CLI configs to check supported CLIs
const { CLI_CONFIGS } = await import("./commands/chitty.js");

// If first arg is a supported CLI, auto-route to chitty handler
if (firstArg && firstArg in CLI_CONFIGS) {
  // This is a direct CLI command like "can gh clone repo"
  // Route to chitty handler automatically
  await chittyCommand(args);
  process.exit(0);
}

yargs(args)
  .scriptName("can")
  .usage("$0 <command> [options]")
  .command(
    "config",
    "Interactive configuration menu (rclone-style)",
    () => {},
    async () => {
      await configMenu();
    }
  )
  .command(
    "brief",
    "Show stemcell brief (what AI sees about this project)",
    () => {},
    async (argv) => {
      await briefCommand(argv);
    }
  )
  .command(
    "chitty [args..]",
    "Natural language command interpreter (AI-powered)",
    (yargs) =>
      yargs.positional("args", {
        describe: "CLI and natural language command",
        type: "string",
        array: true
      }),
    async (argv) => {
      const args = (argv.args as string[]) || [];
      await chittyCommand(args);
    }
  )
  .command(
    "remote",
    "Manage remotes",
    (yargs) =>
      yargs.command(
        "list",
        "List all configured remotes",
        () => {},
        () => {
          listRemotes();
        }
      ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "open <name> [view]",
    "Open a remote in browser",
    (yargs) =>
      yargs
        .positional("name", {
          describe: "Remote name",
          type: "string",
          demandOption: true
        })
        .positional("view", {
          describe: "View name (optional)",
          type: "string"
        }),
    (argv) => {
      open(argv.name as string, argv.view as string);
    }
  )
  .command(
    "nudge",
    "Reminder commands",
    (yargs) =>
      yargs
        .command(
          "now",
          "Interactive nudge to update tracker",
          () => {},
          async () => {
            await nudgeNow();
          }
        )
        .command(
          "quiet",
          "Quick reminder (non-interactive)",
          () => {},
          () => {
            nudgeQuiet();
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "checkpoint [message]",
    "Save a checkpoint with optional message",
    (yargs) =>
      yargs.positional("message", {
        describe: "Checkpoint message",
        type: "string"
      }),
    (argv) => {
      checkpoint(argv.message as string);
    }
  )
  .command(
    "checkpoints [limit]",
    "List recent checkpoints",
    (yargs) =>
      yargs.positional("limit", {
        describe: "Number of checkpoints to show",
        type: "number",
        default: 10
      }),
    (argv) => {
      listCheckpoints(argv.limit as number);
    }
  )
  .command(
    "hook",
    "Manage shell hooks",
    (yargs) =>
      yargs
        .command(
          "install <shell>",
          "Install shell hooks",
          (yargs) =>
            yargs.positional("shell", {
              describe: "Shell type",
              type: "string",
              choices: ["zsh"],
              demandOption: true
            }),
          (argv) => {
            if (argv.shell === "zsh") {
              installZsh();
            }
          }
        )
        .command(
          "uninstall <shell>",
          "Uninstall shell hooks",
          (yargs) =>
            yargs.positional("shell", {
              describe: "Shell type",
              type: "string",
              choices: ["zsh"],
              demandOption: true
            }),
          (argv) => {
            if (argv.shell === "zsh") {
              uninstallZsh();
            }
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "ext",
    "Manage extensions",
    (yargs) =>
      yargs
        .command(
          "list",
          "List installed extensions",
          () => {},
          async () => {
            await listExtensions();
          }
        )
        .command(
          "install <name>",
          "Install an extension",
          (yargs) =>
            yargs.positional("name", {
              describe: "Extension name",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await installExtension(argv.name as string);
          }
        )
        .command(
          "enable <name>",
          "Enable an extension",
          (yargs) =>
            yargs.positional("name", {
              describe: "Extension name",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await enableExtension(argv.name as string);
          }
        )
        .command(
          "disable <name>",
          "Disable an extension",
          (yargs) =>
            yargs.positional("name", {
              describe: "Extension name",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await disableExtension(argv.name as string);
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "doctor",
    "Check environment and configuration",
    () => {},
    async () => {
      await doctor();
    }
  )
  .command(
    "sync",
    "Sync between Notion and GitHub",
    (yargs) =>
      yargs
        .command(
          "setup",
          "Configure sync",
          () => {},
          async () => {
            await syncSetup();
          }
        )
        .command(
          "run",
          "Run sync now",
          (yargs) =>
            yargs.option("dry-run", {
              describe: "Preview changes without applying",
              type: "boolean",
              default: false
            }),
          async (argv) => {
            await syncRun(argv["dry-run"]);
          }
        )
        .command(
          "status",
          "Show sync configuration",
          () => {},
          () => {
            syncStatus();
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "mcp",
    "Manage MCP (Model Context Protocol) servers",
    (yargs) =>
      yargs
        .command(
          "list",
          "List configured MCP servers",
          () => {},
          () => {
            listMcpServers();
          }
        )
        .command(
          "start <name>",
          "Start an MCP server",
          (yargs) =>
            yargs.positional("name", {
              describe: "MCP server name",
              type: "string",
              demandOption: true
            }),
          (argv) => {
            startMcpServer(argv.name as string);
          }
        )
        .command(
          "stop <name>",
          "Stop an MCP server",
          (yargs) =>
            yargs.positional("name", {
              describe: "MCP server name",
              type: "string",
              demandOption: true
            }),
          (argv) => {
            stopMcpServer(argv.name as string);
          }
        )
        .command(
          "status <name>",
          "Check MCP server status",
          (yargs) =>
            yargs.positional("name", {
              describe: "MCP server name",
              type: "string",
              demandOption: true
            }),
          (argv) => {
            mcpServerStatus(argv.name as string);
          }
        )
        .command(
          "tools <name>",
          "List tools from MCP server",
          (yargs) =>
            yargs.positional("name", {
              describe: "MCP server name",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await listMcpTools(argv.name as string);
          }
        )
        .command(
          "test <name>",
          "Test connection to MCP server",
          (yargs) =>
            yargs.positional("name", {
              describe: "MCP server name",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await testMcpConnection(argv.name as string);
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "connect",
    "ChittyConnect integration hub (MCP, GitHub, proxies)",
    (yargs) =>
      yargs
        .command(
          "setup",
          "Quick setup with auto-detection",
          () => {},
          async () => {
            await connectSetup();
          }
        )
        .command(
          "status",
          "Show configuration",
          () => {},
          async () => {
            await connectStatus();
          }
        )
        .command(
          "token [value]",
          "Update API token",
          (yargs) =>
            yargs.positional("value", {
              describe: "New token value (or prompt)",
              type: "string"
            }),
          async (argv) => {
            await connectToken(argv.value as string);
          }
        )
        .command(
          "mcp-config",
          "Generate Claude Code MCP configuration",
          () => {},
          async () => {
            await generateMcpConfig();
          }
        )
        .command(
          "mcp-install",
          "Auto-install MCP config to Claude Code",
          () => {},
          async () => {
            await installMcpConfig();
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "dna",
    "Manage your ChittyDNA (ownership, portability, attribution)",
    (yargs) =>
      yargs
        .command(
          "export",
          "Export DNA in PDX format",
          (yargs) =>
            yargs
              .option("privacy", {
                type: "string",
                choices: ["full", "hash-only"],
                default: "full",
                description: "Privacy mode"
              })
              .option("output", {
                type: "string",
                default: "~/chittycan-dna.json",
                description: "Output file path"
              }),
          async (argv) => {
            await exportDNACommand({
              privacy: argv.privacy as "full" | "hash-only",
              output: argv.output as string
            });
          }
        )
        .command(
          "import <file>",
          "Import DNA from PDX file",
          (yargs) =>
            yargs
              .positional("file", {
                describe: "PDX file path",
                type: "string",
                demandOption: true
              })
              .option("conflict-resolution", {
                type: "string",
                choices: ["merge", "replace", "rename", "skip"],
                default: "merge",
                description: "How to handle conflicting patterns"
              }),
          async (argv) => {
            await importDNACommand({
              file: argv.file as string,
              conflictResolution: argv["conflict-resolution"] as "merge" | "replace" | "rename" | "skip"
            });
          }
        )
        .command(
          "status",
          "Show DNA statistics and top patterns",
          () => {},
          async () => {
            await dnaStatusCommand();
          }
        )
        .command(
          "history",
          "View DNA evolution history (snapshots)",
          (yargs) =>
            yargs.option("limit", {
              type: "number",
              default: 10,
              description: "Number of snapshots to show"
            }),
          async (argv) => {
            await dnaHistoryCommand({ limit: argv.limit });
          }
        )
        .command(
          "restore",
          "Restore DNA from snapshot",
          () => {},
          async () => {
            await restoreDNACommand();
          }
        )
        .command(
          "revoke",
          "Revoke DNA (ethical exit)",
          () => {},
          async () => {
            await revokeDNACommand();
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "compliance",
    "Generate Foundation compliance report",
    () => {},
    async () => {
      await complianceReportCommand();
    }
  )
  .fail((msg, err, yargs) => {
    // For errors, show help
    if (msg) console.error(msg);
    if (err) console.error(err);
    yargs.showHelp();
    process.exit(1);
  })
  .demandCommand(1, "You must provide a command")
  .strict()
  .help()
  .alias("h", "help")
  .version()
  .alias("v", "version")
  .parse();
