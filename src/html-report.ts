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

/*
 * Visual language: quiet canvas, hairline separation, one cyan accent.
 * Fonts stay a local stack (Inter when installed) so the page keeps its
 * zero-external-requests guarantee. Diff green/red is retained, muted,
 * because +/- and pass/fail are functional data colors in a review tool.
 */
const STYLE = `
  :root {
    --paper: #FFFFFF; --ink: #0F1012; --slate: #7A7F87;
    --hairline: #E7E9EC; --fog: #F6F7F8; --cyan: #00C2E8;
    --add: #35875C; --del: #B5473E;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #0F1012; --ink: #F2F3F5; --slate: #9AA0A8;
      --hairline: rgba(255,255,255,0.12); --fog: rgba(255,255,255,0.04);
      --add: #4CAF7D; --del: #E07B72;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font: 400 14px/1.6 Inter, -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 60rem; margin: 0 auto; padding: 48px 24px 64px; }
  .eyebrow { font-size: 11px; font-weight: 500; letter-spacing: .08em;
             text-transform: uppercase; color: var(--slate); margin: 0 0 12px; }
  h1 { font-size: 40px; font-weight: 500; letter-spacing: -0.035em;
       line-height: 1.1; margin: 0; word-break: break-word; }
  .accent { width: 40px; height: 3px; background: var(--cyan);
            border: none; margin: 20px 0 16px; }
  .meta { color: var(--slate); font-size: 13px; margin: 0;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          word-break: break-all; }
  h2 { font-size: 20px; font-weight: 500; letter-spacing: -0.02em;
       margin: 40px 0 8px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
  .tile { background: var(--fog); border-radius: 12px; padding: 16px 20px;
          min-width: 8.5rem; }
  .tile b { display: block; font-size: 28px; font-weight: 500;
            letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--slate); font-size: 12px; }
  .flags { margin: 16px 0 0; padding: 0; list-style: none; }
  .flags li { color: var(--slate); font-size: 13px; padding: 8px 0;
              border-top: 1px solid var(--hairline); }
  .flags li:last-child { border-bottom: 1px solid var(--hairline); }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: 10px 12px 10px 0;
           border-bottom: 1px solid var(--hairline); vertical-align: middle; }
  th { font-size: 11px; font-weight: 500; letter-spacing: .08em;
       text-transform: uppercase; color: var(--slate); }
  td.num { text-align: right; font-variant-numeric: tabular-nums;
           white-space: nowrap; font-size: 13px; }
  .path { word-break: break-all; font-size: 13px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .status { color: var(--slate); font-size: 12px; white-space: nowrap; }
  .bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden;
         background: var(--fog); min-width: 6rem; }
  .bar .add { background: var(--add); }
  .bar .del { background: var(--del); }
  .add-count { color: var(--add); } .del-count { color: var(--del); }
  .card { border: 1px solid var(--hairline); border-radius: 12px;
          margin: 12px 0; padding: 14px 18px; }
  .card-head { display: flex; justify-content: space-between; gap: 16px;
               align-items: baseline; }
  .card h3 { margin: 0; font-size: 13px; font-weight: 400;
             font-family: ui-monospace, "SF Mono", Menlo, monospace;
             word-break: break-all; }
  .verdict { font-size: 13px; font-weight: 500; white-space: nowrap; }
  .verdict.pass { color: var(--slate); }
  .verdict.fail { color: var(--del); }
  pre { background: var(--fog); border-radius: 8px; padding: 12px 14px;
        overflow-x: auto; font-size: 12.5px; line-height: 1.5;
        font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  details { border-top: 1px solid var(--hairline); padding: 8px 0; }
  details:last-of-type { border-bottom: 1px solid var(--hairline); }
  .card details, .card details:last-of-type { border: none; padding: 6px 0 0; }
  summary { cursor: pointer; color: var(--slate); font-size: 13px; }
  .empty { color: var(--slate); font-size: 13px; }
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
    <td><span class="path">${escapeHtml(file.path)}${rename}</span></td>
    <td class="status">${file.status}</td>
    <td class="num">${stats}</td>
    <td>${bar}</td>
  </tr>`;
}

export function htmlReport(result: ReviewResult): string {
  const { summary } = result;
  const maxLines = Math.max(0, ...result.changedFiles.map((file) => file.additions + file.deletions));
  const repoName = result.repositoryPath.replace(/\/+$/, "").split("/").pop() || result.repositoryPath;

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
      ? '<p class="empty">No changed files.</p>'
      : `<table>
          <tr><th>File</th><th>Status</th><th></th><th></th></tr>
          ${result.changedFiles.map((file) => fileRow(file, maxLines)).join("")}
        </table>`;

  const diffs = result.changedFiles
    .filter((file) => file.patch)
    .map(
      (file) => `<details>
        <summary><span class="path">${escapeHtml(file.path)}</span>${file.patchTruncated ? " (truncated)" : ""}</summary>
        <pre>${escapeHtml(file.patch ?? "")}</pre>
      </details>`,
    )
    .join("");

  const validations =
    result.validationResults.length === 0
      ? '<p class="empty">No validation commands were run.</p>'
      : result.validationResults
          .map((entry) => {
            const exitCode = entry.exitCode === null ? "killed" : `exit ${entry.exitCode}`;
            const verdictClass = entry.status === "passed" ? "pass" : "fail";
            return `<div class="card">
              <div class="card-head">
                <h3>${escapeHtml(entry.command)}</h3>
                <span class="verdict ${verdictClass}">${entry.status} (${exitCode})${entry.truncated ? " — output truncated" : ""}</span>
              </div>
              <details><summary>output</summary><pre>${escapeHtml(entry.output)}</pre></details>
            </div>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review report · ${escapeHtml(repoName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <p class="eyebrow">Review report</p>
  <h1>${escapeHtml(repoName)}</h1>
  <hr class="accent">
  <p class="meta">${escapeHtml(result.repositoryPath)} · base ${escapeHtml(result.baseRef)}</p>
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
