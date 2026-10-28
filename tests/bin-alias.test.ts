import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));

describe("canonical CLI binary surface", () => {
  it("ships chittycan as the automation name and can as the short alias", () => {
    expect(pkg.bin).toEqual({ can: "dist/index.js", chittycan: "dist/index.js" });
  });
});
