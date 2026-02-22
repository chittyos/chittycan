import fs from "fs";
import os from "os";
import path from "path";
import { nudgeQuiet } from "./nudge.js";

const CHECKPOINT_LOG = path.join(os.homedir(), ".cache", "chitty_checkpoints.log");

export function checkpoint(message?: string): void {
  const msg = message || "Checkpoint";
  const timestamp = new Date().toISOString();

  // Ensure directory exists
  fs.mkdirSync(path.dirname(CHECKPOINT_LOG), { recursive: true });

  // Append to log
  fs.appendFileSync(CHECKPOINT_LOG, `${timestamp} | ${msg}\n`, "utf8");

  console.log(`[chitty] Checkpoint saved: ${msg}`);

  // Show nudge
  nudgeQuiet();
}

export function listCheckpoints(limit: number = 10): void {
  if (!fs.existsSync(CHECKPOINT_LOG)) {
    console.log("[chitty] No checkpoints yet");
    return;
  }

  const content = fs.readFileSync(CHECKPOINT_LOG, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);

  const recent = lines.slice(-limit).reverse();

  console.log(`\nRecent checkpoints (last ${Math.min(limit, recent.length)}):\n`);
  recent.forEach(line => {
    const [timestamp, ...messageParts] = line.split(" | ");
    const message = messageParts.join(" | ");
    const date = new Date(timestamp);
    console.log(`  ${date.toLocaleString()} - ${message}`);
  });
  console.log();
}
