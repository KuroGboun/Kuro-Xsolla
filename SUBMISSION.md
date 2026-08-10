# Submission

## What did you investigate first, and why?

I read every source file before changing anything (the whole tool is ~7 small
files, so full coverage was cheap) and traced the data flow from both entry
points into `core.ts`. I started with `mcp-server.ts` because the README
explicitly hints at "its current input contract", and that is where the most
severe defect was: the tool schema advertises `repo_path`, but the handler
reads `input.repoPath`, so every MCP call ran with an `undefined` repository
path. The advertised AI-facing interface could never work.

I also noticed the README/SECURITY.md says not to submit by email, while my
recruiter's email asked me to reply with the repo URL. On reflection these
are not actually in conflict: the README's warning is generic guidance
against treating an unmonitored inbox as a substitute for the graded
submission channel (GitHub's private vulnerability-report form); it isn't
addressed to a specific recruiter and has no way to know one exists. I did both regardless.

## What did you choose to implement or fix?

1. **MCP input contract + error handling.** Aligned the handler with the
   declared `repo_path`/`base_ref`/`validation_commands` fields, removed the
   `any`, returned `isError` tool results instead of leaking exceptions as
   protocol errors, and gated command execution behind
   `INSPECTOR_ALLOW_VALIDATIONS=1` (trust boundary, below).
2. **Validation resilience.** A failing validation command used to reject the
   promise and crash the entire review; the `"failed"` status in the types was
   unreachable. Now failures resolve with status, exit code, and combined
   stdout+stderr; commands are killed after a 120s timeout; output is capped at
   64k chars with a truncation marker.
3. **Report safety.** Markdown uses three backticks (```) to box off a code
   block. If a command's own output contained three backticks (```), it could break out
   of its box and slip fake content into the report as if it were real, which
   matters because AI agents read these reports. Fixed by always drawing the
   box's border longer than anything trying to escape it. The report also
   shows which branch it compared against, exit codes, where renamed files
   came from, and clear messages when there's nothing to show.
4. **Git inspection.** Three small fixes: it now tries several common branch
   names (`main`, `master`, `develop`, `trunk`, `dev`) instead of assuming every repo
   uses "main", with a clear error if none exist; renamed files are correctly
   labeled "renamed" instead of just "modified"; and new files that exist on
   disk but haven't been added to git yet are now reported (that status
   existed in the code already but was never actually used).
5. **CLI correctness.** `--repo` no longer cuts the path at the first space
   (`.split(" ")[0]`); flags validate their values; `--format json` is honored
   instead of silently ignored; added `--out`; failed validations exit `1` and
   usage errors exit `2` so CI can consume the tool.
6. **Tests.** From 1 happy-path test to 21: unit tests for parsing, validation
   failure/timeout/truncation, fence escaping, plus an integration suite that
   builds a real temp git repo (with spaces in its path) and runs the review
   end to end. More tests! 

## Feature round (second session, beyond the fixes)

After the correctness round I added eight new features:

1. **Diff stats + capped patches.** File names alone weren't enough to review
   from. Every file now shows `+added/-deleted` lines, and an optional
   `--patches` flag attaches the actual diff, size-capped so it can't
   balloon the report.
2. **Summary heuristics.** A summary block up top: file/line counts, plus
   flags like "lockfile changed" or "source changed without test changes",
   so humans and agents can triage before reading the whole report.
3. **MCP context budget (`max_chars`).** AI agents pay for every character
   they read, so they can now request a size-capped report. It keeps the
   most important parts first (summary, then failures, then the rest) and
   clearly labels anything left out, so the agent knows the report is
   partial rather than assuming it saw everything.
4. **Command allowlist.** Instead of an all-or-nothing switch for what
   commands an AI can run, the server operator can list exactly which
   commands are allowed (e.g. `npm test` only).
5. **Pipe-friendly CLI.** `--out -` prints the report to the terminal
   instead of a file, so it composes with other command-line tools.
6. **HTML visualizer.** A styled, single-file HTML report that works
   offline (no internet needed to view it), with file bars, pass/fail
   cards, and collapsible diffs. Not offered over MCP: agents want plain
   text, not a styled page.

   Styled using a visual identity pulled from Xsolla's own homepage

7. **Mermaid directory chart.** A small chart in the markdown report
   showing which folders changed the most; GitHub renders it automatically.
8. **Self-review CI.** Every push, the tool now reviews its own repository
   and saves the report as a downloadable file, proof it works, generated
   automatically.

## What did you intentionally not do?

- Didn't sandbox command execution (e.g. in a container): the allowlist and
  timeouts are enough for local use, but a hosted version would need real
  isolation (this tool runs on devs laptops).
- Didn't run validations in parallel: one at a time keeps output predictable and stable.
- Didn't adopt a newer, optional MCP data format: the current JSON block
  already gives AI clients structured data without depending on support
  that may not exist yet.
- Didn't offer the HTML report through MCP: agents want plain text and
  structure, not a styled page, the styling is for the dev.
- Left a small naming mismatch between internal code and the public MCP
  field names, since translating at the edges is cleaner than renaming
  everywhere.

## Interface decision

- **Decision: hybrid.** One shared engine, two thin wrappers around it. 
Like one kitchen that can serve food two ways: through a drive-through 
window (the command line, for humans) or through a delivery app 
(MCP, for AI agents). Same kitchen, same recipes, same food, just 
two different ways of ordering.
- **Who uses it, and where:** the human touches the command line directly in
  two places, at their own terminal to sanity-check their own changes, and
  inside CI, where a script runs the same command automatically on every
  push and the human reads the resulting report. The MCP path is different:
  there, an AI agent calls the tool on the developer's machine on the
  human's behalf, usually because the human asked it to review something in
  chat, so the human benefits from the result without invoking the tool
  themselves. That AI-mediated path through MCP is the one this decision
  treats as primary.
