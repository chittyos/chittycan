import { CLI_CONFIGS, chittyCommand } from "../commands/chitty.js";

export async function routeDirectCliCommand(args: string[]): Promise<boolean> {
  const firstArg = args[0];

  if (!firstArg || !(firstArg in CLI_CONFIGS)) {
    return false;
  }

  await chittyCommand(args);
  return true;
}
