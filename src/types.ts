export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  /** Previous path for renamed files. */
  oldPath?: string;
  additions: number;
  deletions: number;
  /** True when git reports the file as binary (no line counts). */
  binary?: boolean;
  /** Unified diff for this file; present only when patches were requested. */
  patch?: string;
  /** True when the patch exceeded the size cap and was cut off. */
  patchTruncated?: boolean;
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  /** Process exit code; null when the process was killed (e.g. timeout). */
  exitCode: number | null;
  output: string;
  /** True when output exceeded the size cap and was cut off. */
  truncated: boolean;
};

export type ReviewSummary = {
  totalFiles: number;
  additions: number;
  deletions: number;
  byStatus: Record<ChangedFile["status"], number>;
  validationsPassed: number;
  validationsFailed: number;
  /** Human-readable review heuristics, e.g. "lockfile changed". */
  flags: string[];
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json" | "html";
  /** Include per-file unified diffs (size-capped). Off by default. */
  includePatches?: boolean;
};

export type ReviewResult = {
  repositoryPath: string;
  baseRef: string;
  summary: ReviewSummary;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};
