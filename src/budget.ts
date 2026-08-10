import { fenceFor } from "./report.js";
import type { ReviewResult } from "./types.js";

export const MIN_BUDGET_CHARS = 500;

type Block = {
  /** Position in the rendered document. */
  order: number;
  /** Lower number = kept first when the budget is tight. */
  priority: number;
  lines: string[];
  /** For list blocks: marker template when only partially included. */
  omissionMarker?: (omitted: number) => string;
  /** Lines that must stay together (non-list blocks). */
  atomic: boolean;
};

function validationBlock(
  result: ReviewResult["validationResults"][number],
  order: number,
  priority: number,
): Block {
  const exitCode = result.exitCode === null ? "killed" : `exit ${result.exitCode}`;
  const fence = fenceFor(result.output);
  const lines = [
    `### ${result.command} — ${result.status} (${exitCode})`,
    fence,
    result.output,
    fence,
  ];
  if (result.truncated) lines.push("", "_Output truncated to size cap._");
  return { order, priority, lines, atomic: true };
}

/**
 * Renders a markdown report that fits within maxChars, dropping the least
 * important content first: summary and failed validations are kept above
 * the file list, which is kept above passing-validation output, which is
 * kept above patches. Every omission is explicitly marked so an AI client
 * knows the report is partial and can re-request with a larger budget.
 */
export function packReport(result: ReviewResult, maxChars?: number): string {
  const limit = maxChars === undefined ? Infinity : Math.max(maxChars, MIN_BUDGET_CHARS);
  const { summary } = result;

  const blocks: Block[] = [];
  blocks.push({
    order: 0,
    priority: 0,
    atomic: true,
    lines: [
      `# Review Report: ${result.repositoryPath}`,
      "",
      `Base ref: ${result.baseRef}`,
      "",
      "## Summary",
      "",
      `- Files changed: ${summary.totalFiles} (+${summary.additions}/-${summary.deletions})`,
      `- Validations: ${summary.validationsPassed} passed, ${summary.validationsFailed} failed`,
      ...(summary.flags.length > 0 ? [`- Flags: ${summary.flags.join("; ")}`] : []),
      "",
    ],
  });

  const failed = result.validationResults.filter((entry) => entry.status === "failed");
  const passed = result.validationResults.filter((entry) => entry.status === "passed");
  failed.forEach((entry, index) => blocks.push(validationBlock(entry, 30 + index, 1)));
  passed.forEach((entry, index) => blocks.push(validationBlock(entry, 40 + index, 3)));
  if (result.validationResults.length > 0) {
    blocks.push({ order: 29, priority: 1, atomic: true, lines: ["## Validation output"] });
  }

  const fileLines = result.changedFiles.map((file) => {
    const rename = file.oldPath ? ` from ${file.oldPath}` : "";
    const stats = file.binary ? "binary" : `+${file.additions}/-${file.deletions}`;
    return `- ${file.path} (${file.status}${rename}, ${stats})`;
  });
  blocks.push({
    order: 10,
    priority: 2,
    atomic: false,
    lines: ["## Changed files", ...(fileLines.length > 0 ? fileLines : ["No changed files."])],
    omissionMarker: (omitted) => `- … ${omitted} more file entries omitted (max_chars budget)`,
  });

  const withPatches = result.changedFiles.filter((file) => file.patch);
  withPatches.forEach((file, index) => {
    const fence = fenceFor(file.patch ?? "");
    blocks.push({
      order: 20 + index,
      priority: 4,
      atomic: true,
      lines: [`### Diff: ${file.path}`, `${fence}diff`, file.patch ?? "", fence],
    });
  });

  const sizeOf = (lines: string[]) => lines.join("\n").length + 1;
  const byPriority = [...blocks].sort((a, b) => a.priority - b.priority || a.order - b.order);

  let remaining = limit;
  // Once anything at priority P is dropped, everything below P is dropped
  // too — a partially-lower-priority report would be misleading to agents.
  let cutoff = Number.POSITIVE_INFINITY;
  const included = new Map<Block, string[]>();
  const omittedNotes: string[] = [];
  for (const block of byPriority) {
    if (block.priority > cutoff) {
      omittedNotes.push(`section omitted (max_chars budget): ${block.lines[0] ?? ""}`);
      continue;
    }
    const size = sizeOf(block.lines);
    if (size <= remaining) {
      included.set(block, block.lines);
      remaining -= size;
    } else if (!block.atomic && block.omissionMarker) {
      const kept: string[] = [];
      let used = 0;
      for (const line of block.lines) {
        const lineSize = line.length + 1;
        if (used + lineSize + 80 > remaining) break; // reserve room for the marker
        kept.push(line);
        used += lineSize;
      }
      const omitted = block.lines.length - kept.length;
      if (kept.length > 0 && omitted > 0) {
        kept.push(block.omissionMarker(omitted));
        included.set(block, kept);
        remaining -= sizeOf(kept);
      } else if (omitted > 0) {
        omittedNotes.push(block.omissionMarker(omitted).replace(/^- /, ""));
        cutoff = Math.min(cutoff, block.priority);
      }
    } else {
      omittedNotes.push(`section omitted (max_chars budget): ${block.lines[0] ?? ""}`);
      cutoff = Math.min(cutoff, block.priority);
    }
  }

  const rendered = [...included.entries()]
    .sort(([a], [b]) => a.order - b.order)
    .flatMap(([, lines]) => [...lines, ""]);
  if (omittedNotes.length > 0) {
    rendered.push("## Omitted due to max_chars budget", ...omittedNotes.map((note) => `- ${note}`));
  }
  return rendered.join("\n").trimEnd();
}
