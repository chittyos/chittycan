/**
 * Stemcell Brief Command
 * Show the context any AI would get when popping on
 */

import { generateStemcellBrief, formatStemcellBrief } from "../lib/stemcell.js";

export async function briefCommand(args: any) {
  const projectPath = args.project || process.cwd();

  console.log("Generating stemcell brief...\n");

  const brief = await generateStemcellBrief(projectPath, {
    includeInstructions: args.full !== false,
    includeDependencies: args.full !== false,
    includeStructure: true,
    maxCommits: args.commits || 5,
  });

  const formatted = formatStemcellBrief(brief);
  console.log(formatted);

  if (args.export) {
    const fs = await import("fs/promises");
    await fs.writeFile(args.export, formatted);
    console.log(`\n✓ Brief exported to ${args.export}`);
  }
}

export async function quickBriefCommand() {
  const { getQuickBrief } = await import("../plugins/ai/stemcell-integration.js");
  const brief = await getQuickBrief();
  console.log(brief);
}
