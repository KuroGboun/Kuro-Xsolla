#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { packReport, MIN_BUDGET_CHARS } from "./budget.js";
import { collectReview } from "./core.js";
import { refuseValidationCommands } from "./policy.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a Markdown review report of files " +
    "changed relative to a base ref, plus a machine-readable JSON summary. " +
    "Repository inspection is read-only. Validation commands execute " +
    "arbitrary shell commands with the server's privileges and run only if " +
    "the server operator allowed them via INSPECTOR_ALLOW_VALIDATIONS=1 or " +
    "an INSPECTOR_ALLOWED_COMMANDS allowlist. Use max_chars to bound how " +
    "much report text lands in your context window; omissions are always " +
    "explicitly marked.",
  {
    repo_path: z.string().describe("Path to the Git repository to inspect."),
    base_ref: z
      .string()
      .optional()
      .describe("Base ref to diff against. Defaults to main, then master."),
    validation_commands: z
      .array(z.string())
      .optional()
      .describe(
        "Shell commands to run inside the repository. Subject to the " +
          "server's execution policy. Command failures are reported in the " +
          "result, not raised as errors.",
      ),
    include_patches: z
      .boolean()
      .optional()
      .describe("Include size-capped unified diffs per file. Off by default."),
    max_chars: z
      .number()
      .int()
      .min(MIN_BUDGET_CHARS)
      .optional()
      .describe(
        "Upper bound on report characters. Lower-priority content (patches, " +
          "passing output, long file lists) is dropped first and every " +
          "omission is marked in the text.",
      ),
  },
  async ({ repo_path, base_ref, validation_commands, include_patches, max_chars }) => {
    const refusal = refuseValidationCommands(validation_commands ?? [], process.env);
    if (refusal) {
      return { isError: true, content: [{ type: "text", text: refusal }] };
    }

    try {
      const result = await collectReview({
        repositoryPath: repo_path,
        baseRef: base_ref,
        validationCommands: validation_commands,
        includePatches: include_patches,
      });
      const text = packReport(result, max_chars);
      const structured = {
        summary: result.summary,
        repositoryPath: result.repositoryPath,
        baseRef: result.baseRef,
      };
      return {
        content: [
          { type: "text", text },
          {
            type: "text",
            text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```",
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `review_repository failed: ${message}` }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
