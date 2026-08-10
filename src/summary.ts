import type { ChangedFile, ReviewSummary, ValidationResult } from "./types.js";

const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
]);

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|swift|rs|c|cc|cpp|h|cs)$/;
const TEST_PATH = /(^|\/)(tests?|specs?|__tests__)(\/|$)|\.(test|spec)\.[^/]+$/;
const LARGE_CHANGE_LINES = 500;

export function summarize(
  files: ChangedFile[],
  validations: ValidationResult[],
): ReviewSummary {
  const byStatus: ReviewSummary["byStatus"] = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
  };
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    byStatus[file.status] += 1;
    additions += file.additions;
    deletions += file.deletions;
  }

  const flags: string[] = [];
  const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  if (files.some((file) => LOCKFILES.has(basename(file.path)))) {
    flags.push("lockfile changed");
  }
  if (files.some((file) => file.path.startsWith(".github/") || basename(file.path) === "Jenkinsfile" || basename(file.path) === ".gitlab-ci.yml")) {
    flags.push("CI configuration changed");
  }
  const sourceChanged = files.some(
    (file) => SOURCE_EXTENSIONS.test(file.path) && !TEST_PATH.test(file.path),
  );
  const testsChanged = files.some((file) => TEST_PATH.test(file.path));
  if (sourceChanged && !testsChanged) {
    flags.push("source changed without test changes");
  }
  if (additions + deletions > LARGE_CHANGE_LINES) {
    flags.push(`large change (>${LARGE_CHANGE_LINES} lines)`);
  }
  if (files.some((file) => file.binary)) {
    flags.push("binary files changed");
  }

  return {
    totalFiles: files.length,
    additions,
    deletions,
    byStatus,
    validationsPassed: validations.filter((entry) => entry.status === "passed").length,
    validationsFailed: validations.filter((entry) => entry.status === "failed").length,
    flags,
  };
}
