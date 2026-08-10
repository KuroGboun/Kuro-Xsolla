#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { collectReview, renderReport } from "./core.js";

export type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format: "markdown" | "json" | "html";
  /** undefined = default for the chosen format; "-" = stdout. */
  outputPath?: string;
  includePatches: boolean;
  validations: string[];
};

export function defaultOutputPath(format: Args["format"]): string {
  if (format === "html") return "review-report.html";
  if (format === "json") return "review-report.json";
  return "review-report.md";
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] ?? "",
    format: "markdown",
    includePatches: false,
    validations: [],
  };

  const valueFor = (flag: string, index: number): string => {
    const value = argv[index];
    if (value === undefined || (value.startsWith("--") && value !== "-")) {
      throw new Error(`missing value for ${flag}`);
    }
    return value;
  };

  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = valueFor(token, ++index);
    } else if (token === "--base-ref") {
      args.baseRef = valueFor(token, ++index);
    } else if (token === "--format") {
      const format = valueFor(token, ++index);
      if (format !== "markdown" && format !== "json" && format !== "html") {
        throw new Error(`unsupported format "${format}" (expected markdown, json, or html)`);
      }
      args.format = format;
    } else if (token === "--out") {
      args.outputPath = valueFor(token, ++index);
    } else if (token === "--patches") {
      args.includePatches = true;
    } else if (token === "--validate") {
      args.validations.push(valueFor(token, ++index));
    } else {
      throw new Error(`unknown argument "${token}"`);
    }
  }
  return args;
}

const USAGE =
  "Usage: inspector review --repo <path> [--base-ref <ref>] " +
  "[--format markdown|json|html] [--out <file>|-] [--patches] " +
  "[--validate <command>]...";

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  if (args.command !== "review" || !args.repositoryPath) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const result = await collectReview({
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
    includePatches: args.includePatches,
  });
  const report = renderReport(result, args.format);

  const outputPath = args.outputPath ?? defaultOutputPath(args.format);
  if (outputPath === "-") {
    // Report on stdout, status on stderr, so the output pipes cleanly.
    process.stdout.write(report + "\n");
  } else {
    writeFileSync(outputPath, report, "utf8");
    console.error(`Review report written to ${outputPath}`);
  }

  const failed = result.validationResults.filter((entry) => entry.status === "failed");
  if (failed.length > 0) {
    console.error(`${failed.length} validation command(s) failed`);
    process.exitCode = 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
