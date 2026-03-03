#!/usr/bin/env node

import { hideBin } from "yargs/helpers";
import fs from "fs";

const args = hideBin(process.argv);
const firstArg = args[0] ?? "";
const secondArg = args[1] ?? "";

const HELP_FLAGS = new Set(["--help", "-h", "help"]);
const VERSION_FLAGS = new Set(["--version", "-v", "version"]);

function getCliVersion(): string {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function showRootHelp(): void {
  console.log("ChittyCan CLI");
  console.log("");
  console.log("Usage:");
  console.log("  can <command> [options]");
  console.log("  can chitty <natural language request>");
  console.log("");
  console.log("Quick start:");
  console.log("  can config");
  console.log("  can doctor");
  console.log("  can chitty --help");
  console.log("");
  console.log("Flags:");
  console.log("  --help, -h     Show this help");
  console.log("  --version, -v  Show version");
}

if (HELP_FLAGS.has(firstArg)) {
  showRootHelp();
  process.exit(0);
}

if (VERSION_FLAGS.has(firstArg)) {
  console.log(getCliVersion());
  process.exit(0);
}

if (firstArg === "chitty" && HELP_FLAGS.has(secondArg)) {
  const { chittyCommand } = await import("./commands/chitty.js");
  await chittyCommand([]);
  process.exit(0);
}

if (firstArg === "chitty" && VERSION_FLAGS.has(secondArg)) {
  console.log(getCliVersion());
  process.exit(0);
}

const { loadCliPlugins } = await import("./cli/plugins.js");
try {
  await loadCliPlugins();
} catch (error) {
  console.warn("[can] Plugin load failed; continuing without plugins.", error);
}

const { routeDirectCliCommand } = await import("./cli/direct-route.js");

if (await routeDirectCliCommand(args)) {
  process.exit(0);
}

const { createCliParser } = await import("./cli/parser.js");
createCliParser(args).parse();
