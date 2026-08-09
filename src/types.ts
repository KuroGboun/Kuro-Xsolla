export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  /** Previous path for renamed files. */
  oldPath?: string;
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

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};

export type ReviewResult = {
  repositoryPath: string;
  baseRef: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};
