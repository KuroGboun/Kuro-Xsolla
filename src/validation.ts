import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

export type ValidationOptions = {
  timeoutMs?: number;
  maxOutputChars?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_CHARS = 64_000;

export function runValidation(
  command: string,
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        let output = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
        let truncated = false;
        if (output.length > maxOutputChars) {
          output = output.slice(0, maxOutputChars);
          truncated = true;
        }

        if (!error) {
          resolve({ command, status: "passed", exitCode: 0, output, truncated });
          return;
        }

        const exitCode = typeof error.code === "number" ? error.code : null;
        if (error.killed) {
          output = `${output}\n[command killed after ${timeoutMs}ms timeout]`.trimStart();
        } else if (!output) {
          output = error.message;
        }
        resolve({ command, status: "failed", exitCode, output, truncated });
      },
    );
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, options));
  }
  return results;
}
