# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
npm run inspector -- review --repo ./path/to/repo --format json --out report.json
```

Flags:

- `--repo <path>` (required) — repository to inspect; paths with spaces work.
- `--base-ref <ref>` — base to diff against; defaults to the first existing
  branch among `main`, `master`, `develop`, `trunk`, `dev`.
- `--format markdown|json|html` — output format (default `markdown`). The
  markdown report includes a summary with review flags and a mermaid chart of
  changed lines per directory; the HTML report is a single self-contained
  page (no external requests) with add/delete bars and validation cards.
- `--out <file>` — report location (default follows the format:
  `review-report.md|.json|.html`). `--out -` writes the report to stdout and
  status messages to stderr, so it composes with pipes.
- `--patches` — include per-file unified diffs, capped at 4k chars each.
- `--validate <command>` — repeatable; commands run inside the repository
  with a 120s timeout and a 64k output cap. Failures are reported, not fatal.

Exit codes: `0` success, `1` at least one validation failed (CI-friendly),
`2` usage error.

## MCP

Start the stdio server with:

```bash
npm run mcp-server                                       # inspection only
INSPECTOR_ALLOW_VALIDATIONS=1 npm run mcp-server         # allow any validation command
INSPECTOR_ALLOWED_COMMANDS="npm test,npm run lint" npm run mcp-server  # allowlist
```

It exposes a `review_repository` tool taking `repo_path` (required),
`base_ref`, `validation_commands`, `include_patches`, and `max_chars`.
Repository inspection is read-only. `validation_commands` execute shell
commands with the server's privileges, so they are refused unless the
operator opted in at launch: `INSPECTOR_ALLOWED_COMMANDS` allows exactly the
listed commands, or `INSPECTOR_ALLOW_VALIDATIONS=1` allows everything.

`max_chars` bounds how much report text lands in the client's context
window. Content is kept by priority — summary, then failed validations, then
the file list, then passing output, then patches — and every omission is
explicitly marked so an agent knows the report is partial and can
re-request with a larger budget. Results also include a fenced JSON summary
block for machine consumption. Failures inside a review (bad path, unknown
ref, failing command) come back as tool results, never protocol crashes.

## The tool reviews itself

CI runs the inspector against its own repository on every push and uploads
the markdown and HTML reports as the `self-review-report` build artifact
(Actions → run → Artifacts).

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.