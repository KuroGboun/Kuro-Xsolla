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

## Feature round (second session, beyond the fixes)

After the correctness round I deliberately extended scope with eight
features, each in its own commit, chosen to serve the two users the hybrid
decision names — AI agents and humans/CI:

1. **Diff stats + capped patches** — the report previously listed only file
   names, which under-serves review. Every file now carries `+adds/-dels`
   (from `git diff --numstat -z`, including rename records and binary
   markers), and `--patches`/`include_patches` attach per-file unified diffs
   capped at 4k chars with explicit truncation markers.
2. **Summary heuristics** — a computed summary (files, lines, statuses,
   validation outcomes) plus review flags: "lockfile changed", "CI
   configuration changed", "source changed without test changes", "large
   change", "binary files changed". Rendered first in every format because
   both agents and humans triage from the top.
3. **MCP context budget (`max_chars`)** — AI clients pay for every character
   that enters their context window, so the tool lets them bound it. Packing
   is priority-ordered (summary > failed validations > file list > passing
   output > patches) with a strict cutoff — once one priority level is
   dropped, everything below it is dropped too, because a report that kept
   low-value patches while silently missing passing output would mislead the
   reader. Every omission is named in the text so the agent knows the report
   is partial and can re-request. A fenced JSON summary block accompanies the
   markdown for machine consumption.
4. **Command allowlist** — `INSPECTOR_ALLOWED_COMMANDS="npm test,npm run
   lint"` narrows the MCP execution gate from all-or-nothing to
   exactly-these; the policy is a pure, unit-tested function. Default remains
   refuse-all.
5. **Pipe-friendly CLI** — `--out -` sends the report to stdout and status to
   stderr, so `inspector review … --out - | jq` and CI pipelines compose.
6. **HTML visualizer** (`--format html`) — one self-contained page (inline
   CSS, zero external requests, so it works offline and exfiltrates nothing):
   summary tiles, per-file add/delete bars, pass/fail validation cards and
   collapsible diffs. Every untrusted string is HTML-escaped, tested with
   script-injection fixtures. HTML is deliberately *not* offered over MCP —
   agents want text and structure, not markup for humans.

   The page is styled to a **design identity I reverse-engineered from
   xsolla.com's homepage**: I sampled the palette (paper canvas, near-black
   ink, slate secondary text, hairline dividers, fog fills, one cyan accent),
   type rules (medium-weight display at tight negative tracking, small grey
   body), and component patterns (hairline-divided metric strips and rows
   instead of box grids, flat hairline-bordered cards) into a short identity
   document, iterated the page layout as a mock in Claude's design tool
   (claude.ai/design), then implemented that mock in the report renderer:
   brand top bar with the wordmark, display hero, metric strip with colored
   add/delete counts, flag rows, grid file table with scaled bars, diff
   accordions, and validation cards. Deliberate deviations, because function
   and safety beat brand: muted green/red stays for +/- and pass/fail (data
   colors a review tool cannot drop, kept quiet so cyan remains the only
   decorative accent); the mock's Google Fonts link was **not** carried over
   and the logo is embedded as a data URI, because the page's
   zero-external-requests guarantee is a security property I was not willing
   to trade for typography; and the design tool's runtime scripts were left
   out — the shipped page is static, dependency-free HTML.
7. **Mermaid directory chart** — the markdown report includes a pie of
   changed lines per top-level directory; GitHub renders it natively, so the
   report file is self-visualizing when committed or attached.
8. **Self-review CI** — the workflow now runs the inspector on its own
   repository every push and uploads markdown + HTML reports as an artifact:
   the tool dogfoods itself, and every CI run is a live demo.

## What did you intentionally not do?

- No sandboxing of command *execution* (containers, seccomp) — the allowlist,
  refuse-by-default gate, timeouts, and output caps fit the local-developer
  trust model; a hosted deployment would need real isolation (see interface
  decision).
- No parallel validation execution; sequential keeps output deterministic.
- No MCP `outputSchema`/`structuredContent` from the newer MCP spec — the
  fenced-JSON summary block delivers machine-readable data without betting on
  client support; revisit when target clients advertise it.
- No HTML over MCP — agents consume text and structure, not human markup.
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
- **Caught a misleading design in the AI's budget packer (feature round):**
  the first `packReport` filled the budget greedily, so when passing-test
  output didn't fit, it still squeezed in *lower-priority* patch hunks — a
  report that looks complete while silently missing more important content.
  A failing test exposed it; the packer was redesigned with a strict cutoff
  (once a priority level is dropped, everything below it drops too). The
  first version of that test was itself wrong — it asserted on a substring
  that legitimately appears in the omission notes — and was tightened to
  assert on patch content instead.

## Commands used to verify the result, with outcomes

Fix round:

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

Feature round:

- `npx vitest run` — 38/38 passing (8 files), including injection fixtures
  for HTML escaping and markdown fences, budget-packing priorities and
  omission markers, allowlist policy, and numstat/rename/untracked stats
  against a real temp git repo.
- `npx tsx src/cli.ts review --repo … --patches --out -` — pure report on
  stdout (first line is the report title), status on stderr only.
- `--format html` output: 6.7 KB single file, zero occurrences of external
  URLs (`grep -c http` = 0).
- Markdown output contains the mermaid `pie` block with per-directory totals.
- Scripted MCP stdio session: `max_chars: 800` returned a 613-char packed
  report plus the JSON summary block; with no gate both validation calls
  refused; with `INSPECTOR_ALLOWED_COMMANDS="echo safe"` the unlisted
  `npm run lint` was refused by name and `echo safe` executed.
- GitHub Actions on push: build-and-test plus the self-review job's artifact.

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

Limitations: validation commands still run through a shell (quoting
foot-guns); no rename detection tuning (`-M` default threshold); the JSON
report shape is informal (no published schema); per-file patches cost one git
invocation each; the context budget counts characters, not tokens.

Of the previous "next three", all three shipped in the feature round (command
allowlist; context-budgeted, machine-readable MCP output; capped diff
content). The new next three:

1. Token-aware budgeting — count with a real tokenizer instead of characters,
   since context windows are token-denominated.
2. Cursor-based pagination for the file list and patches over MCP, so an
   agent can walk a large diff incrementally instead of re-requesting with
   bigger budgets.
3. Process-level sandboxing for validation commands (no shell, argv arrays,
   resource limits) so the allowlist isn't the only line of defense.

## Approximate focused-work time

- Session 1 (2026-08-09, ~17:40–18:40): investigation, planning, all
  correctness fixes, tests, docs — roughly 60 focused minutes.
- Session 2 (2026-08-10, ~75 focused minutes): the eight-feature round and
  this document's updates.
- Total is over the suggested 90 minutes. The overage was a deliberate
  choice to extend scope with the feature round after the correctness work
  was complete, not slow progress on the core task; the fix round alone fit
  the window. Stated plainly here because accurate reporting seemed more
  valuable than nominal compliance.
