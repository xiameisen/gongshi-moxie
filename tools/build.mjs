/**
 * 构建器：content/book.json + src/base.css + src/app.css + src/app.js
 *        ->  dist/index.html（零依赖、可离线的单文件）
 *
 * 公式在构建期用 MathJax 渲染成 SVG，并把全局字形缓存内联一次，
 * 因此产物无需联网、无外部资源。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, substituteMath, escapeAttr, escapeHtml } from './lib/math.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);
const read = (f) => fs.readFileSync(p(f), 'utf8');

// ---------------------------------------------------------------- 站点配置
const SITE = {
  title: '考研数学 · 高等数学公式速查与默写',
  brand: '考研数学 · 高数',
  brandSub: '速查 · 默写 · 错题',
  heroTitle: '考研数学 · 高等数学',
  heroDesc: '面向考研的公式速查与默写自测。按高等数学标准学习顺序编排：预备知识 → 导数与微分 → '
    + '中值定理与导数应用 → 不定积分 → 定积分 → 定积分应用 → 微分方程 → 多元函数微分学 → 二重积分 → '
    + '空间解析几何 → 多元函数积分学 → 无穷级数。全部公式在构建期渲染为 SVG 矢量图，'
    + '<b>离线可用、无需联网</b>，并支持正文检索、公式默写自测、错题本与掌握度追踪。',
  usage: '<b>使用说明：</b>点击左侧目录跳转章节；按 <b>/</b> 聚焦搜索框，输入中文或公式名即可过滤卡片，按 <b>Esc</b> 清空。'
    + '按 <b>D</b> 打开<b>默写自测</b>（先想再看，自评记忆程度，系统按遗忘曲线安排复习）；'
    + '按 <b>L</b> 打开<b>学习面板</b>（待复习 / 收藏 / 错题 / 掌握度）。'
    + '每张卡片右上角的 <b>☆</b> 可收藏，自评为「忘了」会自动进入错题本。学习记录保存在浏览器本地，不上传、可随时重置。'
    + '每章标注对应原始笔记页码；每条公式的 LaTeX 源码已隐藏保留，因此可用符号名（如 sin、frac）检索。',
  footer: [
    '考研数学 · 高等数学公式速查与默写手册',
    '数据驱动构建：content/book.json → tools/build.mjs → dist/index.html（单文件、离线可用）',
    '已覆盖高等数学；线性代数、概率论与数理统计已在数据结构中预留扩展位',
  ],
};

// ---------------------------------------------------------------- 读入
// 学科注册表驱动：新增线性代数 / 概率论与数理统计时，把 status 改成 active 即可。
const registry = JSON.parse(read('content/subjects.json'));
const activeSubjects = registry.subjects
  .filter((s) => s.status === 'active')
  .map((s) => ({ ...s, book: JSON.parse(read(s.file)) }));
if (!activeSubjects.length) throw new Error('content/subjects.json 中没有任何 status=active 的学科');

const allChapters = [];
for (const sub of activeSubjects) {
  for (const ch of sub.book.chapters) {
    if (allChapters.some((c) => c.id === ch.id)) {
      throw new Error(`章节 id 冲突：${ch.id} —— 多学科并存时章节 id 需全局唯一（建议加学科前缀）`);
    }
    allChapters.push(Object.assign({}, ch, { subject: sub.id }));
  }
}

const baseCss = read('src/base.css');
const appCss = read('src/app.css');
const appJs = read('src/app.js');
const renderer = createRenderer();

// ---------------------------------------------------------------- 内容生成
function cardHtml(card, chId, secId, subjectId) {
  const body = substituteMath(card.html, renderer);
  const title = substituteMath(card.titleHtml || escapeHtml(card.title), renderer);
  const attrs = [
    `id="card-${escapeAttr(card.id)}"`,
    `class="card"`,
    `data-card="${escapeAttr(card.id)}"`,
    `data-subject="${escapeAttr(subjectId)}"`,
    `data-ch="${escapeAttr(chId)}"`,
    `data-sec="${escapeAttr(secId)}"`,
    `data-title="${escapeAttr(card.title)}"`,
    `data-tag="${escapeAttr(card.tag)}"`,
    `data-kw="${escapeAttr(card.kw)}"`,
  ].join(' ');
  return `<div ${attrs}>
        <div class="ct"><span class="ct-t">${title}</span>`
    + (card.tag ? `<span class="tag">${escapeHtml(card.tag)}</span>` : '')
    + `<span class="card-tools">`
    + `<span class="lv-chip" data-lv="0" title="掌握度：未学习"></span>`
    + `<button class="ct-btn" data-act="star" title="收藏 / 取消收藏" aria-label="收藏">☆</button>`
    + `</span></div>
        ${body}
      </div>`;
}

function sectionHtml(sec, chId, subjectId) {
  const cards = sec.cards.map((c) => cardHtml(c, chId, sec.id, subjectId)).join('\n      ');
  const en = sec.en ? ` <span class="en">${escapeHtml(sec.en)}</span>` : '';
  return `<div class="sec" id="${escapeAttr(sec.id)}">
      <h3>${escapeHtml(sec.num)} ${escapeHtml(sec.title)}${en}</h3>
      ${cards}
    </div>`;
}

function chapterHtml(ch) {
  const style = ch.color ? ` style="--c1:${ch.color.c1}; --c2:${ch.color.c2};"` : '';
  const desc = ch.descHtml || escapeHtml(ch.desc);
  const src = ch.source ? `<span class="ch-src">${escapeHtml(ch.source)}</span>` : '';
  const secs = ch.sections.map((s) => sectionHtml(s, ch.id, ch.subject)).join('\n\n    ');
  return `  <section class="chapter" id="${escapeAttr(ch.id)}" data-subject="${escapeAttr(ch.subject)}"${style}>
    <div class="ch-head">
      <div class="num">${escapeHtml(ch.num)}</div>
      <div><h2>${ch.titleHtml}</h2><div class="desc">${desc}</div></div>
      <button class="ch-drill" data-ch="${escapeAttr(ch.id)}" title="默写本章全部卡片">✍️ 默写本章</button>
    </div>
    ${src}

    ${secs}
  </section>`;
}

// 多学科并存时插入学科分节标题；单学科下输出与原版保持一致
const chaptersHtml = activeSubjects.length > 1
  ? activeSubjects.map((sub) => `  <div class="subject-block" data-subject="${escapeAttr(sub.id)}">
    <div class="subject-head">
      <span class="sh-name">${escapeHtml(sub.name)}</span>
      <span class="sh-scope">适用：${escapeHtml(sub.examScopes.join(' / '))}</span>
    </div>
${sub.book.chapters.map((ch) => chapterHtml(Object.assign({}, ch, { subject: sub.id }))).join('\n\n')}
  </div>`).join('\n\n')
  : allChapters.map(chapterHtml).join('\n\n');

// ---------------------------------------------------------------- 统计
const totalCards = allChapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.cards.length, 0), 0);
const totalSections = allChapters.reduce((a, c) => a + c.sections.length, 0);
const totalFormulas = allChapters.reduce((a, c) => a + c.sections.reduce(
  (b, s) => b + s.cards.reduce((d, k) => d + k.tex.length, 0), 0), 0);

const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(SITE.title)}</title>
<style>
${baseCss.trim()}
/* ==================== 学习功能扩展样式 ==================== */
${appCss.trim()}
</style>
</head>
<body>
${renderer.globalCache()}

