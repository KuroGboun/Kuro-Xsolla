import { describe, expect, it } from "vitest";
import { summarize } from "../src/summary.js";
import type { ChangedFile } from "../src/types.js";

const file = (path: string, additions = 1, deletions = 0): ChangedFile => ({
  path,
  status: "modified",
  additions,
  deletions,
});

describe("summarize", () => {
  it("totals files, lines, and validation outcomes", () => {
    const summary = summarize(
      [file("src/a.ts", 3, 1), { ...file("b.txt"), status: "added" }],
      [
        { command: "a", status: "passed", exitCode: 0, output: "", truncated: false },
        { command: "b", status: "failed", exitCode: 1, output: "", truncated: false },
      ],
    );
    expect(summary.totalFiles).toBe(2);
    expect(summary.additions).toBe(4);
    expect(summary.deletions).toBe(1);
    expect(summary.byStatus.modified).toBe(1);
    expect(summary.byStatus.added).toBe(1);
    expect(summary.validationsPassed).toBe(1);
    expect(summary.validationsFailed).toBe(1);
  });

  it("flags lockfiles, CI config, and untested source changes", () => {
    const summary = summarize(
      [file("package-lock.json"), file(".github/workflows/ci.yml"), file("src/core.ts")],
      [],
    );
    expect(summary.flags).toContain("lockfile changed");
    expect(summary.flags).toContain("CI configuration changed");
    expect(summary.flags).toContain("source changed without test changes");
  });

  it("does not flag missing tests when tests changed, and flags large changes", () => {
    const summary = summarize([file("src/core.ts", 600, 0), file("test/core.test.ts")], []);
    expect(summary.flags).not.toContain("source changed without test changes");
    expect(summary.flags).toContain("large change (>500 lines)");
  });
});
