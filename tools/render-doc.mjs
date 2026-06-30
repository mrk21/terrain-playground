// Markdown ドキュメント（Mermaid 図・LaTeX 数式・相対参照の SVG を含む）を
// 1 枚の PNG に焼いて目視確認するための開発ツール。GitHub の描画を待たずに
// 「Mermaid が壊れていないか」「数式が組版されるか」「SVG が両テーマで潰れないか」を
// ローカル（＝AI も）で確認できる。
//
// 分担:
//   - 本文/表/コード … markdown-it（Node）
//   - 数式 $...$ / $$...$$ … KaTeX（Node 側で HTML 化。@vscode/markdown-it-katex）
//   - ```mermaid 図 … 実 DOM が要るので Playwright の Chromium で mermaid.run()
//   - assets/*.svg … 一時 HTML を docs/ 直下に置くので相対パスでそのまま解決
//
// 使い方:
//   npm run docs:render -- docs/quadtree-lod.md           # 1 ファイル（light）
//   npm run docs:render -- docs/quadtree-lod.md --theme both
//   npm run docs:render                                   # docs/*.md を全部（light）
//   npm run docs:render -- docs/quadtree-lod.md --clip .mermaid   # 図ごとに等倍で抜き出す
// 出力: test-results/docs/<名前>[.dark].png（test-results は gitignore 済み）
//   --clip 指定時は <名前>.clip<i>[.dark].png を要素ごとに出力（細部のズーム確認用）

import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import katexPluginNs from "@vscode/markdown-it-katex";
import MarkdownIt from "markdown-it";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ESM/CJS 相互運用で default が二重に包まれることがあるので両対応で取り出す。
const katexPlugin = katexPluginNs.default ?? katexPluginNs;

const md = new MarkdownIt({ html: true, linkify: true }).use(katexPlugin);
// ```mermaid フェンスは描画せず、ブラウザ側 mermaid.run() が拾える形で素通しする。
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if ((token.info || "").trim() === "mermaid") {
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

const THEME_BG = { light: "#ffffff", dark: "#0d1117" };
const THEME_FG = { light: "#1f2328", dark: "#c9d1d9" };

function pageCss(theme) {
  const bg = THEME_BG[theme];
  const fg = THEME_FG[theme];
  const border = theme === "dark" ? "#30363d" : "#d0d7de";
  const codeBg = theme === "dark" ? "#161b22" : "#f6f8fa";
  return `
    body { margin: 0; background: ${bg}; color: ${fg};
      font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      line-height: 1.7; }
    .markdown-body { max-width: 860px; margin: 0 auto; padding: 32px 40px; }
    h1, h2, h3 { line-height: 1.3; } h2 { border-bottom: 1px solid ${border}; padding-bottom: .3em; }
    a { color: ${theme === "dark" ? "#4493f8" : "#0969da"}; }
    code { background: ${codeBg}; padding: .2em .4em; border-radius: 6px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 85%; }
    pre { background: ${codeBg}; padding: 16px; border-radius: 6px; overflow: auto; }
    pre code { background: none; padding: 0; }
    pre.mermaid { background: none; text-align: center; }
    table { border-collapse: collapse; } th, td { border: 1px solid ${border}; padding: 6px 13px; }
    blockquote { color: ${theme === "dark" ? "#8b949e" : "#59636e"};
      border-left: .25em solid ${border}; margin: 0; padding: 0 1em; }
    img { max-width: 100%; }
    hr { border: 0; border-top: 1px solid ${border}; }
  `;
}

function buildHtml({ bodyHtml, katexCssUrl, mermaidJs, theme }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${katexCssUrl}">
<style>${pageCss(theme)}</style></head>
<body><article class="markdown-body">${bodyHtml}</article>
<script>${mermaidJs}</script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: ${theme === "dark" ? '"dark"' : '"default"'}, securityLevel: "loose" });
  (async () => {
    try { await mermaid.run({ querySelector: ".mermaid" }); }
    catch (e) { document.body.dataset.mermaidError = String(e && e.message || e); }
    window.__mermaidDone = true;
  })();
