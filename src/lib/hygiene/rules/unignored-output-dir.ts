/**
 * RULE 2 — unignored-output-dir (medium)
 *
 * TWO evidence sources, and `evidence.source` records which one produced the
 * finding, because they are decidable in different environments:
 *
 *   source='declared' — candidate directories read out of COMMITTED manifests
 *     (tsconfig compilerOptions.outDir, package.json script --out-dir/--outdir/
 *     -o/-d flags, wrangler pages_build_output_dir). Decidable in a fresh CI
 *     checkout as well as locally, because the manifest is in the tree.
 *
 *   source='worktree' — untracked directories actually present on disk whose
 *     top segment looks like build output. Only fires when the tree is dirty:
 *     local dev, or CI after a build step. A clean CI checkout produces none.
 *     Do not treat this source as a CI gate; rules 1 and 6 are the pure tree
 *     facts that give the gate its teeth.
 *
 * Both sources ask `git check-ignore` whether the directory is ignored — real
 * gitignore semantics, not a reimplementation.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitFacts } from "../git-facts.js";
import type { Finding } from "../types.js";

const WORKTREE_DIR_NAMES = new Set([
  "out",
  "dist",
  "build",
  "target",
  "lib",
  "esm",
  "cjs",
  ".next",
  ".output",
  ".wrangler",
  "coverage",
]);

function normalizeDir(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!v || v === "." || v.startsWith("/") || v.startsWith("..")) return null;
  return v;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Targeted extractors, not config parsers. tsconfig.json is JSONC in practice
 * and no JSONC parser is in this repo's dependency set, so we match the one key
 * we need with a narrow regex rather than adding a dependency.
 */
async function declaredCandidates(
  root: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // dir -> where it was declared

  const tsconfig = await readIfPresent(join(root, "tsconfig.json"));
  if (tsconfig) {
    const m = /"outDir"\s*:\s*"([^"]+)"/.exec(tsconfig);
    const dir = m && normalizeDir(m[1]);
    if (dir) out.set(dir, "tsconfig.json compilerOptions.outDir");
  }

  const pkgRaw = await readIfPresent(join(root, "package.json"));
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
      for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
        if (typeof script !== "string") continue;
        // Long forms only, and the captured value must not itself be a flag.
        // Bare `-o` / `-d` are excluded on purpose: `-d` is --declaration in tsc
        // and --detach in docker (neither takes a value), so matching them turns
        // `tsc -d -p .` into a bogus "output directory `-p`" finding.
        const flag =
          /(?:^|\s)(?:--out-dir|--outdir|--outDir)[= ]+(?!-)(\S+)/.exec(script);
        const dir = flag && normalizeDir(flag[1].replace(/^["']|["']$/g, ""));
        if (dir && !out.has(dir)) {
          out.set(dir, `package.json scripts.${name}`);
        }
      }
    } catch {
      // Unparseable package.json is not this rule's business.
    }
  }

  for (const name of ["wrangler.toml", "wrangler.jsonc", "wrangler.json"]) {
    const raw = await readIfPresent(join(root, name));
    if (!raw) continue;
    const m =
      /(?:pages_build_output_dir\s*=\s*"([^"]+)")|(?:"pages_build_output_dir"\s*:\s*"([^"]+)")/.exec(
        raw,
      );
    const dir = m && normalizeDir(m[1] ?? m[2] ?? "");
    if (dir && !out.has(dir)) {
      out.set(dir, `${name} pages_build_output_dir`);
    }
  }

  return out;
}

export async function unignoredOutputDir(facts: GitFacts): Promise<Finding[]> {
  const findings: Finding[] = [];

  // (a) declared
  const declared = await declaredCandidates(facts.root);
  const declaredDirs = [...declared.keys()];
  const declaredIgnored = await facts.checkIgnored(declaredDirs);
  for (const dir of declaredDirs) {
    if (declaredIgnored.has(dir)) continue;
    findings.push({
      id: `unignored-output-dir:declared:${dir}`,
      severity: "medium",
      title: `Declared build output directory is not gitignored: ${dir}/`,
      description:
        `\`${dir}/\` is declared as build output in ${declared.get(dir)}, but ` +
        `\`git check-ignore\` does not match it. Generated files there can be ` +
        `committed by accident.`,
      evidence: {
        rule: "unignored-output-dir",
        source: "declared",
        path: dir,
        declared_in: declared.get(dir),
      },
      remediation_hint: `Add \`${dir}/\` to .gitignore.`,
    });
  }

  // (b) worktree
  const seen = new Set<string>();
  for (const path of facts.untracked) {
    const top = path.split("/")[0];
    if (!WORKTREE_DIR_NAMES.has(top)) continue;
    if (path === top) continue; // a bare file named e.g. "lib", not a directory
    seen.add(top);
  }
  const worktreeDirs = [...seen].filter((d) => !declared.has(d));
  const worktreeIgnored = await facts.checkIgnored(worktreeDirs);
  for (const dir of worktreeDirs) {
    if (worktreeIgnored.has(dir)) continue;
    const examples = facts.untracked
      .filter((p) => p.startsWith(`${dir}/`))
      .slice(0, 5);
    findings.push({
      id: `unignored-output-dir:worktree:${dir}`,
      severity: "medium",
      title: `Untracked output directory is not gitignored: ${dir}/`,
      description:
        `\`${dir}/\` exists in the worktree with untracked contents and is not ` +
        `matched by \`git check-ignore\`. It is not declared in any committed ` +
        `manifest either, so nothing in the repo explains it — one \`git add -A\` ` +
        `commits it. This source only fires on a dirty tree, so it is a local/` +
        `post-build signal, not a clean-checkout CI fact.`,
      evidence: {
        rule: "unignored-output-dir",
        source: "worktree",
        path: dir,
        untracked_example_paths: examples,
        untracked_file_count: facts.untracked.filter((p) =>
          p.startsWith(`${dir}/`),
        ).length,
      },
      remediation_hint: `Add \`${dir}/\` to .gitignore (or delete it if it is stale).`,
    });
  }

  return findings;
}
