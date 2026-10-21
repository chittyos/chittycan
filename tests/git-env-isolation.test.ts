import { describe, it, expect } from "vitest";

// Pins tests/setup-git-env.ts. Trivially green in CI, where no GIT_* is set;
// it bites when the suite runs from a git hook, or under
// `GIT_DIR=... npx vitest run`.
describe("test environment", () => {
  it("passes no GIT_* variable to test code", () => {
    expect(Object.keys(process.env).filter((k) => k.startsWith("GIT_"))).toEqual([]);
  });
});
