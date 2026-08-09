#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

const allowValidationCommands = process.env.INSPECTOR_ALLOW_VALIDATIONS === "1";

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a Markdown review report of files " +
    "changed relative to a base ref. Repository inspection is read-only. " +
    "Validation commands execute arbitrary shell commands with the server's " +
    "privileges and are disabled unless the server was started with " +
    "INSPECTOR_ALLOW_VALIDATIONS=1.",
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
        "Shell commands to run inside the repository. Requires the server " +
          "operator to have set INSPECTOR_ALLOW_VALIDATIONS=1. Command " +
          "failures are reported in the result, not raised as errors.",
      ),
  },
  async ({ repo_path, base_ref, validation_commands }) => {
    if (validation_commands?.length && !allowValidationCommands) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              "validation_commands are disabled on this server. Start the " +
              "server with INSPECTOR_ALLOW_VALIDATIONS=1 to allow command " +
              "execution, or call again without validation_commands.",
          },
        ],
      };
    }

    try {
      const report = await reviewRepository({
        repositoryPath: repo_path,
        baseRef: base_ref,
        validationCommands: validation_commands,
      });
      return { content: [{ type: "text", text: report }] };
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
