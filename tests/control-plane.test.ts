import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeJwtClaims } from "../src/lib/control-plane.js";
import { validatePlteaFiles } from "../src/commands/control-plane.js";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("control-plane OIDC handling", () => {
  it("decodes claims without persisting the token", () => {
    const token = `${b64url({ alg: "none" })}.${b64url({ repository: "chittyos/chittycan", exp: 4102444800 })}.sig`;
    expect(decodeJwtClaims(token)).toMatchObject({ repository: "chittyos/chittycan", exp: 4102444800 });
  });
});

describe("strict P/L/T/E/A frontmatter validation", () => {
  it("accepts canonical bindings and temporal fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-pltea-"));
    const file = path.join(dir, "SOP.md");
    fs.writeFileSync(file, `---\nworkflow_gate: "Read -> Analyze -> Draft -> Approve -> Write"\nCanon_Bindings:\n  persons_p: ["P:LEGAL_01"]\n  locations_l: ["L:US_IL_COOK"]\n  things_t: ["T:SOP_DOC"]\n  events_e: ["E:PR_MERGE"]\n  authorities_a: ["A:POLICY"]\nTemporal_Bounds:\n  effective_from: "2026-10-28T00:00:00Z"\n  effective_until: null\n---\n# SOP\n`);
    const result = validatePlteaFiles([file], {
      requireWorkflowGate: "Read -> Analyze -> Draft -> Approve -> Write",
      forbidStaticEntities: true,
    });
    expect(result.valid).toBe(true);
  });

  it("fails closed on ontology inversions and invalid time", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chittycan-pltea-"));
    const file = path.join(dir, "bad.md");
    fs.writeFileSync(file, `---\nCanon_Bindings:\n  persons_p: ["E:ARIBIA_LLC"]\n  things_t: ["T:2026-10-28"]\n  authorities_a: ["T:EXHIBIT_1"]\nTemporal_Bounds:\n  effective_from: "not-a-date"\n---\n# Bad\n`);
    const result = validatePlteaFiles([file]);
    expect(result.valid).toBe(false);
    expect(result.files[0].violations.length).toBeGreaterThanOrEqual(3);
  });
});
