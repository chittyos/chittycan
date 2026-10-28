#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const roots = [".github/workflows", "scripts", "templates"];
const allowedExtensions = new Set([".yml", ".yaml", ".sh", ".bash", ".zsh", ".js", ".mjs", ".cjs", ".ts"]);
const self = "scripts/check-no-raw-control-plane-http.mjs";

const controlPlaneTargets = [
  "connect.chitty.cc",
  "canon.chitty.cc",
  "config.chitty.cc",
  "/api/v1/capabilities/",
  "/api/v1/graph/resolve",
  "/api/v1/pr/",
  "/api/v1/config/",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(full));
    else if (name.isFile() && allowedExtensions.has(extname(name.name))) out.push(full);
  }
  return out;
}

const violations = [];
for (const relRoot of roots) {
  const dir = join(root, relRoot);
  try {
    if (!statSync(dir).isDirectory()) continue;
  } catch {
    continue;
  }

  for (const file of walk(dir)) {
    const rel = relative(root, file);
    if (rel === self) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const hitsControlPlane = controlPlaneTargets.some((target) => line.includes(target));
      const usesRawHttp = /\bcurl\b|\bwget\b|\bnode\s+-e\b/.test(line);
      if (hitsControlPlane && usesRawHttp) {
        violations.push(`${rel}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length) {
  console.error(
    [
      "Raw ChittyOS control-plane HTTP is prohibited in workflows/scripts/templates.",
      "Use the canonical chittycan CLI instead; Workers use Service Bindings internally.",
      ...violations,
    ].join("\n"),
  );
  process.exit(1);
}

console.log("No raw ChittyOS control-plane HTTP found; chittycan remains canonical.");
