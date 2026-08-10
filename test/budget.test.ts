import { describe, expect, it } from "vitest";
import { packReport } from "../src/budget.js";
import { summarize } from "../src/summary.js";
import type { ChangedFile, ReviewResult, ValidationResult } from "../src/types.js";

function makeResult(fileCount: number, validations: ValidationResult[] = []): ReviewResult {
  const changedFiles: ChangedFile[] = Array.from({ length: fileCount }, (_, index) => ({
    path: `src/file-${index}.ts`,
    status: "modified",
    additions: 2,
    deletions: 1,
    patch: `@@ -1 +1 @@\n-old-${index}\n+new-${index}`,
  }));
  return {
    repositoryPath: "/work/sample",
    baseRef: "main",
    summary: summarize(changedFiles, validations),
    changedFiles,
    validationResults: validations,
  };
}

const failing: ValidationResult = {
  command: "npm test",
  status: "failed",
  exitCode: 1,
  output: "assertion failed at foo.ts:12",
  truncated: false,
};
const passing: ValidationResult = {
  command: "npm run lint",
  status: "passed",
  exitCode: 0,
  output: "x".repeat(400),
  truncated: false,
};

describe("packReport", () => {
  it("returns everything when there is no budget", () => {
    const text = packReport(makeResult(3, [failing, passing]));
    expect(text).toContain("## Summary");
    expect(text).toContain("src/file-2.ts");
    expect(text).toContain("Diff: src/file-0.ts");
    expect(text).toContain("npm run lint");
    expect(text).not.toContain("omitted");
  });

  it("keeps summary and failures, drops patches and passing output first", () => {
    const text = packReport(makeResult(3, [failing, passing]), 700);
    expect(text).toContain("## Summary");
    expect(text).toContain("npm test — failed");
    // Patch bodies and passing output are dropped, but named as omitted.
    expect(text).not.toContain("-old-0");
    expect(text).not.toContain("xxxx");
    expect(text).toContain("section omitted (max_chars budget): ### Diff: src/file-0.ts");
    expect(text).toContain("section omitted (max_chars budget): ### npm run lint — passed (exit 0)");
  });

  it("truncates the file list with an explicit marker", () => {
    const text = packReport(makeResult(60), 1_200);
    expect(text).toContain("## Changed files");
    expect(text).toMatch(/… \d+ more file entries omitted \(max_chars budget\)/);
  });

  it("never returns less than the summary even for tiny budgets", () => {
    const text = packReport(makeResult(60, [failing]), 1);
    expect(text).toContain("## Summary");
  });
});
