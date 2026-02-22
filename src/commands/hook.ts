import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function installZsh(): void {
  const zshrc = path.join(os.homedir(), ".zshrc");
  const cfgDir = path.join(os.homedir(), ".config", "chitty");
  const targetSnippet = path.join(cfgDir, "snippets.zsh");

  // Ensure config directory exists
  fs.mkdirSync(cfgDir, { recursive: true });

  // Copy snippets.zsh to config directory
  const sourceSnippet = path.resolve(__dirname, "../zsh/snippets.zsh");
  fs.copyFileSync(sourceSnippet, targetSnippet);

  // Prepare the snippet to add to .zshrc
  const snippet = `
# >>> chitty (do not edit) >>>
export CHITTY_NUDGE_INTERVAL_MINUTES=\${CHITTY_NUDGE_INTERVAL_MINUTES:-45}
source "${targetSnippet}"
# <<< chitty <<<
`;

  // Check if already installed
  if (fs.existsSync(zshrc)) {
    const content = fs.readFileSync(zshrc, "utf8");
    if (content.includes(">>> chitty")) {
      console.log("[chitty] Hooks already installed in ~/.zshrc");
      return;
    }
  }

  // Append to .zshrc
  fs.appendFileSync(zshrc, snippet, "utf8");

  console.log("[chitty] ✓ Zsh hooks installed");
  console.log("  → Run: source ~/.zshrc");
  console.log("  → Press Ctrl-G to open tracker");
  console.log("  → Use 'ai_checkpoint \"message\"' to log checkpoints");
}

export function uninstallZsh(): void {
  const zshrc = path.join(os.homedir(), ".zshrc");
  const cfgDir = path.join(os.homedir(), ".config", "chitty");
  const targetSnippet = path.join(cfgDir, "snippets.zsh");

  if (!fs.existsSync(zshrc)) {
    console.log("[chitty] No .zshrc found");
    return;
  }

  // Read .zshrc
  let content = fs.readFileSync(zshrc, "utf8");

  // Remove chitty block
  const regex = /\n# >>> chitty.*?# <<< chitty <<<\n/s;
  if (!regex.test(content)) {
    console.log("[chitty] Hooks not found in ~/.zshrc");
    return;
  }

  content = content.replace(regex, "");
  fs.writeFileSync(zshrc, content, "utf8");

  // Remove snippets file
  if (fs.existsSync(targetSnippet)) {
    fs.unlinkSync(targetSnippet);
  }

  console.log("[chitty] ✓ Zsh hooks uninstalled");
  console.log("  → Run: source ~/.zshrc");
}
