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
import {
  sessionCreateCommand,
  sessionValidateCommand,
  sessionInspectCommand,
  sessionEndCommand,
  sessionListCommand,
  sessionAddGeneCommand
} from "./commands/session-dna.js";
import { complianceReportCommand } from "./commands/compliance.js";
import {
  analyticsCommand,
  predictCommand,
  suggestionsCommand,
  learnCommand,
  growthCommand
} from "./commands/grow.js";
import { cleanup } from "./commands/cleanup.js";
import {
  proposeListCommand,
  proposeGenerateCommand,
  proposePreviewCommand,
  proposeAcceptCommand,
  proposeRejectCommand,
  progressCommand,
  progressAnalyzeCommand,
  synthesizeCommand,
  synthesizeAnalyzeCommand,
  synthesizePatternsCommand
} from "./commands/learning.js";

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
    "cleanup",
    "Intelligent project cleanup with smart detection",
    (yargs: any) =>
      yargs
        .option("live", {
          describe: "Apply changes (default is dry run)",
          type: "boolean",
          default: false
        })
        .option("fix", {
          describe: "Automatically fix issues",
          type: "boolean",
          default: false
        })
        .option("deep", {
          describe: "Deep scan (includes git analysis, large files)",
          type: "boolean",
          default: false
        })
        .option("interactive", {
          describe: "Interactive mode with prompts",
          type: "boolean",
          default: true
        })
        .option("quiet", {
          describe: "Suppress output",
          type: "boolean",
          default: false
        })
        .option("agent", {
          describe: "Run chittyagent-cleaner scripts",
          type: "string",
          choices: ["local", "volume", "kondo", "all"]
        })
        .option("cwd", {
          describe: "Directory to clean",
          type: "string",
          default: process.cwd()
        }),
    async (argv: any) => {
      await cleanup({
        cwd: argv.cwd,
        dryRun: !argv.live,
        autofix: argv.fix,
        deep: argv.deep,
        interactive: argv.interactive,
        quiet: argv.quiet,
        agent: argv.agent as "local" | "volume" | "kondo" | "all" | undefined
      });
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
    "Manage your ChittyDNA (ownership, portability, attribution, session governance)",
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
        )
        .command(
          "session",
          "Session DNA governance (roles, scopes, lifecycle)",
          (yargs) =>
            yargs
              .command(
                "create",
                "Create a new session DNA strand",
                (yargs) =>
                  yargs
                    .option("project", {
                      type: "string",
                      description: "Project ID"
                    })
                    .option("purpose", {
                      type: "string",
                      description: "Session purpose"
                    })
                    .option("roles", {
                      type: "array",
                      description: "Allowed roles"
                    })
                    .option("scopes", {
                      type: "array",
                      description: "Consent scopes"
                    })
                    .option("ttl", {
                      type: "number",
                      description: "Session TTL in hours",
                      default: 24
                    })
                    .option("parent", {
                      type: "string",
                      description: "Parent ChittyID"
                    })
                    .option("no-interactive", {
                      type: "boolean",
                      description: "Disable interactive prompts"
                    }),
                async (argv) => {
                  await sessionCreateCommand({
                    project: argv.project as string | undefined,
                    purpose: argv.purpose as string | undefined,
                    roles: argv.roles as string[] | undefined,
                    scopes: argv.scopes as string[] | undefined,
                    ttl: argv.ttl as number,
                    parent: argv.parent as string | undefined,
                    interactive: !argv["no-interactive"]
                  });
                }
              )
              .command(
                "validate <dna-id>",
                "Validate a session DNA strand",
                (yargs) =>
                  yargs.positional("dna-id", {
                    describe: "DNA strand ID",
                    type: "string",
                    demandOption: true
                  }),
                async (argv) => {
                  await sessionValidateCommand(argv["dna-id"] as string);
                }
              )
              .command(
                "inspect <dna-id>",
                "Inspect a session DNA strand",
                (yargs) =>
                  yargs
                    .positional("dna-id", {
                      describe: "DNA strand ID",
                      type: "string",
                      demandOption: true
                    })
                    .option("json", {
                      type: "boolean",
                      description: "Output as JSON"
                    }),
                async (argv) => {
                  await sessionInspectCommand(argv["dna-id"] as string, {
                    json: argv.json as boolean
                  });
                }
              )
              .command(
                "end <dna-id>",
                "End a session DNA strand",
                (yargs) =>
                  yargs
                    .positional("dna-id", {
                      describe: "DNA strand ID",
                      type: "string",
                      demandOption: true
                    })
                    .option("reason", {
                      type: "string",
                      choices: ["completed", "cancelled", "timeout", "revoked", "error"],
                      default: "completed",
                      description: "End reason"
                    }),
                async (argv) => {
                  await sessionEndCommand(argv["dna-id"] as string, {
                    reason: argv.reason as "completed" | "cancelled" | "timeout" | "revoked" | "error"
                  });
                }
              )
              .command(
                "list",
                "List session DNA strands",
                (yargs) =>
                  yargs
                    .option("limit", {
                      type: "number",
                      default: 10,
                      description: "Number of strands to show"
                    })
                    .option("active", {
                      type: "boolean",
                      description: "Show only active sessions"
                    }),
                async (argv) => {
                  await sessionListCommand({
                    limit: argv.limit as number,
                    active: argv.active as boolean | undefined
                  });
                }
              )
              .command(
                "add-gene <dna-id>",
                "Add a gene to an existing session strand",
                (yargs) =>
                  yargs
                    .positional("dna-id", {
                      describe: "DNA strand ID",
                      type: "string",
                      demandOption: true
                    })
                    .option("tag", {
                      type: "string",
                      demandOption: true,
                      description: "Gene tag (e.g., context_expand, clean_room)"
                    })
                    .option("allele", {
                      type: "string",
                      demandOption: true,
                      description: "Gene allele as JSON"
                    }),
                async (argv) => {
                  await sessionAddGeneCommand(argv["dna-id"] as string, {
                    tag: argv.tag as string,
                    allele: argv.allele as string
                  });
                }
              ),
          () => {
            yargs.showHelp();
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
  .command(
    "analytics",
    "Show usage analytics dashboard",
    () => {},
    () => {
      analyticsCommand();
    }
  )
  .command(
    "predict",
    "Show smart command predictions",
    (yargs) =>
      yargs.option("quiet", {
        type: "boolean",
        default: false,
        description: "Only output top prediction (for shell integration)"
      }),
    async (argv) => {
      await predictCommand({ quiet: argv.quiet });
    }
  )
  .command(
    "suggestions",
    "Show workflow suggestions from repeated patterns",
    () => {},
    async () => {
      await suggestionsCommand();
    }
  )
  .command(
    "learn <type> [args..]",
    "Learning hook (called from shell - usually automatic)",
    (yargs) =>
      yargs
        .positional("type", {
          describe: "Learning type",
          type: "string",
          choices: ["command", "context", "git"],
          demandOption: true
        })
        .positional("args", {
          describe: "Additional arguments",
          type: "string",
          array: true
        }),
    async (argv) => {
      await learnCommand(argv.type as any, (argv.args as string[]) || []);
    }
  )
  .command(
    "growth",
    "Show growth stats (simplified analytics)",
    () => {},
    () => {
      growthCommand();
    }
  )
  .command(
    "propose",
    "Manage auto-generated skill/agent/plugin proposals",
    (yargs) =>
      yargs
        .command(
          "list",
          "List pending proposals",
          () => {},
          async () => {
            await proposeListCommand();
          }
        )
        .command(
          "generate",
          "Generate new proposals from patterns",
          () => {},
          async () => {
            await proposeGenerateCommand();
          }
        )
        .command(
          "preview <id>",
          "Preview a proposal",
          (yargs) =>
            yargs.positional("id", {
              describe: "Proposal ID",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await proposePreviewCommand(argv.id as string);
          }
        )
        .command(
          "accept <id>",
          "Accept and generate from proposal",
          (yargs) =>
            yargs.positional("id", {
              describe: "Proposal ID",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await proposeAcceptCommand(argv.id as string);
          }
        )
        .command(
          "reject <id>",
          "Reject a proposal",
          (yargs) =>
            yargs.positional("id", {
              describe: "Proposal ID",
              type: "string",
              demandOption: true
            }),
          async (argv) => {
            await proposeRejectCommand(argv.id as string);
          }
        ),
    () => {
      yargs.showHelp();
    }
  )
  .command(
    "progress [cli]",
    "View learning progress and skill levels",
    (yargs) =>
      yargs
        .positional("cli", {
          describe: "Specific CLI to show progress for",
          type: "string"
        })
        .command(
          "analyze",
          "Analyze skill gaps and recommendations",
          () => {},
          async () => {
            await progressAnalyzeCommand();
          }
        ),
    async (argv) => {
      await progressCommand(argv.cli as string | undefined);
    }
  )
  .command(
    "synthesize",
    "Synthesize learning goals and patterns",
    (yargs) =>
      yargs
        .command(
          "analyze",
          "Show goal clusters and overlaps",
          () => {},
          async () => {
            await synthesizeAnalyzeCommand();
          }
        )
        .command(
          "patterns",
          "Show cross-goal patterns",
          () => {},
          async () => {
            await synthesizePatternsCommand();
          }
        ),
    async () => {
      await synthesizeCommand();
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
