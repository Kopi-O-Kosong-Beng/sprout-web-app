/* Converts the Checkoff 3 report markdown into a single print-ready HTML file.
 * Diagram PNGs are inlined as data URIs so the file can be opened anywhere and
 * printed to PDF without the images going missing. */
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const VAULT = 'D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault';
const SRC = `${VAULT}/06 Meetings and Feedback/Checkoff 3 Report.md`;
const OUT = `${VAULT}/06 Meetings and Feedback/checkoff3-report.html`;
const ATTACH = `${VAULT}/_attachments/pm3-diagrams`;

let md = fs.readFileSync(SRC, 'utf8');

// Inline every diagram reference as a data URI.
let embedded = 0;
let missing = [];
md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt, src) => {
  const file = path.basename(src.split('?')[0]);
  const abs = path.join(ATTACH, file);
  if (!fs.existsSync(abs)) {
    missing.push(file);
    return `> **[DIAGRAM MISSING: ${file}]** — export it to _attachments/pm3-diagrams/\n`;
  }
  const b64 = fs.readFileSync(abs).toString('base64');
  embedded += 1;
  return `![${alt}](data:image/png;base64,${b64})`;
});

marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
const body = marked.parse(md);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sprout — Checkoff 3 Report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root { --ink:#16181a; --muted:#5a6169; --rule:#d7dbe0; --accent:#2f6b46; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 2.5rem 2rem 4rem; max-width: 60rem;
    font-family: "Charter", "Georgia", "Times New Roman", serif;
    font-size: 10.75pt; line-height: 1.55; color: var(--ink); background:#fff;
  }
  h1,h2,h3,h4 { font-family: "Helvetica Neue", Arial, sans-serif; line-height:1.2; }
  h1 { font-size: 22pt; margin: 0 0 .4rem; letter-spacing:-.01em; }
  h2 {
    font-size: 14pt; margin: 2.2rem 0 .7rem; padding-bottom:.32rem;
    border-bottom: 2px solid var(--accent); page-break-after: avoid;
  }
  h3 { font-size: 11.5pt; margin: 1.4rem 0 .45rem; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 1rem 0 .35rem; color: var(--muted); }
  p, li { orphans: 3; widows: 3; }
  table {
    width:100%; border-collapse: collapse; margin: .8rem 0 1.2rem;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 8.5pt;
    page-break-inside: avoid;
  }
  th, td { border: 1px solid var(--rule); padding: .34rem .5rem; text-align:left; vertical-align: top; }
  th { background:#eef2ef; font-weight:600; }
  tr:nth-child(even) td { background:#fafbfa; }
  code {
    font-family: "SF Mono", Consolas, monospace; font-size: .88em;
    background:#f2f4f6; padding: .06rem .28rem; border-radius:3px;
  }
  pre { background:#f6f8fa; padding:.7rem .9rem; border-radius:4px; overflow-x:auto; page-break-inside: avoid; }
  pre code { background:none; padding:0; }
  img { max-width:100%; height:auto; display:block; margin: 1rem auto; page-break-inside: avoid; }
  blockquote {
    margin: .9rem 0; padding: .5rem .9rem; border-left: 3px solid var(--accent);
    background:#f4f8f5; color: var(--muted);
  }
  a { color: var(--accent); }
  hr { border:0; border-top:1px solid var(--rule); margin: 2rem 0; }
  /* Table of contents */
  h2#table-of-contents + ul { columns: 2; font-family:"Helvetica Neue",Arial,sans-serif; font-size:9.5pt; }
  @media print {
    body { padding: 0; max-width:none; }
    a { text-decoration: none; color: var(--ink); }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);
console.log(`  ${(html.length / 1024 / 1024).toFixed(2)} MB, ${embedded} diagrams embedded`);
if (missing.length) console.log(`  MISSING: ${[...new Set(missing)].join(', ')}`);
