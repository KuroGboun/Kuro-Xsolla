import { describe, expect, it } from "vitest";
import { runValidation, runValidations } from "../src/validation.js";

describe("runValidation", () => {
  it("reports passing commands with their output", async () => {
    const result = await runValidation("echo hello", process.cwd());
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello");
    expect(result.truncated).toBe(false);
  });

  it("reports failing commands instead of throwing", async () => {
    const result = await runValidation("echo boom >&2; exit 3", process.cwd());
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("boom");
  });

  it("captures both stdout and stderr", async () => {
    const result = await runValidation("echo out; echo err >&2", process.cwd());
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
  });

  it("truncates oversized output", async () => {
    const result = await runValidation("printf 'a%.0s' $(seq 1 500)", process.cwd(), {
      maxOutputChars: 100,
    });
    expect(result.truncated).toBe(true);
    expect(result.output.length).toBe(100);
  });

  it("kills commands that exceed the timeout", async () => {
    const result = await runValidation("sleep 5", process.cwd(), { timeoutMs: 200 });
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBeNull();
    expect(result.output).toContain("timeout");
  });
});

describe("runValidations", () => {
  it("continues past failures", async () => {
    const results = await runValidations(["exit 1", "echo second"], process.cwd());
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("failed");
    expect(results[1].status).toBe("passed");
  });
});
