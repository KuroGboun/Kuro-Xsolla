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
    expect(html).toContain("Files changed");
    expect(html).toContain("failed · exit 1");
    // Self-contained: no external requests (embedded data: URIs are fine).
    expect(html).not.toMatch(/src="http|href="http|@import|url\((?!'data:)/);
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

  it("embeds the Satoshi typeface and wordmark logo as self-contained data URIs", () => {
    const html = htmlReport(makeResult([]));

    // All three weights ship, embedded, not linked (guards the earlier
    // corrupted-base64 regression: a broken font/logo still parses as a
    // data: URI, so length is checked, not just presence of the prefix).
    for (const weight of [400, 500, 700]) {
      const marker = `font-weight:${weight};src:url('data:font/woff2;base64,`;
      const start = html.indexOf(marker);
      expect(start, `weight ${weight} embedded`).toBeGreaterThan(-1);
      const base64Start = start + marker.length;
      const base64End = html.indexOf("'", base64Start);
      expect(base64End - base64Start).toBeGreaterThan(10_000);
    }

    const logoMatch = html.match(/<img src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
    expect(logoMatch).not.toBeNull();
    expect(logoMatch![1].length).toBeGreaterThan(1_000);

    expect(html).toMatch(/font:\s*400 14px\/1\.6 Satoshi/);
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|fontshare\.com/);
  });

  it("renders the dark hero with the cyan-accented headline", () => {
    const html = htmlReport(makeResult([]));
    expect(html).toContain('class="hero-dark"');
    expect(html).toContain('class="accent"');
    expect(html).toContain("read in one pass");
  });

  it("writes a data-driven lede sentence with real counts, not placeholder copy", () => {
    // A test-path file avoids the "source changed without test changes" flag,
    // so this stays a check on the lede's counts rather than on summary.ts.
    const html = htmlReport(
      makeResult(
        [{ path: "test/a.test.ts", status: "modified", additions: 1, deletions: 1 }],
        [{ command: "npm test", status: "failed", exitCode: 1, output: "x", truncated: false }],
      ),
    );
    expect(html).toContain("1 file, 0 review flags, 1 failing check.");
  });
});
