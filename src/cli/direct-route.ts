import { CLI_CONFIGS, chittyCommand } from "../commands/chitty.js";

export async function routeDirectCliCommand(args: string[]): Promise<boolean> {
  const firstArg = args[0];

  if (!firstArg || !Object.prototype.hasOwnProperty.call(CLI_CONFIGS, firstArg)) {
    return false;
  }

  await chittyCommand(args);
  return true;
}
