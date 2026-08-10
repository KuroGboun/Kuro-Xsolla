import { describe, expect, it } from "vitest";
import { htmlReport } from "../src/html-report.js";
import { summarize } from "../src/summary.js";
import type { ChangedFile, ReviewResult, ValidationResult } from "../src/types.js";

function makeResult(
  changedFiles: ChangedFile[],
  validationResults: ValidationResult[] = [],
): ReviewResult {
  return {
    repositoryPath: "/work/sample",
    baseRef: "main",
    summary: summarize(changedFiles, validationResults),
    changedFiles,
    validationResults,
  };
}

describe("htmlReport", () => {
  it("renders a self-contained page with summary tiles and file rows", () => {
    const html = htmlReport(
      makeResult(
        [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 1 }],
        [{ command: "npm test", status: "failed", exitCode: 1, output: "boom", truncated: false }],
      ),
    );
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("src/a.ts");
    expect(html).toContain("files changed");
    expect(html).toContain("failed (exit 1)");
    // Self-contained: no external requests.
    expect(html).not.toMatch(/src="http|href="http|@import|url\(/);
  });

  it("escapes untrusted paths, commands, and output", () => {
    const html = htmlReport(
      makeResult(
        [
          {
            path: '<script>alert(1)</script>.ts',
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: '<img src=x onerror="alert(2)">',
          },
        ],
        [
          {
            command: "echo <b>hi</b>",
            status: "passed",
            exitCode: 0,
            output: "<script>alert(3)</script>",
            truncated: false,
          },
        ],
      ),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;script&gt;");
  });
});
