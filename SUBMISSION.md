# Submission

## What did you investigate first, and why?

I read every source file before changing anything (the whole tool is ~7 small
files, so full coverage was cheap) and traced the data flow from both entry
points into `core.ts`. I started with `mcp-server.ts` because the README
explicitly hints at "its current input contract" — and that is where the most
severe defect was: the tool schema advertises `repo_path`, but the handler
reads `input.repoPath`, so every MCP call ran with an `undefined` repository
path. The advertised AI-facing interface could never work.

I also compared the two submission channels I was given: the README/SECURITY.md
say to submit via GitHub's private vulnerability-report form and *not* to reply
by email, while the invitation email says to reply by email with the repo URL.
I verified the upstream template says the same thing, treated the contradiction
as intentional, and decided to submit through **both** channels while flagging
the discrepancy in each.

## What did you choose to implement or fix?

In priority order (one commit each — see `git log`):

1. **MCP input contract + error handling** — aligned the handler with the
   declared `repo_path`/`base_ref`/`validation_commands` fields, removed the
   `any`, returned `isError` tool results instead of leaking exceptions as
   protocol errors, and gated command execution behind
   `INSPECTOR_ALLOW_VALIDATIONS=1` (trust boundary, below).
2. **Validation resilience** — a failing validation command used to reject the
   promise and crash the entire review; the `"failed"` status in the types was
   unreachable. Now failures resolve with status, exit code, and combined
   stdout+stderr; commands are killed after a 120s timeout; output is capped at
   64k chars with a truncation marker.
