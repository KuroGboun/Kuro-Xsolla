import { changedFiles, resolveBaseRef } from "./git.js";
import { markdownReport } from "./report.js";
import { htmlReport } from "./html-report.js";
import { summarize } from "./summary.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations } from "./validation.js";

/** Runs the review and returns structured data. */
export async function collectReview(request: ReviewRequest): Promise<ReviewResult> {
  const baseRef = resolveBaseRef(request.repositoryPath, request.baseRef);
  const files = changedFiles(request.repositoryPath, baseRef, {
    includePatches: request.includePatches,
  });
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  return {
    repositoryPath: request.repositoryPath,
    baseRef,
    summary: summarize(files, validations),
    changedFiles: files,
    validationResults: validations,
  };
}

export function renderReport(result: ReviewResult, format: ReviewRequest["format"]): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "html") return htmlReport(result);
  return markdownReport(result);
}

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const result = await collectReview(request);
  return renderReport(result, request.format);
}
