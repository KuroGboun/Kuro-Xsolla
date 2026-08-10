import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { collectReview, reviewRepository } from "../src/core.js";
import { changedFiles, resolveBaseRef } from "../src/git.js";

let repo: string;

function git(args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

beforeAll(() => {
  // Directory name intentionally contains spaces to cover path handling.
  repo = mkdtempSync(join(tmpdir(), "inspector it "));
  git(["init", "-b", "master"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);

  writeFileSync(join(repo, "a.txt"), "one\n");
  writeFileSync(join(repo, "b.txt"), "two\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);

  git(["checkout", "-b", "feature"]);
  writeFileSync(join(repo, "a.txt"), "one changed\n");
  git(["mv", "b.txt", "c.txt"]);
  writeFileSync(join(repo, "new.txt"), "new\n");
  git(["add", "."]);
  git(["commit", "-m", "changes"]);
  writeFileSync(join(repo, "untracked.txt"), "loose\nlines\n");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("git inspection", () => {
  it("falls back to master when main does not exist", () => {
    expect(resolveBaseRef(repo)).toBe("master");
  });

  it("rejects unknown base refs and non-repos", () => {
    expect(() => resolveBaseRef(repo, "does-not-exist")).toThrow(/does not exist/);
    expect(() => resolveBaseRef(tmpdir())).toThrow(/git rev-parse failed/);
  });

  it("falls back beyond main/master to develop, trunk, and dev", () => {
    for (const branch of ["develop", "trunk", "dev"]) {
      const solo = mkdtempSync(join(tmpdir(), `inspector-${branch}-`));
      execFileSync("git", ["init", "-b", branch], { cwd: solo, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: solo, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: solo, stdio: "pipe" });
      execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: solo, stdio: "pipe" });
      writeFileSync(join(solo, "a.txt"), "one\n");
      execFileSync("git", ["add", "."], { cwd: solo, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "base"], { cwd: solo, stdio: "pipe" });

      expect(resolveBaseRef(solo)).toBe(branch);
      rmSync(solo, { recursive: true, force: true });
    }
  });

  it("classifies files and reports line stats", () => {
    const files = changedFiles(repo, "master");
    expect(files).toContainEqual({
      path: "a.txt",
      status: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(files).toContainEqual({
      path: "c.txt",
      status: "renamed",
      oldPath: "b.txt",
      additions: 0,
      deletions: 0,
    });
    expect(files).toContainEqual({
      path: "new.txt",
      status: "added",
      additions: 1,
      deletions: 0,
    });
    expect(files).toContainEqual({
      path: "untracked.txt",
      status: "untracked",
      additions: 2,
      deletions: 0,
    });
  });

  it("attaches capped patches when requested", () => {
    const files = changedFiles(repo, "master", { includePatches: true, patchCharLimit: 40 });
    const modified = files.find((file) => file.path === "a.txt");
    expect(modified?.patch).toBeTruthy();
    expect(modified?.patch?.length).toBeLessThanOrEqual(40);
    expect(modified?.patchTruncated).toBe(true);
  });
});

describe("reviewRepository end to end", () => {
  it("produces a markdown report with summary, stats, and failed validations", async () => {
    const report = await reviewRepository({
      repositoryPath: repo,
      validationCommands: ["echo checked", "exit 2"],
    });
    expect(report).toContain("Base ref: master");
    expect(report).toContain("## Summary");
    expect(report).toContain("Validations: 1 passed, 1 failed");
    expect(report).toContain("a.txt (modified, +1/-1)");
    expect(report).toContain("echo checked — passed (exit 0)");
    expect(report).toContain("exit 2 — failed (exit 2)");
  });

  it("produces machine-readable JSON with a summary block", async () => {
    const report = await reviewRepository({ repositoryPath: repo, format: "json" });
    const parsed = JSON.parse(report);
    expect(parsed.baseRef).toBe("master");
    expect(parsed.summary.totalFiles).toBeGreaterThan(0);
    expect(parsed.summary.byStatus.renamed).toBe(1);
  });

  it("produces an html report", async () => {
    const report = await reviewRepository({ repositoryPath: repo, format: "html" });
    expect(report).toContain("<!doctype html>");
    expect(report).toContain("a.txt");
  });

  it("exposes structured results for adapters", async () => {
    const result = await collectReview({ repositoryPath: repo });
    expect(result.validationResults).toEqual([]);
    expect(result.changedFiles.some((file) => file.status === "renamed")).toBe(true);
  });
});

describe("relative repository paths", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("resolves '.' to an absolute path instead of reporting it literally", async () => {
    process.chdir(repo);
    const result = await collectReview({ repositoryPath: "." });
    expect(result.repositoryPath).toBe(resolve("."));
    expect(result.repositoryPath).not.toBe(".");
    expect(basename(result.repositoryPath)).toBe(basename(repo));
  });

  it("carries the resolved path into every report format", async () => {
    process.chdir(repo);
    const markdown = await reviewRepository({ repositoryPath: "." });
    expect(markdown).not.toContain("Review Report: .\n");
    expect(markdown).toContain(`Review Report: ${resolve(".")}`);

    const html = await reviewRepository({ repositoryPath: ".", format: "html" });
    expect(html).toContain(`<title>Review report · ${basename(repo)}</title>`);
    expect(html).not.toContain(">.<");
  });
});
