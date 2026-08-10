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

/** Wordmark, embedded so the page keeps its zero-external-requests guarantee. */
const LOGO_DATA_URI =
  "data:image/png;base64,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";

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
               "Segoe UI", Helvetica, Arial, sans-serif;
         -webkit-font-smoothing: antialiased; }
  .display { font-family: "Space Grotesk", Inter, -apple-system, sans-serif;
             font-weight: 500; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 0 40px; }
  @media (max-width: 640px) { .wrap { padding: 0 20px; } }

  .topbar { border-bottom: 1px solid var(--hairline); }
  .topbar .wrap { padding-top: 16px; padding-bottom: 16px; display: flex;
                  align-items: center; justify-content: space-between; gap: 24px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { height: 26px; width: auto; display: block; }
  .brand .divider { width: 1px; height: 18px; background: var(--hairline); }
  .brand .name { font-size: 14px; letter-spacing: -0.02em; }
  .topbar .meta { font-size: 12px; color: var(--slate); }

  .hero { padding-top: 56px; }
  .eyebrow { margin: 0 0 14px; font-size: 11px; font-weight: 500;
             letter-spacing: .09em; text-transform: uppercase; color: var(--slate); }
  h1 { margin: 0; font-size: 56px; line-height: 1.04; letter-spacing: -0.035em;
       word-break: break-word; }
  @media (max-width: 640px) { h1 { font-size: 36px; } }
  .hero .meta { margin: 18px 0 0; font-size: 13px; color: var(--slate);
                word-break: break-all; }

  .metrics { margin-top: 40px; display: grid; grid-template-columns: repeat(5, 1fr);
             border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); }
  .metric { padding: 22px 20px 24px; border-left: 1px solid var(--hairline); }
  .metric:first-child { border-left: none; padding-left: 0; }
  .metric b { display: block; font-size: 38px; letter-spacing: -0.03em;
              line-height: 1; font-variant-numeric: tabular-nums; font-weight: 500;
              font-family: "Space Grotesk", Inter, -apple-system, sans-serif; }
  .metric span { display: block; margin-top: 8px; font-size: 12px; color: var(--slate); }
  .metric.add b { color: var(--add); } .metric.del b { color: var(--del); }
  @media (max-width: 720px) {
    .metrics { grid-template-columns: repeat(2, 1fr); }
    .metric:nth-child(odd) { border-left: none; padding-left: 0; }
    .metric:nth-child(n+3) { border-top: 1px solid var(--hairline); }
  }

  section { margin-top: 40px; }
  h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.02em; }
  .sub { margin: 0 0 12px; font-size: 13px; color: var(--slate); }

  .rows { display: flex; flex-direction: column; }
  .row { display: flex; align-items: baseline; justify-content: space-between;
         gap: 16px; padding: 14px 0; border-top: 1px solid var(--hairline); }
  .row:last-child { border-bottom: 1px solid var(--hairline); }
  .row .detail { font-size: 12px; color: var(--slate); }

  .files { border-bottom: 1px solid var(--hairline); }
  .file-grid { display: grid; grid-template-columns: 1fr 90px 108px 120px;
               gap: 16px; align-items: center; padding: 13px 0;
               border-top: 1px solid var(--hairline); }
  .file-grid.head { padding: 10px 0; font-size: 11px; font-weight: 500;
                    letter-spacing: .09em; text-transform: uppercase;
                    color: var(--slate); }
  .file-grid .path { font-size: 13px; word-break: break-all; }
  .file-grid .old { color: var(--slate); }
  .file-grid .status { font-size: 12px; color: var(--slate); }
  .file-grid .lines { text-align: right; font-size: 12px;
                      font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden;
         background: var(--fog); }
  .bar .a { background: var(--add); } .bar .d { background: var(--del); }
  .plus { color: var(--add); } .minus { color: var(--del); }
  @media (max-width: 640px) {
    .file-grid { grid-template-columns: 1fr 80px; }
    .file-grid .status, .file-grid .bar-cell { display: none; }
  }

  .diffs { border-bottom: 1px solid var(--hairline); }
  details.diff { border-top: 1px solid var(--hairline); padding: 12px 0; }
  details.diff summary { cursor: pointer; display: flex; justify-content: space-between;
                         gap: 16px; align-items: baseline; list-style: none; }
  details.diff summary::-webkit-details-marker { display: none; }
  details.diff .path { font-size: 13px; word-break: break-all; }
  details.diff .counts { font-size: 12px; color: var(--slate); white-space: nowrap; }
  pre { margin: 12px 0 4px; background: var(--fog); border-radius: 8px;
        padding: 14px 16px; overflow-x: auto; font-size: 12.5px; line-height: 1.55;
        font-family: ui-monospace, "SF Mono", Menlo, monospace; }

  .cards { display: flex; flex-direction: column; gap: 12px; }
  .card { border: 1px solid var(--hairline); border-radius: 12px; padding: 16px 20px; }
  .card .head { display: flex; justify-content: space-between; gap: 16px;
                align-items: baseline; }
  .card h3 { margin: 0; font-size: 13px; font-weight: 400; word-break: break-all;
             font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .card .verdict { font-size: 13px; color: var(--slate); white-space: nowrap; }
  .card .verdict.fail { color: var(--del); }
  .card details { margin-top: 10px; }
  .card summary { cursor: pointer; font-size: 13px; color: var(--slate);
                  list-style: none; }
  .card summary::-webkit-details-marker { display: none; }
  .card pre { margin: 10px 0 0; }
  .empty { font-size: 13px; color: var(--slate); }

  .footer { margin-top: 96px; border-top: 1px solid var(--hairline); }
  .footer .wrap { padding-top: 20px; padding-bottom: 20px; display: flex;
                  justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .footer span { font-size: 12px; color: var(--slate); }
`;

function splitFlag(flag: string): { label: string; detail: string } {
  const match = flag.match(/^(.*?)\s*\((.+)\)$/);
  return match ? { label: match[1], detail: match[2] } : { label: flag, detail: "" };
}

function fileRow(file: ChangedFile, maxLines: number): string {
  const total = file.additions + file.deletions;
  const addPct = maxLines === 0 ? 0 : Math.round((file.additions / maxLines) * 100);
  const delPct = maxLines === 0 ? 0 : Math.round((file.deletions / maxLines) * 100);
  const rename = file.oldPath ? ` <span class="old">← ${escapeHtml(file.oldPath)}</span>` : "";
  const lines = file.binary
    ? "binary"
    : `<span class="plus">+${file.additions}</span> <span class="minus">−${file.deletions}</span>`;
  const bar =
    file.binary || total === 0
      ? ""
      : `<span class="bar"><span class="a" style="width:${addPct}%"></span><span class="d" style="width:${delPct}%"></span></span>`;
  return `<div class="file-grid">
    <span class="path mono">${escapeHtml(file.path)}${rename}</span>
    <span class="status">${file.status}</span>
    <span class="lines mono">${lines}</span>
    <span class="bar-cell">${bar}</span>
  </div>`;
}

export function htmlReport(result: ReviewResult): string {
  const { summary } = result;
  const maxLines = Math.max(0, ...result.changedFiles.map((file) => file.additions + file.deletions));
  const repoName = result.repositoryPath.replace(/\/+$/, "").split("/").pop() || result.repositoryPath;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date());

  const metrics = `
    <div class="metric"><b>${summary.totalFiles}</b><span>Files changed</span></div>
    <div class="metric add"><b>+${summary.additions}</b><span>Additions</span></div>
    <div class="metric del"><b>−${summary.deletions}</b><span>Deletions</span></div>
    <div class="metric"><b>${summary.validationsPassed}</b><span>Validations passed</span></div>
    <div class="metric"><b>${summary.validationsFailed}</b><span>Validations failed</span></div>`;

  const flags =
    summary.flags.length === 0
      ? ""
      : `<section class="wrap">
          <h2 class="display">Review flags</h2>
          <p class="sub">Heuristics worth a second look before merge.</p>
          <div class="rows">${summary.flags
            .map((flag) => {
              const { label, detail } = splitFlag(flag);
              return `<div class="row"><span>${escapeHtml(label)}</span><span class="detail mono">${escapeHtml(detail)}</span></div>`;
            })
            .join("")}</div>
        </section>`;

  const files =
    result.changedFiles.length === 0
      ? '<p class="empty">No changed files.</p>'
      : `<div class="files">
          <div class="file-grid head"><span>File</span><span>Status</span><span style="text-align:right">Lines</span><span></span></div>
          ${result.changedFiles.map((file) => fileRow(file, maxLines)).join("")}
        </div>`;

  const withPatches = result.changedFiles.filter((file) => file.patch);
  const diffs =
    withPatches.length === 0
      ? ""
      : `<section class="wrap">
          <h2 class="display">Diffs</h2>
          <p class="sub">Per-file unified diffs, capped at 4k characters each.</p>
          <div class="diffs">${withPatches
            .map(
              (file) => `<details class="diff">
                <summary><span class="path mono">${escapeHtml(file.path)}</span><span class="counts">+${file.additions} / −${file.deletions}${file.patchTruncated ? " · truncated" : ""}</span></summary>
                <pre>${escapeHtml(file.patch ?? "")}</pre>
              </details>`,
            )
            .join("")}</div>
        </section>`;

  const validations =
    result.validationResults.length === 0
      ? '<p class="empty">No validation commands were run.</p>'
      : `<div class="cards">${result.validationResults
          .map((entry) => {
            const exitCode = entry.exitCode === null ? "killed" : `exit ${entry.exitCode}`;
            const failed = entry.status === "failed";
            return `<div class="card">
              <div class="head">
                <h3>${escapeHtml(entry.command)}</h3>
                <span class="verdict${failed ? " fail" : ""}">${entry.status} · ${exitCode}${entry.truncated ? " · output truncated" : ""}</span>
              </div>
              <details><summary>Output</summary><pre>${escapeHtml(entry.output)}</pre></details>
            </div>`;
          })
          .join("")}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review report · ${escapeHtml(repoName)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="topbar">
  <div class="wrap">
    <div class="brand">
      <img src="${LOGO_DATA_URI}" alt="Logo">
      <span class="divider"></span>
      <span class="name display">Repository inspector</span>
    </div>
    <span class="meta mono">v2.0.0 · ${escapeHtml(result.baseRef)}</span>
  </div>
</div>

<div class="hero wrap">
  <p class="eyebrow">Review report</p>
  <h1 class="display">${escapeHtml(repoName)}</h1>
  <p class="meta mono">base ${escapeHtml(result.baseRef)} · ${summary.totalFiles} files changed · ${date}</p>
</div>

<div class="wrap"><div class="metrics">${metrics}</div></div>

${flags}

<section class="wrap">
  <h2 class="display">Changed files</h2>
  <p class="sub">Relative to base ref. Bars are scaled to the largest file in the change.</p>
  ${files}
</section>

${diffs}

<section class="wrap">
  <h2 class="display">Validations</h2>
  <p class="sub">Commands run inside the repository. Failures are reported, not fatal.</p>
  ${validations}
</section>

<div class="footer">
  <div class="wrap">
    <span>Generated by repository inspector · read-only inspection</span>
    <span class="mono">${escapeHtml(result.repositoryPath)}</span>
  </div>
</div>
</body>
</html>`;
}