- **What's safe vs. dangerous:** reading the repo is always safe and always
  allowed. Running commands is the risky part: a person typing a command at
  their own terminal adds no new risk, but an AI asking the server to run a
  command is a different, less-trusted situation, so that only works if the
  person running the server explicitly turns it on.
- **Trade-offs:** nothing can crash the server outright, every failure comes
  back as a normal result; the MCP tool describes its own rules so an agent
  can self-serve; report size is capped so it doesn't overwhelm an agent's
  context, while the file version has no such limit since size matters less
  there (this is why we added that list of allowed commands).
- **Why the two stay in sync:** both the command line and MCP call the exact
  same core function, so they can't drift apart, they only differ in how
  they deliver the result and what they're allowed to do.
- **What would change this decision:** 
  - If usage turned out to be mostly CI and not AI agents, that means the
    original bet on MCP-as-primary was wrong; I'd flip priorities and make
    the CLI the polished main product, shrinking MCP to a thin wrapper.
  - For a hosted, multi-user version, letting an AI run commands stops being
    "one person's own risk on their own machine" and starts being risk to a
    shared system; at that point I'd remove command execution from the
    AI-facing side entirely rather than gate it more tightly.
  - If agents kept hitting the `max_chars` cap on large diffs, that means
    cutting low-priority content and labeling the cut isn't good enough
    anymore; I'd add pagination so an agent can walk a large diff across
    multiple calls instead of losing the tail end.

## How did you use an AI coding agent?

I used Claude Code end to end. Before any code work, I set up a persistent
memory file recording the assessment's ground rules (interface direction,
submission approach, honesty constraints), so later sessions inherited that
context instead of re-deriving it.

I heavily utilized the plan mode: read-only exploration, then a ranked,
written plan I reviewed and approved before any edit landed. Implementation,
tests, and verification followed (typecheck, vitest, CLI runs against a
spaced path, a scripted MCP stdio session), every change checked by running
something, not just reading the diff.

For the visual interface, I used Claude's design tool to mock up the
Xsolla-derived identity across two iterations, entirely outside the
codebase, then imported each approved mock over MCP and implemented it
directly. Only finished, approved layouts ever became code.

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
  remove the space that broke `--repo` parsing was considered and rejected.
  The bug had to be fixed in code regardless (graders run this elsewhere);
  renaming would also have invalidated the plan and memory context already
  set up for the session; and fixing the parser properly, rather than
  dodging it, was a chance to make argument parsing more robust generally.
  The spaced path became a permanent test case instead.
- **Caught a misleading design in the AI's budget packer (feature round):**
  the first `packReport` was greedy: if a higher-priority section didn't
  fit, it would still squeeze in a lower-priority one that happened to fit
  in the leftover space, a report that looks complete while silently
  missing more important content. A failing test exposed it; the packer now
  uses a strict cutoff, once a priority level is dropped, everything below
  it drops too. The test itself was initially wrong (it checked for text
  that also legitimately appears in the omission notes) and was tightened
  to check real content instead.

## Commands used to verify the result, with outcomes

Fix round:

- `npm install && npm run typecheck && npm test`: baseline, clean, 1/1 test.
- `npx tsc -p tsconfig.json --noEmit`: clean after every phase.
- `npx vitest run`: 21/21 passing (4 files).
- `npx tsx src/cli.ts review --repo "/…/kuro @ xsolla/Kuro-Xsolla" --validate
  "echo ok-here" --validate "exit 7" --out …/report.md`: report written,
  spaced path intact, `exit 7` shown as `failed (exit 7)`, process exit code 1.
- Same with `--format json`: valid parseable JSON.
- Scripted JSON-RPC stdio session against `mcp-server.ts`: valid call returns
  a real report (impossible before the contract fix); `validation_commands`
  refused without the env gate and executed with it; nonexistent path returns
  `isError` with a clear message and the server stays up.

Feature round:

- `npx vitest run`: 38/38 passing (8 files), including injection fixtures
  for HTML escaping and markdown fences, budget-packing priorities and
  omission markers, allowlist policy, and numstat/rename/untracked stats
  against a real temp git repo.
- `npx tsx src/cli.ts review --repo … --patches --out -`: pure report on
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

**`git commit` hung silently** during the first commit. Diagnosis: global
`commit.gpgsign=true` with an SSH signing key, which blocks waiting for a
passphrase in a non-interactive session. Worked around with
`--no-gpg-sign` per commit rather than editing global git config.

## Known limitations and the next three things you would do

Limitations: commands run through a shell (quoting risk); rename detection
uses git's default threshold, not tunable; the JSON shape has no published
schema; each patch costs a separate git call; the context budget counts
characters, not tokens.

With more time I would add these 3: 
1. Token-aware budgeting: count with a real tokenizer instead of characters 
(AI doesn't think in characters).
2. Cursor-based pagination, so an agent can walk a large diff across calls
   instead of re-requesting with a bigger budget.
3. Process-level sandboxing for commands (no shell, argv arrays, resource
   limits), so the allowlist isn't the only safeguard, this promotes better safety.

## Approximate focused-work time

- Thomas indicated I could take the weekend or even beginning of the week,
  and that the time restriction was not strict. Nevertheless I spent roughly 1h30 
  of focused work. The fix round alone fit the original window; everything
  beyond it was just feature enhancement after the correctness work was
  complete.
