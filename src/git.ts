import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile } from "./types.js";

export class GitError extends Error {}

const DEFAULT_PATCH_CHAR_LIMIT = 4_000;

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

/** Branch names tried, in order, when no base ref is given explicitly. */
const DEFAULT_BASE_REF_CANDIDATES = ["main", "master", "develop", "trunk", "dev"];

/**
 * Validates the repository and returns the base ref to diff against.
 * Falls back through common default-branch names when no explicit ref is
 * given; anything outside this list still works via --base-ref.
 */
export function resolveBaseRef(repositoryPath: string, baseRef?: string): string {
  git(repositoryPath, ["rev-parse", "--is-inside-work-tree"]);

  if (baseRef) {
    if (!refExists(repositoryPath, baseRef)) {
      throw new GitError(`base ref "${baseRef}" does not exist in ${repositoryPath}`);
    }
    return baseRef;
  }
  for (const candidate of DEFAULT_BASE_REF_CANDIDATES) {
    if (refExists(repositoryPath, candidate)) {
      return candidate;
    }
  }
  throw new GitError(
    `could not find a default base ref (tried ${DEFAULT_BASE_REF_CANDIDATES.join(", ")}) ` +
      `in ${repositoryPath}; pass one explicitly`,
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

type FileStats = { additions: number; deletions: number; binary: boolean };

/**
 * Parses `git diff --numstat -z` output. Records are
 * `added\tdeleted\tpath NUL` for ordinary changes and
 * `added\tdeleted\t NUL oldpath NUL newpath NUL` for renames/copies.
 * Binary files report `-` for both counts.
 */
function diffStats(repositoryPath: string, baseRef: string): Map<string, FileStats> {
  const output = git(repositoryPath, ["diff", "--numstat", "-z", "-M", `${baseRef}...HEAD`]);
  const tokens = output.split("\0");
  const stats = new Map<string, FileStats>();

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    const [added, deleted, inlinePath] = token.split("\t");
    if (added === undefined || deleted === undefined) continue;
    const binary = added === "-";
    const entry: FileStats = {
      additions: binary ? 0 : Number.parseInt(added, 10),
      deletions: binary ? 0 : Number.parseInt(deleted, 10),
      binary,
    };
    if (inlinePath) {
      stats.set(inlinePath, entry);
    } else {
      // Rename/copy: the two NUL-separated tokens that follow are old, new.
      const newPath = tokens[index + 2];
      index += 2;
      if (newPath) stats.set(newPath, entry);
    }
  }
  return stats;
}

/** Line count for an untracked file; binary content yields no count. */
function untrackedStats(repositoryPath: string, path: string): FileStats {
  try {
    const content = readFileSync(join(repositoryPath, path), "utf8");
    if (content.includes("\0")) return { additions: 0, deletions: 0, binary: true };
    const lines = content.length === 0 ? 0 : content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    return { additions: lines, deletions: 0, binary: false };
  } catch {
    return { additions: 0, deletions: 0, binary: false };
  }
}

function patchFor(
  repositoryPath: string,
  baseRef: string,
  path: string,
  limit: number,
): { patch: string; truncated: boolean } {
  const output = git(repositoryPath, ["diff", "-M", `${baseRef}...HEAD`, "--", path]).trimEnd();
  if (output.length > limit) {
    return { patch: output.slice(0, limit), truncated: true };
  }
  return { patch: output, truncated: false };
}

export type ChangedFilesOptions = {
  includePatches?: boolean;
  patchCharLimit?: number;
};

export function changedFiles(
  repositoryPath: string,
  baseRef: string,
  options: ChangedFilesOptions = {},
): ChangedFile[] {
  const patchCharLimit = options.patchCharLimit ?? DEFAULT_PATCH_CHAR_LIMIT;
  const output = git(repositoryPath, [
    "diff",
    "--name-status",
    "-z",
    "-M",
    `${baseRef}...HEAD`,
  ]);
  const stats = diffStats(repositoryPath, baseRef);

  const tokens = output.split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
  for (let index = 0; index < tokens.length; ) {
    const code = tokens[index++];
    // Renames and copies carry two paths: old, then new.
    let path: string;
    let oldPath: string | undefined;
    if (code[0] === "R" || code[0] === "C") {
      oldPath = tokens[index++];
      path = tokens[index++];
    } else {
      path = tokens[index++];
    }
    const stat = stats.get(path) ?? { additions: 0, deletions: 0, binary: false };
    const file: ChangedFile = {
      path,
      status: statusFor(code),
      additions: stat.additions,
      deletions: stat.deletions,
    };
    if (oldPath) file.oldPath = oldPath;
    if (stat.binary) file.binary = true;
    if (options.includePatches && file.status !== "deleted") {
      const { patch, truncated } = patchFor(repositoryPath, baseRef, path, patchCharLimit);
      if (patch) {
        file.patch = patch;
        if (truncated) file.patchTruncated = true;
      }
    }
    files.push(file);
  }

  const untracked = git(repositoryPath, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  for (const path of untracked.split("\0").filter(Boolean)) {
    const stat = untrackedStats(repositoryPath, path);
    const file: ChangedFile = {
      path,
      status: "untracked",
      additions: stat.additions,
      deletions: stat.deletions,
    };
    if (stat.binary) file.binary = true;
    files.push(file);
  }

  return files;
}
