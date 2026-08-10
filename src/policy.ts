/**
 * Decides whether validation commands requested over MCP may execute.
 *
 * The MCP caller is a less-trusted principal than a human at a shell, so
 * execution is opt-in by the server operator at launch time:
 *  - INSPECTOR_ALLOWED_COMMANDS="npm test,npm run lint" allows exactly the
 *    listed commands (trimmed, exact string match) and nothing else.
 *  - Otherwise INSPECTOR_ALLOW_VALIDATIONS=1 allows any command.
 *  - Otherwise all validation commands are refused.
 *
 * Returns null when every command is allowed, or a refusal message.
 */
export function refuseValidationCommands(
  commands: string[],
  env: Record<string, string | undefined>,
): string | null {
  if (commands.length === 0) return null;

  const allowlist = (env.INSPECTOR_ALLOWED_COMMANDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowlist.length > 0) {
    const blocked = commands.find((command) => !allowlist.includes(command.trim()));
    if (blocked === undefined) return null;
    return (
      `validation command ${JSON.stringify(blocked)} is not in the server's ` +
      `INSPECTOR_ALLOWED_COMMANDS allowlist (${allowlist.map((entry) => JSON.stringify(entry)).join(", ")}).`
    );
  }

  if (env.INSPECTOR_ALLOW_VALIDATIONS === "1") return null;

  return (
    "validation_commands are disabled on this server. Start the server with " +
    "INSPECTOR_ALLOW_VALIDATIONS=1 (allow all) or INSPECTOR_ALLOWED_COMMANDS=" +
    '"cmd1,cmd2" (allowlist), or call again without validation_commands.'
  );
}