<!-- ================= 顶栏 ================= -->
<header class="topbar">
  <button class="icon-btn menu-btn" id="menuBtn" title="目录">☰</button>
  <div class="brand">
    <div class="logo">∫</div>
    <div>${escapeHtml(SITE.brand)}<br><small>${escapeHtml(SITE.brandSub)}</small></div>
  </div>
  <div class="searchbox">
    <span class="icon">🔍</span>
    <input id="searchInput" type="text" placeholder="搜索公式 / 定理 / 关键词，如：曲率、分部积分、拉格朗日、泰勒…" autocomplete="off">
    <button class="clear-btn" id="clearBtn" title="清空">×</button>
    <kbd>/</kbd>
  </div>
  <button class="icon-btn" id="drillBtn" title="默写自测（D）">✍️</button>
  <button class="icon-btn has-badge" id="panelBtn" title="学习面板（L）">📚<span class="badge" id="dueBadge">0</span></button>
  <button class="icon-btn" id="themeBtn" title="切换深浅色">🌙</button>
</header>

<!-- ================= 侧边目录 ================= -->
<nav class="sidebar" id="sidebar">
  <div id="toc"></div>
</nav>

<!-- ================= 主内容 ================= -->
<main class="main" id="main">

  <section class="hero">
    <h1>${escapeHtml(SITE.heroTitle)}</h1>
    <p>${SITE.heroDesc}</p>
    <div class="stats">
      <div class="stat"><b>${allChapters.length}</b><span>章节</span></div>
      <div class="stat"><b>${totalSections}</b><span>知识小节</span></div>
      <div class="stat"><b>${totalCards}</b><span>公式卡片</span></div>
      <div class="stat"><b>${totalFormulas}</b><span>条公式</span></div>
      <div class="stat"><b id="heroLearned">0</b><span>已掌握</span></div>
    </div>
  </section>

  <div class="usage">
    <span>💡</span>
    <div>${SITE.usage}</div>
  </div>

  <div class="search-info" id="searchInfo"></div>
  <div class="no-result" id="noResult">🔍 没有找到匹配的公式，换个关键词试试（如「极值」「对称」「反常积分」）。</div>

${chaptersHtml}

  <footer class="footer">
${SITE.footer.map((l) => '    <div>' + escapeHtml(l) + '</div>').join('\n')}
  </footer>
</main>

<button class="backtop" id="backTop" title="返回顶部">↑</button>

<script>
${appJs.trim()}
</script>
</body>
</html>
`;

fs.mkdirSync(p('docs'), { recursive: true });
const out = p('docs', 'index.html');
fs.writeFileSync(out, shell, 'utf8');

const st = renderer.stats();
console.log('✓ 构建完成 -> docs/index.html');
console.log(`  学科 ${activeSubjects.length} 个（${activeSubjects.map((s) => s.name).join('、')}）`);
console.log(`  章节 ${allChapters.length} / 小节 ${totalSections} / 卡片 ${totalCards} / 公式 ${totalFormulas}`);
console.log(`  公式渲染：唯一 ${st.unique} 条（命中复用 ${st.hits} 次），字形缓存 ${(st.glyphBytes / 1024).toFixed(0)} KB`);
console.log(`  产物体积 ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
