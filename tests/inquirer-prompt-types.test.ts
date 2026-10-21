/**
 * Regression test for issue #195.
 *
 * inquirer ^14 removed the "list" prompt type (renamed to "select"). Every
 * `type: "list"` site in src/ threw `Prompt type "list" is not registered` at
 * runtime. This test guards two things with no mocks:
 *
 *   (a) No source file reintroduces `type: "list"` / `type: 'list'`.
 *   (b) Every prompt `type:` literal used in an object that also carries a
 *       `message:` key resolves to a prompt type actually registered by the
 *       installed inquirer (inquirer.prompt.prompts). This catches "list" and
 *       any other typo/removed type against the real API, not a hard-coded list.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import inquirer from "inquirer";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = path.join(ROOT, "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** The set of prompt types the installed inquirer actually registers. */
function registeredTypes(): Set<string> {
  // Both the top-level helper and a fresh module expose the same collection;
  // assert they agree, then use it as the source of truth (the real API, no
  // hard-coded list).
  const top = Object.keys(inquirer.prompt.prompts);
  const fresh = Object.keys(inquirer.createPromptModule().prompts);
  expect(new Set(fresh)).toEqual(new Set(top));
  return new Set(top);
}

/** Return the index just past the matching `)` for an open paren at `open`. */
function matchParen(text: string, open: number): number {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "(") depth++;
    else if (text[j] === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Return the index of the matching `}` for an open brace at `open`. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Yield every prompt `type:` string literal that appears inside an
 * `inquirer.prompt( ... )` call, within an object that also has a `message:`
 * key. Scoping to the prompt call avoids matching unrelated data objects that
 * happen to pair `type` and `message`. Every quoted string in the `type:`
 * expression is read, so a ternary of literals is covered; a type held only in
 * a variable is not.
 */
function* promptTypeLiterals(
  text: string,
): Generator<{ type: string; line: number; call: number }> {
  const CALL = /inquirer\s*\.\s*prompt\s*\(/g;
  for (const call of text.matchAll(CALL)) {
    const openParen = call.index! + call[0].length - 1;
    const closeParen = matchParen(text, openParen);
    if (closeParen === -1) {
      throw new Error(`unbalanced inquirer.prompt( call at offset ${call.index}`);
    }
    const argsStart = openParen + 1;
    const args = text.slice(argsStart, closeParen);

    // Within the call arguments, find each brace-balanced object literal that
    // carries a `message:` key, then read its string-literal `type:`.
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== "{") continue;
      const end = matchBrace(args, i);
      if (end === -1) break;
      const block = args.slice(i, end + 1);
      if (/\bmessage\s*:/.test(block)) {
        // The type may be a literal or an expression of literals
        // (`sensitive ? "password" : "input"`); read every quoted string in it.
        const m = block.match(/\btype\s*:\s*([^,\n}]+)/);
        if (m) {
          const absIndex = argsStart + i + block.indexOf(m[0]);
          const line = text.slice(0, absIndex).split("\n").length;
          for (const lit of m[1].matchAll(/(["'])([^"']+)\1/g)) {
            yield { type: lit[2], line, call: call.index! };
          }
        }
      }
      i = end; // skip past this object; nested objects are covered by block scan
    }
  }
}

describe("inquirer prompt types (issue #195)", () => {
  const files = tsFiles(SRC);

  it("scans a non-empty source tree", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // The scanner walks parens and braces without skipping strings, so an
  // unmatched "(" or "{" in a message could end a call's scan early and hide
  // later prompts. Require every inquirer.prompt( call to yield a typed prompt.
  it("reads a typed prompt from every inquirer.prompt( call", () => {
    const missed: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const calls = [...text.matchAll(/inquirer\s*\.\s*prompt\s*\(/g)].map((c) => c.index!);
      const typed = new Set([...promptTypeLiterals(text)].map((p) => p.call));
      for (const at of calls) {
        if (!typed.has(at)) {
          missed.push(`${path.relative(ROOT, file)}:${text.slice(0, at).split("\n").length}`);
        }
      }
    }
    expect(missed, `prompt calls with no typed prompt read:\n${missed.join("\n")}`).toEqual([]);
  });

  it('has no `type: "list"` / `type: \'list\'` prompts in src/', () => {
    const LIST = /type\s*:\s*(["'])list\1/g;
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((ln, idx) => {
        if (LIST.test(ln)) offenders.push(`${path.relative(ROOT, file)}:${idx + 1}`);
        LIST.lastIndex = 0;
      });
    }
    expect(
      offenders,
      `inquirer removed the "list" type in v14 (use "select"); offenders:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("uses only prompt types registered by the installed inquirer", () => {
    const registered = registeredTypes();
    // Sanity: the real API no longer registers "list" but does register "select".
    expect(registered.has("list")).toBe(false);
    expect(registered.has("select")).toBe(true);

    const offenders: string[] = [];
    let seen = 0;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const { type, line } of promptTypeLiterals(text)) {
        seen++;
        if (!registered.has(type)) {
          offenders.push(`${path.relative(ROOT, file)}:${line} -> type: "${type}"`);
        }
      }
    }

    expect(seen, "found no inquirer prompt objects to check").toBeGreaterThan(0);
    expect(
      offenders,
      `prompt types not registered by installed inquirer (${[...registered].join(", ")}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
