import { describe, expect, it } from "vitest";
import { refuseValidationCommands } from "../src/policy.js";

describe("refuseValidationCommands", () => {
  it("always allows an empty command list", () => {
    expect(refuseValidationCommands([], {})).toBeNull();
  });

  it("refuses everything by default", () => {
    expect(refuseValidationCommands(["npm test"], {})).toMatch(/disabled/);
  });

  it("allows everything with INSPECTOR_ALLOW_VALIDATIONS=1", () => {
    expect(
      refuseValidationCommands(["anything at all"], { INSPECTOR_ALLOW_VALIDATIONS: "1" }),
    ).toBeNull();
  });

  it("enforces the allowlist exactly, ignoring the blanket flag", () => {
    const env = {
      INSPECTOR_ALLOWED_COMMANDS: "npm test, npm run lint",
      INSPECTOR_ALLOW_VALIDATIONS: "1",
    };
    expect(refuseValidationCommands(["npm test", "npm run lint"], env)).toBeNull();
    expect(refuseValidationCommands(["npm test", "rm -rf /"], env)).toMatch(
      /"rm -rf \/" is not in the server's INSPECTOR_ALLOWED_COMMANDS/,
    );
  });
});
