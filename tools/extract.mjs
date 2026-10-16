/**
 * 抽取器：src/original.html  ->  content/book.json
 *
 * 思路：原文件的公式全部是 MathJax 预渲染 SVG，且每个公式旁都保留了
 * <span class="latex-src" hidden>原始 TeX</span>。因此可以无损反解：
 *   行内公式 <span class="m">…</span>          ->  $TeX$
 *   块级公式 <div class="formula"><svg/>…</div> ->  $$TeX$$
 * 其余标记（b/ul/li/table/note/tip/rel…）原样保留为 HTML 片段。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.join(ROOT, 'src', 'original.html');
const OUT = process.argv[3] || path.join(ROOT, 'content', 'subjects', 'calculus.json');
const REGISTRY = path.join(ROOT, 'content', 'subjects.json');

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'use', 'path', 'rect',
  'circle', 'line', 'polygon', 'polyline', 'ellipse', 'source', 'area', 'base', 'col',
  'embed', 'param', 'track', 'wbr']);

const ELEMENT = 1, TEXT = 3, COMMENT = 8;

const hasClass = (n, c) => n.nodeType === ELEMENT && n.classList.contains(c);
const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

/**
 * 原文件中有 11 处 latex-src 被双重转义（HTML 源码里写作 &amp;amp;），
 * 解析一次后得到 &amp;，但原 SVG 实际是用 & 渲染的。
 * TeX 源码里不存在合法的 &amp; / &lt; / &gt; / &quot; 字面量，故做一次收敛还原。
 */
function normalizeTex(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/** 取元素内 latex-src 的原始 TeX */
function texOf(el) {
  const s = el.querySelector('.latex-src');
  return s ? normalizeTex(s.textContent.trim()) : null;
}

/** 递归序列化节点，并把数学还原成 $…$ / $$…$$ */
function ser(node, inFormula = false) {
  if (node.nodeType === TEXT) return node.rawText;
  if (node.nodeType === COMMENT) return '';
  if (node.nodeType !== ELEMENT) return '';

  // 行内公式
  if (hasClass(node, 'm')) {
    const t = texOf(node);
    return t === null ? node.outerHTML : '$' + t + '$';
  }

  // 块级公式容器
  if (node.nodeType === ELEMENT && node.classList.contains('formula')) {
    const out = [];
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.nodeType === TEXT) { out.push(k.rawText); continue; }
      if (k.nodeType !== ELEMENT) continue;
      if (k.classList.contains('latex-src')) continue;          // 已随上一个 svg 消费
      if (k.rawTagName === 'svg' || k.rawTagName === 'mjx-container') {
        // 找到紧随其后的 latex-src
        let tex = null;
        for (let j = i + 1; j < kids.length; j++) {
          if (kids[j].nodeType === ELEMENT && kids[j].classList.contains('latex-src')) {
            tex = normalizeTex(kids[j].textContent.trim()); break;
          }
          if (kids[j].nodeType === ELEMENT && !kids[j].classList.contains('latex-src')) break;
        }
        out.push(tex === null ? k.outerHTML : '$$' + tex + '$$');
        continue;
      }
      out.push(ser(k, true));
    }
    // 压缩多余空白，保留结构化换行
    return '<div class="formula">' + out.join('').replace(/\s*\n\s*/g, '\n').trim() + '</div>';
  }

  // 普通元素：逐属性原样还原
  const tag = node.rawTagName;
  let attrs = '';
  for (const [k, v] of Object.entries(node.rawAttributes || {})) {
    attrs += v === '' || v === undefined ? ` ${k}` : ` ${k}="${v}"`;
  }
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  const inner = node.childNodes.map((c) => ser(c, inFormula)).join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

const html = fs.readFileSync(SRC, 'utf8');
const doc = parse(html, { comment: true });

// ---------- 章节 ----------
const chapters = [];
let cardSeq = 0, formulaCount = 0;