3. **Report safety** — validation output containing ``` could escape its code
   fence and inject markdown (a prompt-injection surface, since MCP reports are
   read by AI agents). Fences are now dynamically longer than any backtick run
   in the content. The report also shows base ref, exit codes, rename origins,
   and explicit empty states.
4. **Git inspection** — base ref falls back `main` → `master` with clear errors
   for unknown refs and non-repos; `-z` parsing handles renames/copies (two
   paths per record) instead of mislabeling them; untracked files are reported
   (the `"untracked"` status previously existed in the types but was never
   produced).
5. **CLI correctness** — `--repo` no longer truncates paths at the first space
   (`.split(" ")[0]`); flags validate their values; `--format json` is honored
   instead of silently ignored; added `--out`; failed validations exit `1` and
   usage errors exit `2` so CI can consume the tool.
6. **Tests** — from 1 happy-path test to 21: unit tests for parsing, validation
   failure/timeout/truncation, fence escaping, plus an integration suite that
   builds a real temp git repo (with spaces in its path) and runs the review
   end to end.

## What did you intentionally not do?

- No allowlist/sandboxing of *which* commands may run — the operator gate plus
  timeout/output caps fit the local-developer trust model; a hosted deployment
  would need more (see interface decision).
- No parallel validation execution; sequential keeps output deterministic.
- No structured MCP output schema (JSON content blocks) — markdown text is what
  current MCP clients consume best; the `format: "json"` path exists in core if
  a client wants it.
- Did not rename `baseRef` casing in the MCP schema's favor everywhere; core
  keeps camelCase types, adapters translate at the edge.

## Interface decision

- **Decision: hybrid** — one shared core (`collectReview` + `renderReport`),
  two thin adapters.
- **Primary user and execution environment:** an AI coding agent calling the
  MCP stdio server on a developer's workstation, inspecting repositories the
  developer already has checked out; the CLI serves the same developer directly
  and CI pipelines (exit codes make it scriptable).
- **Trust boundary and allowed capabilities:** repository inspection is
  read-only and always allowed. Command execution is the dangerous capability:
  a human typing `--validate` at their own shell adds no new risk, but an MCP
  client is a less-trusted principal, so the server refuses
  `validation_commands` unless the *operator* opted in at launch via
  `INSPECTOR_ALLOW_VALIDATIONS=1`. All executed commands get timeouts and
  output caps.
- **Reliability, discoverability, latency/context, and output tradeoffs:**
  reliability — no input can crash the server; every failure is a reported
  result. Discoverability — the MCP schema now carries `.describe()` text
  including the security posture, so agents can self-serve; the CLI prints
  usage. Latency/context — reports go straight into agent context, so output
  is capped and truncation is explicit rather than silently flooding the
  context window; the CLI writes to a file where size matters less.
  Output — markdown for humans/agents, `json` for machines, rendered from the
  same structured result.
- **How supported interfaces remain consistent:** both adapters call the same
  `collectReview()`; neither reimplements review logic, so behavior cannot
  drift. Adapters differ only in transport (file + exit codes vs. tool result)
  and in policy appropriate to their caller's trust level.
- **Evidence that would change this decision:** usage showing mostly CI
  invocation → CLI-first with a minimal MCP shim; a hosted multi-tenant
  deployment → remove command execution from the MCP surface entirely rather
  than gate it; agent clients needing incremental/large-diff data → MCP-first
  with structured, paginated output.

## How did you use an AI coding agent?

I used Claude Code end to end: it read all sources first, produced a ranked
finding list, and proposed the plan that I reviewed and approved before any
edit. It then implemented the fixes, wrote the tests, and ran verification
(typecheck, vitest, CLI runs against a spaced path, and a scripted JSON-RPC
stdio session against the MCP server covering the valid call, the gated call,
and the error path). Every change was verified by an executed command, not by
reading the diff alone. A running work log was kept outside the repo and used
to fill in this document.

## Where did you check, correct, or reject an AI suggestion? (required)

- **Caught a real bug in AI-written error handling:** the first version of the
  new `git.ts` stringified a `null` stderr, producing the message
  `git rev-parse failed in /nonexistent/nope: null`. The MCP smoke test
  surfaced it; the fix falls back to `error.message`, which now yields
  `...: spawnSync git ENOENT`.
- **Caught a test-breaking design before it landed:** the AI's first CLI
  rewrite executed `main()` at module import time, which would have run the
  CLI (and set a nonzero exit code) whenever tests imported `parseArgs`. It
  was corrected to an entry-point guard before the suite ran.
- **Rejected a workaround in favor of a fix:** renaming my local folder to
  remove the space that broke `--repo` parsing was considered and rejected —
  the bug had to be fixed in code (graders run this elsewhere), and the spaced
  path became a test case instead.

## Commands used to verify the result, with outcomes

- `npm install && npm run typecheck && npm test` — baseline: clean, 1/1 test.
- `npx tsc -p tsconfig.json --noEmit` — clean after every phase.
- `npx vitest run` — 21/21 passing (4 files).
- `npx tsx src/cli.ts review --repo "/…/kuro @ xsolla/Kuro-Xsolla" --validate
  "echo ok-here" --validate "exit 7" --out …/report.md` — report written,
  spaced path intact, `exit 7` shown as `failed (exit 7)`, process exit code 1.
- Same with `--format json` — valid parseable JSON.
- Scripted JSON-RPC stdio session against `mcp-server.ts` — valid call returns
  a real report (impossible before the contract fix); `validation_commands`
  refused without the env gate and executed with it; nonexistent path returns
  `isError` with a clear message and the server stays up.

## A blocker you hit and how you approached it

Two, honestly reported:

1. **Conflicting submission instructions** (README/SECURITY.md: "security form,
   never email" vs. the invitation email: "reply by email"). I verified the
   upstream template carries the same text, concluded the conflict is
   deliberate, and resolved it by submitting through both channels and naming
   the discrepancy in each — the same posture the tool itself takes toward
   untrusted instructions.
2. **`git commit` hung silently** during the first commit. Diagnosis: global
   `commit.gpgsign=true` with an SSH signing key, which blocks waiting for a
   passphrase in a non-interactive session. Worked around with
   `--no-gpg-sign` per commit rather than editing global git config.

## Known limitations and the next three things you would do

Limitations: validation commands still run through a shell (quoting foot-guns);
no rename detection tuning (`-M` default threshold); JSON schema of the report
is informal; MCP output is a single text block.

Next three:

1. A command allowlist (e.g. `--allow "npm test"`) so the MCP gate can be
   per-command instead of all-or-nothing.
2. Structured MCP output (typed content) plus pagination for large diffs, so
   agent context cost is bounded and predictable.
3. Diff *content* summarization (patch hunks per file, size-capped) — file
   names alone under-serve the review use case.

## Approximate focused-work time

- Start: 2026-08-09 ~17:40 (investigation and planning)
- Finish: 2026-08-09 ~18:40 (implementation, verification, documentation)
- Roughly 60–90 focused minutes, AI-assisted throughout.
