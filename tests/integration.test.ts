/**
 * Integration Tests
 */

import { describe, it, expect } from "vitest";
import { generateStemcellBrief } from "../src/lib/stemcell";
import { briefAI } from "../src/plugins/ai/stemcell-integration";

describe("Integration Tests", () => {
  it("should integrate stemcell with AI briefing", async () => {
    const brief = await briefAI({
      task: "Review code for security issues",
      projectPath: process.cwd(),
      includeFullContext: false,
    });

    expect(brief).toContain("Stemcell Brief: chittycan");
    expect(brief).toContain("Current Task");
    expect(brief).toContain("Review code for security issues");
    expect(brief).toContain("Instructions");
  });

  it("should show health status in brief", async () => {
    const brief = await briefAI({
      task: "Deploy to production",
      projectPath: process.cwd(),
    });

    expect(brief).toContain("System Health");
    expect(brief).toContain("Git repository");
    expect(brief).toContain("Dependencies installed");
  });

  it("should generate brief for different junctures", async () => {
    const emailBrief = await generateStemcellBrief(process.cwd(), {
      juncture: "email-triage",
      purpose: "Triage incoming legal emails",
      downstream: "document-analysis",
    });

    expect(emailBrief.role.juncture).toBe("email-triage");
    expect(emailBrief.role.capabilities).toContain("Classify by priority (high/medium/low)");
    expect(emailBrief.role.downstream).toBe("document-analysis");

    const deployBrief = await generateStemcellBrief(process.cwd(), {
      juncture: "deployment",
      purpose: "Deploy ChittyCan to production",
      upstream: "code-review",
    });

    expect(deployBrief.role.juncture).toBe("deployment");
    expect(deployBrief.role.capabilities).toContain("Deploy to staging/production");
    expect(deployBrief.role.upstream).toBe("code-review");
  });
});
