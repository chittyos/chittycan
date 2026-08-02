/**
 * RULE 6 — deployed-without-source (critical)
 *
 * A wrangler config names an entrypoint (`main`) that does not exist in git.
 * Whatever is running in production therefore cannot be attributed to any
 * commit in this repository.
 *
 * Downgraded to `high` when the same config declares a `[build] command`, since
 * the entrypoint could legitimately be generated at build time.
 *
 * `main` extraction is a TARGETED EXTRACTOR, NOT A CONFIG PARSER. No TOML or
 * JSONC parser is in this repo's dependencies and Phase 1 adds none, so we match
 * exactly two shapes on a single line — `main = "..."` (TOML) and `"main": "..."`
 * (JSON/JSONC) — outside of comments. It will miss single-quoted TOML values,
 * multi-line values, and `main` keys nested inside `[env.*]` tables. Those are
 * false negatives, not false positives.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const CONFIG_BASENAMES = new Set([
  "wrangler.toml",
  "wrangler.jsonc",
  "wrangler.json",
]);

function extractMain(content: string): string | null {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#") || line.startsWith("//")) continue;
    const toml = /^main\s*=\s*"([^"]+)"/.exec(line);
    if (toml) return toml[1];
    const json = /^"main"\s*:\s*"([^"]+)"/.exec(line);
    if (json) return json[1];
  }
  return null;
}

function hasBuildCommand(content: string, basename: string): boolean {
  if (basename === "wrangler.toml") {
    // A [build] table whose body declares `command = "..."`.
    const idx = content.indexOf("[build]");
    if (idx === -1) return false;
    const rest = content.slice(idx + "[build]".length);
    const nextTable = rest.search(/^\s*\[/m);
    const body = nextTable === -1 ? rest : rest.slice(0, nextTable);
    return /^\s*command\s*=\s*"/m.test(body);
  }
  return /"build"\s*:\s*\{[^}]*"command"\s*:\s*"/s.test(content);
}

/** Normalize a wrangler `main` value against the config file's directory. */
function resolveMain(configPath: string, main: string): string {
  const dir = configPath.includes("/")
    ? configPath.slice(0, configPath.lastIndexOf("/"))
    : "";
  const cleaned = main.replace(/^\.\//, "");
  const joined = dir ? `${dir}/${cleaned}` : cleaned;
  const parts: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export async function deployedWithoutSource(
  facts: GitFacts,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const configs = facts.trackedList.filter((p) =>
    CONFIG_BASENAMES.has(p.split("/").pop() ?? ""),
  );

  for (const configPath of configs) {
    let content: string;
    try {
      content = await readFile(join(facts.root, configPath), "utf8");
    } catch {
      continue;
    }
    const main = extractMain(content);
    if (!main) continue;

    const resolved = resolveMain(configPath, main);
    // Equivalent to `git ls-files -- <resolved>` being empty: neither the exact
    // path nor anything beneath it (if `main` points at a directory) is tracked.
    const tracked =
      facts.tracked.has(resolved) ||
      facts.trackedList.some((p) => p.startsWith(`${resolved}/`));
    if (tracked) continue;

    const generated = hasBuildCommand(content, configPath.split("/").pop() ?? "");

    findings.push({
      id: `deployed-without-source:${configPath}`,
      severity: generated ? "high" : "critical",
      title: `${configPath} declares main="${main}" but ${resolved} is not in git`,
      description:
        `\`${configPath}\` sets \`main = "${main}"\`, which resolves to ` +
        `\`${resolved}\`. \`git ls-files\` returns nothing for that path, so the ` +
        `entrypoint of this deployed Worker does not exist in the repository. ` +
        (generated
          ? "The config declares a `[build] command`, so the entrypoint may be " +
            "generated at build time — downgraded from critical to high, but the " +
            "build inputs still need to be verifiably in git."
          : "Nothing in the config generates it either. Whatever is running in " +
            "production cannot be attributed to any commit here, and it cannot " +
            "be reviewed, audited, or rebuilt from this repository."),
      evidence: {
        rule: "deployed-without-source",
        path: configPath,
        main,
        resolved_path: resolved,
        tracked_file_count: facts.trackedList.length,
        has_build_command: generated,
      },
      remediation_hint: generated
        ? `Confirm the build inputs that produce ${resolved} are tracked, and record where the deployed bytes come from.`
        : `Commit the real source for ${resolved}, or correct \`main\` in ${configPath} to point at tracked source.`,
    });
  }

  return findings;
}
