import { FONT_FACE_CSS } from "./fonts.js";
import { LOGO_DATA_URI } from "./logo.js";
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

const SANS = `Satoshi, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

const STYLE = `
  :root {
    --paper: #FFFFFF; --ink: #0F1012; --slate: #7A7F87;
    --hairline: #E7E9EC; --fog: #F6F7F8; --cyan: #00C2E8;
    --add: #35875C; --del: #B5473E;
    --on-dark: #F2F3F5; --on-dark-muted: #9AA0A8;
    --on-dark-hairline: rgba(255,255,255,0.10);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font: 400 14px/1.6 ${SANS};
         -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 0 40px; }
  @media (max-width: 640px) { .wrap { padding: 0 20px; } }

  .hero-dark { background: var(--ink); color: var(--on-dark); padding-bottom: 150px; }
  .topbar { border-bottom: 1px solid var(--on-dark-hairline); }
  .topbar .wrap { padding-top: 18px; padding-bottom: 18px; display: flex;
                  align-items: center; justify-content: space-between; gap: 24px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { height: 26px; width: auto; display: block; }
  .brand .divider { width: 1px; height: 18px; background: rgba(255,255,255,0.16); }
  .brand .name { font-size: 14px; font-weight: 500; letter-spacing: -0.02em; }
  .topbar .meta { font-size: 12px; color: var(--on-dark-muted); }

  .hero { padding-top: 76px; }
  .eyebrow { margin: 0 0 22px; font-size: 11px; font-weight: 500;
             letter-spacing: .09em; text-transform: uppercase; color: var(--on-dark-muted); }
  h1 { margin: 0; font-size: 76px; font-weight: 700; line-height: 1.02;
       letter-spacing: -0.035em; text-wrap: pretty; }
  h1 .accent { color: var(--cyan); }
  @media (max-width: 720px) { h1 { font-size: 44px; } }
  .lede { margin: 28px 0 0; font-size: 16px; line-height: 1.55;
          color: var(--on-dark-muted); max-width: 44ch; }
  .ctas { display: flex; gap: 12px; margin-top: 36px; flex-wrap: wrap; }
  .btn { font-weight: 700; font-size: 15px; padding: 15px 30px; border-radius: 8px; }
  .btn.primary { background: var(--cyan); color: var(--ink); }
  .btn.ghost { background: transparent; color: var(--on-dark);
               border: 1px solid rgba(255,255,255,0.22); }

  .metric-card { background: var(--paper); border: 1px solid var(--hairline);
                 border-radius: 24px; padding: 34px 36px; margin-top: -110px;
                 position: relative; }
  .metrics { display: grid; grid-template-columns: repeat(5, 1fr); }
  .metric { padding: 22px 20px 24px; border-left: 1px solid var(--hairline); }
  .metric:first-child { border-left: none; padding-left: 0; }
  .metric b { display: block; font-size: 44px; letter-spacing: -0.035em;
              line-height: 1; font-variant-numeric: tabular-nums; font-weight: 700; }
  .metric span { display: block; margin-top: 8px; font-size: 12px; color: var(--slate); }
  .metric.add b { color: var(--add); } .metric.del b { color: var(--del); }
  @media (max-width: 720px) {
    .metric-card { margin-top: -80px; padding: 20px 24px; }
    .metrics { grid-template-columns: repeat(2, 1fr); }
    .metric:nth-child(odd) { border-left: none; padding-left: 0; }
    .metric:nth-child(n+3) { border-top: 1px solid var(--hairline); }
  }

  section { margin-top: 96px; }
  h2 { margin: 0 0 4px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; }
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
  .card h3 { margin: 0; font-size: 13px; font-weight: 400; word-break: break-all; }
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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
    <span class="path">${escapeHtml(file.path)}${rename}</span>
    <span class="status">${file.status}</span>
    <span class="lines">${lines}</span>
    <span class="bar-cell">${bar}</span>
  </div>`;
}

export function htmlReport(result: ReviewResult): string {
  const { summary } = result;
  const maxLines = Math.max(0, ...result.changedFiles.map((file) => file.additions + file.deletions));
  const repoName = result.repositoryPath.replace(/\/+$/, "").split("/").pop() || result.repositoryPath;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date());

  const lede =
    `${escapeHtml(repoName)} against base ${escapeHtml(result.baseRef)}. ` +
    `${plural(summary.totalFiles, "file")}, ${plural(summary.flags.length, "review flag")}, ` +
    `${plural(summary.validationsFailed, "failing check")}.`;

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
          <h2>Review flags</h2>
          <p class="sub">Heuristics worth a second look before merge.</p>
          <div class="rows">${summary.flags
            .map((flag) => {
              const { label, detail } = splitFlag(flag);
              return `<div class="row"><span>${escapeHtml(label)}</span><span class="detail">${escapeHtml(detail)}</span></div>`;
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
          <h2>Diffs</h2>
          <p class="sub">Per-file unified diffs, capped at 4k characters each.</p>
          <div class="diffs">${withPatches
            .map(
              (file) => `<details class="diff">
                <summary><span class="path">${escapeHtml(file.path)}</span><span class="counts">+${file.additions} / −${file.deletions}${file.patchTruncated ? " · truncated" : ""}</span></summary>
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
<meta name="color-scheme" content="light only">
<title>Review report · ${escapeHtml(repoName)}</title>
<style>${FONT_FACE_CSS}${STYLE}</style>
</head>
<body>
<div class="hero-dark">
  <div class="topbar">
    <div class="wrap">
      <div class="brand">
        <img src="${LOGO_DATA_URI}" alt="Logo">
        <span class="divider"></span>
        <span class="name">Repository inspector</span>
      </div>
      <span class="meta">v2.0.0 · ${escapeHtml(result.baseRef)}</span>
    </div>
  </div>
  <div class="hero wrap">
    <p class="eyebrow">Review report · ${date}</p>
    <h1>Everything this<br>commit changed,<br><span class="accent">read in one pass</span></h1>
    <p class="lede">${lede}</p>
    <div class="ctas">
      <a class="btn primary" href="#files">Jump to changes</a>
      <a class="btn ghost" href="#validations">See validations</a>
    </div>
  </div>
</div>

<div class="wrap"><div class="metric-card"><div class="metrics">${metrics}</div></div></div>

${flags}

<section class="wrap" id="files">
  <h2>Changed files</h2>
  <p class="sub">Relative to base ref. Bars are scaled to the largest file in the change.</p>
  ${files}
</section>

${diffs}

<section class="wrap" id="validations">
  <h2>Validations</h2>
  <p class="sub">Commands run inside the repository. Failures are reported, not fatal.</p>
  ${validations}
</section>

<div class="footer">
  <div class="wrap">
    <span>Generated by repository inspector · read-only inspection</span>
    <span>${escapeHtml(result.repositoryPath)}</span>
  </div>
</div>
</body>
</html>`;
}
