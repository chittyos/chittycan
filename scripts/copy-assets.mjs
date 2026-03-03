import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const source = resolve(rootDir, "src/zsh/snippets.zsh");
const targetDir = resolve(rootDir, "dist/zsh");
const target = resolve(targetDir, "snippets.zsh");

mkdirSync(targetDir, { recursive: true });
cpSync(source, target);
