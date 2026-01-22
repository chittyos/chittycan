/**
 * Stemcell Brief Tests
 */

import { describe, it, expect } from "vitest";
import { generateStemcellBrief, formatStemcellBrief } from "../src/lib/stemcell";

describe("Stemcell Brief", () => {
  it("should generate brief for current project", async () => {
    const brief = await generateStemcellBrief(process.cwd(), {
      includeInstructions: false,
      includeDependencies: true,
      includeStructure: true,
      juncture: "test-run",
      purpose: "Validate stemcell brief system",
    });

    expect(brief.project.name).toBe("chittycan");
    expect(brief.project.type).toBe("typescript");
    expect(brief.role.juncture).toBe("test-run");
    expect(brief.role.purpose).toBe("Validate stemcell brief system");
    expect(brief.role.capabilities.length).toBeGreaterThan(0);
  });

  it("should include health checks", async () => {
    const brief = await generateStemcellBrief(process.cwd());

    expect(brief.health.status).toBeDefined();
    expect(brief.health.checks).toBeDefined();
    expect(brief.health.checks.length).toBeGreaterThan(0);

    // Should have git check
    const gitCheck = brief.health.checks.find((c) => c.name === "Git repository");
    expect(gitCheck).toBeDefined();
    expect(gitCheck?.status).toBe("pass");
  });

  it("should detect capabilities based on juncture", async () => {
    const emailBrief = await generateStemcellBrief(process.cwd(), {
      juncture: "email-triage",
    });

    expect(emailBrief.role.capabilities).toContain("Read incoming emails");
    expect(emailBrief.role.capabilities).toContain("Classify by priority (high/medium/low)");

    const codeBrief = await generateStemcellBrief(process.cwd(), {
      juncture: "code-review",
    });

    expect(codeBrief.role.capabilities).toContain("Review code changes");
    expect(codeBrief.role.capabilities).toContain("Check for bugs and security issues");
  });

  it("should format brief as readable string", async () => {
    const brief = await generateStemcellBrief(process.cwd(), {
      juncture: "deployment",
      purpose: "Deploy to production",
      upstream: "code-review",
      downstream: "health-check",
    });

    const formatted = formatStemcellBrief(brief);

    expect(formatted).toContain("# Stemcell Brief: chittycan");
    expect(formatted).toContain("## Your Role");
    expect(formatted).toContain("Juncture: deployment");
    expect(formatted).toContain("Purpose: Deploy to production");
    expect(formatted).toContain("Upstream: code-review");
    expect(formatted).toContain("Downstream: health-check");
    expect(formatted).toContain("## System Health");
    expect(formatted).toContain("## Current Context");
  });

  it("should include git context", async () => {
    const brief = await generateStemcellBrief(process.cwd());

    expect(brief.context.branch).toBeDefined();
    expect(typeof brief.context.branch).toBe("string");
    expect(brief.context.branch.length).toBeGreaterThan(0);
    expect(brief.context.recentCommits).toBeDefined();
    expect(brief.context.recentCommits.length).toBeGreaterThan(0);
  });

  it("should load dependencies", async () => {
    const brief = await generateStemcellBrief(process.cwd(), {
      includeDependencies: true,
    });

    expect(brief.dependencies).toBeDefined();
    expect(brief.dependencies?.runtime).toBeDefined();
    expect(brief.dependencies?.runtime["@modelcontextprotocol/sdk"]).toBeDefined();
  });
});
