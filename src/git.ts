import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

export class GitError extends Error {}

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const raw =
      error && typeof error === "object" && "stderr" in error
        ? (error as { stderr: unknown }).stderr
        : undefined;
    const detail = raw
      ? String(raw).trim()
      : error instanceof Error
        ? error.message
        : "";
    throw new GitError(
      `git ${args[0]} failed in ${repositoryPath}${detail ? `: ${detail}` : ""}`,
    );
  }
}

function refExists(repositoryPath: string, ref: string): boolean {
  try {
    git(repositoryPath, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the repository and returns the base ref to diff against.
 * Falls back from main to master when no explicit ref is given.
 */
export function resolveBaseRef(repositoryPath: string, baseRef?: string): string {
  git(repositoryPath, ["rev-parse", "--is-inside-work-tree"]);

  if (baseRef) {
    if (!refExists(repositoryPath, baseRef)) {
      throw new GitError(`base ref "${baseRef}" does not exist in ${repositoryPath}`);
    }
    return baseRef;
  }
  for (const candidate of ["main", "master"]) {
    if (refExists(repositoryPath, candidate)) {
      return candidate;
    }
  }
  throw new GitError(
    `could not find a default base ref (main or master) in ${repositoryPath}; pass one explicitly`,
  );
}

function statusFor(code: string): ChangedFile["status"] {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

export function changedFiles(repositoryPath: string, baseRef: string): ChangedFile[] {
  const output = git(repositoryPath, [
    "diff",
    "--name-status",
    "-z",
    "-M",
    `${baseRef}...HEAD`,
  ]);

  const tokens = output.split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
  for (let index = 0; index < tokens.length; ) {
    const code = tokens[index++];
    // Renames and copies carry two paths: old, then new.
    if (code[0] === "R" || code[0] === "C") {
      const oldPath = tokens[index++];
      const path = tokens[index++];
      files.push({ path, status: statusFor(code), oldPath });
    } else {
      files.push({ path: tokens[index++], status: statusFor(code) });
    }
  }

  const untracked = git(repositoryPath, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  for (const path of untracked.split("\0").filter(Boolean)) {
    files.push({ path, status: "untracked" });
  }

  return files;
}
