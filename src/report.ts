import type { ChangedFile, ReviewResult } from "./types.js";

/**
 * Returns a code fence longer than any backtick run inside the text, so
 * untrusted command output cannot escape its fenced block in the report.
 */
export function fenceFor(text: string): string {
  const runs = text.match(/`{3,}/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 2);
  return "`".repeat(longest + 1);
}

function statsFor(file: ChangedFile): string {
  if (file.binary) return "binary";
  return `+${file.additions}/-${file.deletions}`;
}

/**
 * Mermaid pie of changed lines per top-level directory. Mermaid treats the
 * quoted labels as data, but quotes are stripped defensively since file
 * names are untrusted input.
 */
function directoryChart(files: ChangedFile[]): string[] {
  const perDirectory = new Map<string, number>();
  for (const file of files) {
    const lines = file.additions + file.deletions;
    if (lines === 0) continue;
    const slash = file.path.indexOf("/");
    const directory = slash === -1 ? "(root)" : file.path.slice(0, slash);
    perDirectory.set(directory, (perDirectory.get(directory) ?? 0) + lines);
  }
  if (perDirectory.size === 0) return [];

  const sorted = [...perDirectory.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((sum, [, lines]) => sum + lines, 0);
  if (rest > 0) top.push(["other", rest]);

  const lines = ["## Changed lines by directory", "", "```mermaid", "pie showData"];
  for (const [directory, count] of top) {
    lines.push(`  "${directory.replaceAll('"', "")}" : ${count}`);
  }
  lines.push("```", "");
  return lines;
}

export function markdownReport(input: ReviewResult): string {
  const { summary } = input;
  const lines = [
    `# Review Report: ${input.repositoryPath}`,
    "",
    `Base ref: ${input.baseRef}`,
    "",
    "## Summary",
    "",
    `- Files changed: ${summary.totalFiles} (+${summary.additions}/-${summary.deletions})`,
    `- By status: ${Object.entries(summary.byStatus)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ") || "none"}`,
    `- Validations: ${summary.validationsPassed} passed, ${summary.validationsFailed} failed`,
  ];
  if (summary.flags.length > 0) {
    lines.push(`- Flags: ${summary.flags.join("; ")}`);
  }
  lines.push("");

  lines.push(...directoryChart(input.changedFiles));

  lines.push("## Changed files");
  if (input.changedFiles.length === 0) {
    lines.push("", "No changed files.");
  }
  for (const file of input.changedFiles) {
    const rename = file.oldPath ? ` from ${file.oldPath}` : "";
    lines.push(`- ${file.path} (${file.status}${rename}, ${statsFor(file)})`);
  }

  const withPatches = input.changedFiles.filter((file) => file.patch);
  if (withPatches.length > 0) {
    lines.push("", "## Diffs");
    for (const file of withPatches) {
      const fence = fenceFor(file.patch ?? "");
      lines.push(`### ${file.path}`, `${fence}diff`, file.patch ?? "", fence);
      if (file.patchTruncated) {
        lines.push("", "_Patch truncated to size cap._");
      }
    }
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
