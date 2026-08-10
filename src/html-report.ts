import type { ChangedFile, ReviewResult } from "./types.js";

/** All report text is untrusted (paths, commands, output) — escape everything. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
  :root {
    --bg: #ffffff; --fg: #1a1a2e; --muted: #6b7280; --card: #f4f5f7;
    --border: #e5e7eb; --add: #16a34a; --del: #dc2626;
    --pass-bg: #ecfdf5; --pass-border: #a7f3d0;
    --fail-bg: #fef2f2; --fail-border: #fecaca;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111318; --fg: #e5e7eb; --muted: #9ca3af; --card: #1b1e26;
      --border: #2a2e39; --add: #34d399; --del: #f87171;
      --pass-bg: #0c2419; --pass-border: #14532d;
      --fail-bg: #2a1214; --fail-border: #7f1d1d;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--fg);
         font: 15px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 60rem; margin: 0 auto; }
  h1 { font-size: 1.4rem; word-break: break-all; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .meta { color: var(--muted); }
  .tiles { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
  .tile { background: var(--card); border: 1px solid var(--border); border-radius: .5rem;
          padding: .6rem 1rem; min-width: 7rem; }
  .tile b { display: block; font-size: 1.3rem; }
  .tile span { color: var(--muted); font-size: .8rem; }
  .flags li { color: var(--muted); }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--border);
           vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .path { word-break: break-all; font-family: ui-monospace, Menlo, monospace; font-size: .85rem; }
  .status { color: var(--muted); font-size: .8rem; white-space: nowrap; }
  .bar { display: flex; height: .5rem; border-radius: .25rem; overflow: hidden;
         background: var(--card); min-width: 6rem; }
  .bar .add { background: var(--add); }
  .bar .del { background: var(--del); }
  .add-count { color: var(--add); } .del-count { color: var(--del); }
  .card { border: 1px solid var(--border); border-radius: .5rem; margin: .75rem 0;
          padding: .75rem 1rem; }
  .card.pass { background: var(--pass-bg); border-color: var(--pass-border); }
  .card.fail { background: var(--fail-bg); border-color: var(--fail-border); }
  .card h3 { margin: 0; font-size: .95rem; font-family: ui-monospace, Menlo, monospace;
             word-break: break-all; }
  .card .verdict { font-weight: 600; }
  pre { background: var(--card); border: 1px solid var(--border); border-radius: .4rem;
        padding: .75rem; overflow-x: auto; font-size: .8rem; }
  details { margin-top: .5rem; }
  summary { cursor: pointer; color: var(--muted); }
`;

function fileRow(file: ChangedFile, maxLines: number): string {
  const total = file.additions + file.deletions;
  const addPct = maxLines === 0 ? 0 : Math.round((file.additions / maxLines) * 100);
  const delPct = maxLines === 0 ? 0 : Math.round((file.deletions / maxLines) * 100);
  const rename = file.oldPath ? ` ← ${escapeHtml(file.oldPath)}` : "";
  const stats = file.binary
    ? "binary"
    : `<span class="add-count">+${file.additions}</span> <span class="del-count">−${file.deletions}</span>`;
  const bar =
    file.binary || total === 0
      ? ""
      : `<div class="bar"><div class="add" style="width:${addPct}%"></div><div class="del" style="width:${delPct}%"></div></div>`;
  return `<tr>
    <td><span class="path">${escapeHtml(file.path)}${rename}</span><br><span class="status">${file.status}</span></td>
    <td class="num">${stats}</td>
    <td>${bar}</td>
  </tr>`;
}

export function htmlReport(result: ReviewResult): string {
  const { summary } = result;
  const maxLines = Math.max(0, ...result.changedFiles.map((file) => file.additions + file.deletions));

  const tiles = [
    [summary.totalFiles, "files changed"],
    [`+${summary.additions}`, "additions"],
    [`−${summary.deletions}`, "deletions"],
    [summary.validationsPassed, "validations passed"],
    [summary.validationsFailed, "validations failed"],
  ]
    .map(([value, label]) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`)
    .join("");

  const flags =
    summary.flags.length > 0
      ? `<ul class="flags">${summary.flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join("")}</ul>`
      : "";

  const files =
    result.changedFiles.length === 0
      ? "<p class=\"meta\">No changed files.</p>"
      : `<table>${result.changedFiles.map((file) => fileRow(file, maxLines)).join("")}</table>`;

  const diffs = result.changedFiles
    .filter((file) => file.patch)
    .map(
      (file) => `<details>
        <summary>${escapeHtml(file.path)}${file.patchTruncated ? " (truncated)" : ""}</summary>
        <pre>${escapeHtml(file.patch ?? "")}</pre>
      </details>`,
    )
    .join("");

  const validations =
    result.validationResults.length === 0
      ? "<p class=\"meta\">No validation commands were run.</p>"
      : result.validationResults
          .map((entry) => {
            const exitCode = entry.exitCode === null ? "killed" : `exit ${entry.exitCode}`;
            return `<div class="card ${entry.status === "passed" ? "pass" : "fail"}">
              <h3>${escapeHtml(entry.command)}</h3>
              <p class="verdict">${entry.status} (${exitCode})${entry.truncated ? " — output truncated" : ""}</p>
              <details><summary>output</summary><pre>${escapeHtml(entry.output)}</pre></details>
            </div>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review Report</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Review Report: ${escapeHtml(result.repositoryPath)}</h1>
  <p class="meta">Base ref: ${escapeHtml(result.baseRef)}</p>
  <div class="tiles">${tiles}</div>
  ${flags}
  <h2>Changed files</h2>
  ${files}
  ${diffs ? `<h2>Diffs</h2>${diffs}` : ""}
  <h2>Validations</h2>
  ${validations}
</main>
</body>
</html>`;
}
