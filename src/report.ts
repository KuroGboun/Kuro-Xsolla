import type { ReviewResult } from "./types.js";

/**
 * Returns a code fence longer than any backtick run inside the text, so
 * untrusted command output cannot escape its fenced block in the report.
 */
function fenceFor(text: string): string {
  const runs = text.match(/`{3,}/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 2);
  return "`".repeat(longest + 1);
}

export function markdownReport(input: ReviewResult): string {
  const lines = [
    `# Review Report: ${input.repositoryPath}`,
    "",
    `Base ref: ${input.baseRef}`,
    "",
    "## Changed files",
  ];

  if (input.changedFiles.length === 0) {
    lines.push("", "No changed files.");
  }
  for (const file of input.changedFiles) {
    const rename = file.oldPath ? ` from ${file.oldPath}` : "";
    lines.push(`- ${file.path} (${file.status}${rename})`);
  }

  lines.push("", "## Validation output");
  if (input.validationResults.length === 0) {
    lines.push("", "No validation commands were run.");
  }
  for (const result of input.validationResults) {
    const exitCode = result.exitCode === null ? "killed" : `exit ${result.exitCode}`;
    const fence = fenceFor(result.output);
    lines.push(`### ${result.command} — ${result.status} (${exitCode})`, fence, result.output, fence);
    if (result.truncated) {
      lines.push("", "_Output truncated to size cap._");
    }
  }
  return lines.join("\n");
}
