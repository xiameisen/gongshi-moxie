/**
 * 校验器：
 *  1) 逐条（按出现顺序）比对 788 个公式的 SVG —— 构建产物 vs 原文件
 *  2) 结构计数（章节/小节/卡片/公式/表格/注释…）一致
 *  3) 静态检查：无残留 $ 定界符、运行时挂载点齐全、卡片学习属性完整、
 *     内联字形缓存、无外部资源、章节默写入口
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);

const normalizeTex = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/** 按文档顺序收集 (tex, svg) 对 */
function collect(file) {
  const doc = parse(fs.readFileSync(file, 'utf8'), { comment: true });
  const list = [];
  for (const span of doc.querySelectorAll('.latex-src')) {
    let prev = span.previousElementSibling;
    while (prev && prev.rawTagName !== 'svg') prev = prev.previousElementSibling;
    list.push({ tex: normalizeTex(span.textContent.trim()), svg: prev ? prev.outerHTML : null });
  }
  return { doc, list };
}

const A = collect(p('src', 'original.html'));
const B = collect(p('docs', 'index.html'));

let fail = 0;
const diffs = [];
const n = Math.max(A.list.length, B.list.length);
for (let i = 0; i < n; i++) {
  const a = A.list[i], b = B.list[i];
  if (!a || !b) { fail++; diffs.push(`#${i} 数量不齐`); continue; }
  if (a.svg === b.svg && a.tex === b.tex) continue;
  fail++;
  if (a.tex !== b.tex) diffs.push(`#${i} TeX 不同: ${JSON.stringify(a.tex.slice(0, 70))} vs ${JSON.stringify(b.tex.slice(0, 70))}`);
  else diffs.push(`#${i} SVG 不同: ${JSON.stringify(a.tex.slice(0, 70))}`);
}

console.log('=== 1) 公式 SVG 逐条等价性（按文档顺序） ===');
console.log(`  原文件公式 ${A.list.length} 条 / 产物公式 ${B.list.length} 条`);
console.log(`  ${fail === 0 ? '✓ 全部逐字节一致' : '✗ 不一致 ' + fail + ' 条'}`);
diffs.slice(0, 8).forEach((d) => console.log('   -', d));

console.log('\n=== 2) 结构计数 ===');
const cnt = (doc, sel) => doc.querySelectorAll(sel).length;
const rows = [
  ['章节 section.chapter', 'section.chapter'],
  ['小节 .sec', '.sec'],
  ['卡片 .card', '.card'],
  ['公式 .latex-src', '.latex-src'],
  ['表格 table.tbl', 'table.tbl'],
  ['提示 .note', '.note'],
  ['技巧 .tip', '.tip'],
  ['关系图 .rel', '.rel'],
  ['正文 .body', '.card .body'],
];
let structOk = true;
for (const [name, sel] of rows) {
  const a = cnt(A.doc, sel), b = cnt(B.doc, sel);
  if (a !== b) structOk = false;
  console.log(`  ${a === b ? '✓' : '✗'} ${name.padEnd(22)} 原 ${String(a).padStart(4)}  新 ${String(b).padStart(4)}`);
}

console.log('\n=== 3) 静态检查 ===');
const distRaw = fs.readFileSync(p('docs', 'index.html'), 'utf8');
const dist = distRaw.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');

const noLatex = dist.replace(/<span class="latex-src" hidden>[\s\S]*?<\/span>/g, '');
const stray = (noLatex.match(/\$/g) || []).length;
console.log(`  ${stray === 0 ? '✓' : '✗'} 无残留 $ 数学定界符（发现 ${stray} 处）`);

const need = ['drillBtn', 'panelBtn', 'dueBadge', 'themeBtn', 'searchInput', 'toc', 'backTop',
  'menuBtn', 'heroLearned', 'searchInfo', 'noResult', 'sidebar'];
const missing = need.filter((id) => !dist.includes('id="' + id + '"'));
console.log(`  ${missing.length === 0 ? '✓' : '✗'} 静态挂载点齐全${missing.length ? '（缺：' + missing.join(', ') + '）' : ''}`);

// 运行时动态创建的元素（默写/面板）应在脚本中存在
const runtimeIds = ['drillScope', 'drillShow', 'drillRate', 'panelTabs', 'panelBody'];
const rtMissing = runtimeIds.filter((id) => !distRaw.includes('id="' + id + '"'));
console.log(`  ${rtMissing.length === 0 ? '✓' : '✗'} 运行时组件模板齐全${rtMissing.length ? '（缺：' + rtMissing.join(', ') + '）' : ''}`);

const dc = (dist.match(/data-card="/g) || []).length;
const chips = (dist.match(/class="lv-chip"/g) || []).length;
const stars = (dist.match(/data-act="star"/g) || []).length;
console.log(`  ${dc === 123 && chips === 123 && stars === 123 ? '✓' : '✗'} 卡片学习属性 card=${dc} chip=${chips} star=${stars}`);

console.log(`  ${dist.includes('id="MJX-SVG-global-cache"') ? '✓' : '✗'} 内联全局字形缓存（离线渲染依赖）`);

const ext = [...distRaw.matchAll(/(?:src|href)="(?:https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
console.log(`  ${ext.length === 0 ? '✓' : '✗'} 无外部资源引用（离线可用）${ext.length ? '：' + ext.slice(0, 3).join(' ') : ''}`);

const chDrill = (dist.match(/class="ch-drill"/g) || []).length;
console.log(`  ${chDrill === 13 ? '✓' : '✗'} 章节默写入口 ch-drill=${chDrill}`);

const ampOk = !/&amp;amp;/.test(distRaw);
console.log(`  ${ampOk ? '✓' : '✗'} 无二次转义残留（&amp;amp;）`);

const ok = fail === 0 && structOk && stray === 0 && missing.length === 0
  && ext.length === 0 && dc === 123 && chips === 123 && stars === 123 && chDrill === 13 && ampOk;
console.log('\n' + (ok ? '✅ 校验通过' : '❌ 校验未通过'));
process.exit(ok ? 0 : 1);
