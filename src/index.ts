#!/usr/bin/env node

import { hideBin } from "yargs/helpers";
import { routeDirectCliCommand } from "./cli/direct-route.js";
import { createCliParser } from "./cli/parser.js";
import { loadCliPlugins } from "./cli/plugins.js";

const args = hideBin(process.argv);

await loadCliPlugins();

if (await routeDirectCliCommand(args)) {
  process.exit(0);
}

createCliParser(args).parse();