</script></body></html>`;
}

async function capture(page, outDir, stem, theme, clip) {
  const suffix = theme === "dark" ? ".dark" : "";
  if (!clip) {
    const out = path.join(outDir, `${stem}${suffix}.png`);
    await page.screenshot({ path: out, fullPage: true });
    return [out];
  }
  const els = await page.locator(clip).all();
  const outs = [];
  for (let i = 0; i < els.length; i++) {
    const out = path.join(outDir, `${stem}.clip${i}${suffix}.png`);
    await els[i].screenshot({ path: out });
    outs.push(out);
  }
  return outs;
}

// GitHub の MathJax は markdown が先に `\_`→`_` を戻すため、`\text{}` など text mode
// 内の下線で「'_' allowed only in math mode」になり数式ごと壊れる。KaTeX で焼くこのツール
// は通してしまうので、ソース段階で警告する（記号＋凡例に直す合図）。`\log_2` の math mode
// 添字 `_{...}` は安全なので、text wrapper 内の下線だけを拾う。
function lintGithubMath(source) {
  const segs = [];
  for (const m of source.matchAll(/\$\$([\s\S]*?)\$\$/g)) segs.push(m[1]);
  for (const m of source.matchAll(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g))
    segs.push(m[1]);
  const textGroup =
    /\\(?:text|mathrm|mathit|mathbf|mathsf|texttt|operatorname)\{[^}]*?\\?_[^}]*?\}/;
  const warns = [];
  for (const seg of segs) {
    const m = seg.match(textGroup);
    if (m) warns.push(m[0]);
    else if (/\\_/.test(seg)) warns.push(seg.trim().slice(0, 48));
  }
  return warns;
}

async function renderDoc(page, mdPath, theme, clip) {
  const abs = path.resolve(mdPath);
  const docDir = path.dirname(abs);
  const source = await readFile(abs, "utf8");
  for (const w of lintGithubMath(source)) {
    console.warn(
      `  ⚠ GitHub数式: text mode 内の下線は GitHub で壊れる（記号＋凡例に）: ${w}`,
    );
  }
  const bodyHtml = md.render(source);
  const katexCssUrl = pathToFileURL(
    path.join(ROOT, "node_modules/katex/dist/katex.min.css"),
  ).href;
  const mermaidJs = await readFile(
    path.join(ROOT, "node_modules/mermaid/dist/mermaid.min.js"),
    "utf8",
  );

  // 一時 HTML は docs/ 直下に置く（相対 assets/*.svg を解決させるため）。
  const tmp = path.join(docDir, `.render-preview.${process.pid}.html`);
  await writeFile(
    tmp,
    buildHtml({ bodyHtml, katexCssUrl, mermaidJs, theme }),
    "utf8",
  );
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
    await page.waitForFunction(() => window.__mermaidDone === true, {
      timeout: 30_000,
    });
    const err = await page.evaluate(() => document.body.dataset.mermaidError);
    if (err) console.warn(`  ⚠ mermaid: ${err}`);

    const outDir = path.join(ROOT, "test-results/docs");
    await mkdir(outDir, { recursive: true });
    const stem = path.basename(mdPath).replace(/\.md$/, "");
    return await capture(page, outDir, stem, theme, clip);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function parseArgs(argv) {
  const files = [];
  let theme = "light";
  let clip = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--theme") theme = argv[++i];
    else if (a === "--dark") theme = "dark";
    else if (a.startsWith("--theme=")) theme = a.slice("--theme=".length);
    else if (a === "--clip") clip = argv[++i];
    else if (a.startsWith("--clip=")) clip = a.slice("--clip=".length);
    else files.push(a);
  }
  return {
    files,
    themes: theme === "both" ? ["light", "dark"] : [theme],
    clip,
  };
}

async function resolveFiles(files) {
  if (files.length > 0) return files;
  const docs = path.join(ROOT, "docs");
  const entries = await readdir(docs);
  return entries
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(docs, f));
}

const { files, themes, clip } = parseArgs(process.argv.slice(2));
const targets = await resolveFiles(files);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 980, height: 800 },
  deviceScaleFactor: 2,
});
try {
  for (const file of targets) {
    for (const theme of themes) {
      const outs = await renderDoc(page, file, theme, clip);
      const rel = outs.map((o) => path.relative(ROOT, o)).join(", ");
      console.log(`✓ ${path.relative(ROOT, file)} (${theme}) → ${rel}`);
    }
  }
} finally {
  await browser.close();
}