for (const ch of doc.querySelectorAll('section.chapter')) {
  const head = ch.querySelector('.ch-head');
  const style = ch.getAttribute('style') || '';
  const c1 = (style.match(/--c1:\s*([^;]+)/) || [])[1]?.trim() || null;
  const c2 = (style.match(/--c2:\s*([^;]+)/) || [])[1]?.trim() || null;

  const chapter = {
    id: ch.getAttribute('id') || `ch${chapters.length}`,
    num: text(head?.querySelector('.num')),
    titleHtml: '',
    descHtml: '',
    source: text(ch.querySelector('.ch-src')),
    color: c1 ? { c1, c2 } : null,
    sections: [],
  };
  const h2 = head?.querySelector('h2');
  chapter.title = text(h2);
  chapter.titleHtml = h2 ? h2.childNodes.map((c) => ser(c)).join('').trim() : chapter.title;
  const descEl = head?.querySelector('.desc');
  chapter.desc = text(descEl);
  chapter.descHtml = descEl ? descEl.childNodes.map((c) => ser(c)).join('').trim() : '';

  for (const sec of ch.querySelectorAll('.sec')) {
    const h3 = sec.querySelector('h3');
    const enEl = h3?.querySelector('.en');
    const en = text(enEl);
    let head3 = h3 ? h3.childNodes.map((c) => ser(c)).join('') : '';
    if (enEl) head3 = head3.replace(enEl.outerHTML, '');
    head3 = head3.replace(/\s+/g, ' ').trim();
    const m = head3.match(/^([\dA-Za-z.]+)\s*(.*)$/);
    const section = {
      id: sec.getAttribute('id') || '',
      num: m ? m[1] : '',
      title: m ? m[2] : head3,
      en,
      cards: [],
    };

    for (const card of sec.querySelectorAll('.card')) {
      const ct = card.querySelector('.ct');
      const tagEl = ct?.querySelector('.tag');
      const tag = text(tagEl);
      let titleHtml = '';
      if (ct) {
        const parts = ct.childNodes.filter((c) => !(c.nodeType === ELEMENT && c.classList.contains('tag')));
        titleHtml = parts.map((c) => ser(c)).join('').replace(/\s+/g, ' ').trim();
      }
      // 标题纯文本：数学换成 TeX 源，保持与原 textContent 检索行为一致
      const titlePlain = titleHtml.replace(/\$\$?([\s\S]*?)\$\$?/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      const kids = card.childNodes.filter((c) => !(c.nodeType === ELEMENT && c.classList.contains('ct')));
      const bodyHtml = kids.map((c) => ser(c)).join('').trim();

      const texAll = [...card.querySelectorAll('.latex-src')].map((s) => normalizeTex(s.textContent.trim()));
      formulaCount += texAll.length;

      section.cards.push({
        id: `${section.id}.${section.cards.length}`,
        title: titlePlain,
        titleHtml,
        tag,
        kw: card.getAttribute('data-kw') || '',
        tex: texAll,
        html: bodyHtml,
      });
      cardSeq++;
    }
    chapter.sections.push(section);
  }
  chapters.push(chapter);
}

// ---------- hero / 页脚等元信息 ----------
const hero = doc.querySelector('.hero');
const meta = {
  title: doc.querySelector('title')?.textContent.trim() || '高等数学公式速查手册',
  brand: text(doc.querySelector('.brand')),
  heroTitle: text(hero?.querySelector('h1')),
  heroDesc: text(hero?.querySelector('p')),
  stats: [...(hero?.querySelectorAll('.stat') || [])].map((s) => ({
    value: text(s.querySelector('b')), label: text(s.querySelector('span')),
  })),
  usage: [...(doc.querySelectorAll('.usage span, .usage li') || [])].map((s) => text(s)).filter(Boolean),
  footer: text(doc.querySelector('.footer')),
  css: doc.querySelector('style')?.textContent || '',
};

const book = {
  schema: 1,
  generatedFrom: path.basename(SRC),
  subject: 'calculus',
  subjectName: '高等数学',
  examScopes: [],
  meta,
  chapters,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(book, null, 1), 'utf8');

// 原样式单独落盘，供构建期作为基底 CSS（保持视觉 1:1）
const cssOut = path.join(ROOT, 'src', 'base.css');
fs.mkdirSync(path.dirname(cssOut), { recursive: true });
fs.writeFileSync(cssOut, meta.css.replace(/\r\n/g, '\n').trim() + '\n', 'utf8');

// 学科注册表：新增线性代数 / 概率论与数理统计时在此登记即可
const subjects = [
  {
    id: 'calculus',
    name: '高等数学',
    examScopes: ['数学一', '数学二', '数学三'],
    file: 'content/subjects/calculus.json',
    status: 'active',
    note: '已收录：预备知识 → 单变量微积分 → 微分方程 → 多元微积分 → 空间解析几何 → 无穷级数',
  },
  {
    id: 'linear-algebra',
    name: '线性代数',
    examScopes: ['数学一', '数学二', '数学三'],
    file: 'content/subjects/linear-algebra.json',
    status: 'planned',
    note: '规划中：行列式 / 矩阵 / 向量组 / 线性方程组 / 特征值与特征向量 / 二次型',
  },
  {
    id: 'probability',
    name: '概率论与数理统计',
    examScopes: ['数学一', '数学三'],
    file: 'content/subjects/probability.json',
    status: 'planned',
    note: '规划中：随机事件与概率 / 一维与多维随机变量 / 数字特征 / 大数定律与中心极限定理 / 数理统计',
  },
];
fs.writeFileSync(REGISTRY, JSON.stringify({ schema: 1, subjects }, null, 1), 'utf8');

const secCount = chapters.reduce((a, c) => a + c.sections.length, 0);
const cardCount = chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.cards.length, 0), 0);
console.log(`✓ 抽取完成 -> ${path.relative(ROOT, OUT)}`);
console.log(`  章节 ${chapters.length} / 小节 ${secCount} / 卡片 ${cardCount} / 公式 ${formulaCount}`);
console.log(`  CSS ${meta.css.length} 字符；JSON ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
