import { describe, expect, it } from "vitest";
import { defaultOutputPath, parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  it("keeps repository paths containing spaces intact", () => {
    const args = parseArgs(["review", "--repo", "/Users/kuro/kuro @ xsolla/project"]);
    expect(args.repositoryPath).toBe("/Users/kuro/kuro @ xsolla/project");
  });

  it("collects multiple validation commands", () => {
    const args = parseArgs(["review", "--repo", ".", "--validate", "npm test", "--validate", "npm run lint"]);
    expect(args.validations).toEqual(["npm test", "npm run lint"]);
  });

  it("supports format, output, patches, and stdout output", () => {
    const args = parseArgs([
      "review", "--repo", ".", "--format", "html", "--out", "-", "--patches",
    ]);
    expect(args.format).toBe("html");
    expect(args.outputPath).toBe("-");
    expect(args.includePatches).toBe(true);
  });

  it("rejects missing flag values", () => {
    expect(() => parseArgs(["review", "--repo"])).toThrow(/missing value for --repo/);
    expect(() => parseArgs(["review", "--repo", "--validate", "x"])).toThrow(/missing value/);
  });

  it("rejects unsupported formats and unknown flags", () => {
    expect(() => parseArgs(["review", "--repo", ".", "--format", "yaml"])).toThrow(/unsupported format/);
    expect(() => parseArgs(["review", "--repo", ".", "--frmt", "json"])).toThrow(/unknown argument/);
  });
});

describe("defaultOutputPath", () => {
  it("matches the chosen format", () => {
    expect(defaultOutputPath("markdown")).toBe("review-report.md");
    expect(defaultOutputPath("json")).toBe("review-report.json");
    expect(defaultOutputPath("html")).toBe("review-report.html");
  });
});
