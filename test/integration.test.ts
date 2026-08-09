import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  writeFileSync(join(repo, "untracked.txt"), "loose\n");
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

  it("classifies modified, renamed, and untracked files", () => {
    const files = changedFiles(repo, "master");
    expect(files).toContainEqual({ path: "a.txt", status: "modified" });
    expect(files).toContainEqual({ path: "c.txt", status: "renamed", oldPath: "b.txt" });
    expect(files).toContainEqual({ path: "new.txt", status: "added" });
    expect(files).toContainEqual({ path: "untracked.txt", status: "untracked" });
  });
});

describe("reviewRepository end to end", () => {
  it("produces a markdown report with failed validations without throwing", async () => {
    const report = await reviewRepository({
      repositoryPath: repo,
      validationCommands: ["echo checked", "exit 2"],
    });
    expect(report).toContain("Base ref: master");
    expect(report).toContain("a.txt (modified)");
    expect(report).toContain("echo checked — passed (exit 0)");
    expect(report).toContain("exit 2 — failed (exit 2)");
  });

  it("produces machine-readable JSON when requested", async () => {
    const report = await reviewRepository({ repositoryPath: repo, format: "json" });
    const parsed = JSON.parse(report);
    expect(parsed.baseRef).toBe("master");
    expect(parsed.changedFiles.length).toBeGreaterThan(0);
  });

  it("exposes structured results for adapters", async () => {
    const result = await collectReview({ repositoryPath: repo });
    expect(result.validationResults).toEqual([]);
    expect(result.changedFiles.some((file) => file.status === "renamed")).toBe(true);
  });
});
