/**
 * 运行时端到端冒烟测试（jsdom，无浏览器依赖）。
 * 真正执行 dist/index.html 里的内联脚本，逐个验证学习功能。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');

const results = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) results.push(['✓', name, '']);
    else results.push(['✗', name, String(r)]);
  } catch (e) {
    results.push(['✗', name, (e && e.message) || String(e)]);
  }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://kaoyan-math.test/',
});
const { window } = dom;
const doc = window.document;

// jsdom 未实现的部分
window.scrollTo = () => {};
window.confirm = () => true;
window.Element.prototype.scrollIntoView = function () {};

const $ = (s, r) => (r || doc).querySelector(s);
const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const key = (k) => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
const state = () => JSON.parse(window.localStorage.getItem('kaoyan-math/state/v1') || '{}');

/* ---------------- 基础渲染 ---------------- */
check('目录生成 13 章', () => $$('#toc .toc-group').length === 13 || `实际 ${$$('#toc .toc-group').length}`);
check('目录生成 57 小节链接', () => $$('#toc .toc-items a').length === 57 || `实际 ${$$('#toc .toc-items a').length}`);
check('123 张卡片完成状态绘制', () => $$('.lv-chip').length === 123 || `实际 ${$$('.lv-chip').length}`);
check('公式 SVG 已内联', () => $$('.card .formula svg').length >= 200 || `实际 ${$$('.card .formula svg').length}`);
check('初始 0 待复习，徽标隐藏', () => $('#dueBadge').classList.contains('zero'));

/* ---------------- 检索 ---------------- */
check('检索「拉格朗日」可过滤卡片', () => {
  const inp = $('#searchInput');
  inp.value = '拉格朗日';
  inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  const hidden = $$('.card.hidden').length;
  const info = $('#searchInfo').textContent;
  return (hidden > 0 && /找到 \d+ 条匹配公式/.test(info)) || `hidden=${hidden} info=${info}`;
});
check('清空检索后恢复全部卡片', () => {
  $('#clearBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return $$('.card.hidden').length === 0 || `仍有 ${$$('.card.hidden').length} 张隐藏`;
});

/* ---------------- 主题 ---------------- */
check('切换深色主题并持久化', () => {
  click($('#themeBtn'));
  const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
  return (dark && state().theme === 'dark') || `theme=${doc.documentElement.getAttribute('data-theme')}`;
});

/* ---------------- 默写自测 ---------------- */
check('点击「默写」打开练习面板', () => {
  click($('#drillBtn'));
  return !$('#drill').hidden || '未打开';
});
check('题目区渲染标题与关键词', () => {
  const q = $('#drillQ').textContent.trim();
  return (q.length > 0 && $('#drillCrumb').textContent.includes('章')) || `q=${JSON.stringify(q)}`;
});
check('答案初始被遮挡（占位提示可见）', () => {
  return ($('#drillAnswer').classList.contains('masked')
    && $('#drillAnswer .drill-placeholder') !== null) || '未遮挡';
});
check('提示按钮显示关联关键词', () => {
  click($('#drillHintBtn'));
  return (!$('#drillHint').hidden && $('#drillHint').textContent.includes('提示')) || '提示未显示';
});
check('「显示答案」后解除遮挡并出现自评', () => {
  click($('#drillShow'));
  return (!$('#drillAnswer').classList.contains('masked')
    && !$('#drillRate').hidden) || '未解除遮挡';
});
check('自评「记住了」写入排程与掌握度', () => {
  const before = $$('.lv-chip[data-lv="2"]').length;
  click($('[data-rate="2"]'));
  const after = $$('.lv-chip[data-lv="2"]').length;
  const st = state();
  const n = Object.keys(st.progress || {}).length;
  return (after > before && n >= 1) || `chip ${before}->${after}, progress=${n}`;
});
check('已记住的卡片下次复习安排在将来', () => {
  const st = state();
  const p = Object.values(st.progress)[0];
  const today = Math.floor(Date.now() / 86400000);
  return (p.lv === 2 && p.due > today) || JSON.stringify(p);
});
check('自评「忘了」进入错题本并本轮重现', () => {
  // 第二题
  click($('#drillShow'));
  click($('[data-rate="0"]'));
  const st = state();
  return Object.keys(st.wrong || {}).length >= 1 || JSON.stringify(Object.keys(st.wrong || {}));
});
check('进度条与计数随答题推进', () => {
  return parseFloat($('#drillBar').style.width) > 0 || `width=${$('#drillBar').style.width}`;
});
check('Esc 关闭默写面板', () => {
  key('Escape');
  return $('#drill').hidden || '未关闭';
});

/* ---------------- 收藏 ---------------- */
check('点击 ☆ 收藏卡片并更新图标', () => {
  const star = $('.ct-btn[data-act="star"]');
  click(star);
  const on = star.classList.contains('on') && star.textContent === '★';
  return (on && Object.keys(state().starred || {}).length === 1) || `on=${on}`;
});

/* ---------------- 学习面板 ---------------- */
check('学习面板打开并渲染 4 个标签页', () => {
  click($('#panelBtn'));
  const tabs = $$('#panelTabs .tab').length;
  return (!$('#panel').hidden && tabs === 4) || `tabs=${tabs}`;
});
check('「待复习」标签列出到期卡片', () => {
  click($('#panelTabs .tab[data-tab="due"]'));
  const n = $$('#panelBody .list-item').length;
  const hasBtns = $$('#panelBody [data-drill]').length > 0;
  return (n >= 1 && hasBtns) || `items=${n} 复习按钮=${hasBtns}`;
});
check('「收藏」标签显示已收藏卡片', () => {
  click($('#panelTabs .tab[data-tab="starred"]'));
  return $$('#panelBody .list-item').length === 1 || `items=${$$('#panelBody .list-item').length}`;
});
check('「错题」标签显示错题并支持移出', () => {
  click($('#panelTabs .tab[data-tab="wrong"]'));
  const n = $$('#panelBody .list-item').length;
  if (n < 1) return `items=${n}`;
  click($('#panelBody [data-unwrong]'));
  return Object.keys(state().wrong || {}).length === 0 || '移出失败';
});
check('「掌握度」标签渲染各章进度条', () => {
  click($('#panelTabs .tab[data-tab="progress"]'));
  const rows = $$('#panelBody .prog-row').length;
  return (rows === 13 && $('#panelBody').textContent.includes('已掌握')) || `rows=${rows}`;
});
check('面板显示累计统计', () => {
  return /默写轮次|累计答题/.test($('#panelBody').textContent) || '无统计';
});
check('Esc 关闭学习面板', () => {
  key('Escape');
  return $('#panel').hidden || '未关闭';
});

/* ---------------- 章节入口 / 快捷键 ---------------- */
check('章节「默写本章」按钮可用', () => {
  click($('.ch-drill'));
  const open = !$('#drill').hidden;
  const total = $('#drillMeta').textContent;
  key('Escape');
  return (open && /\/ \d+/.test(total)) || `open=${open} meta=${total}`;
});
check('快捷键 D 打开默写、L 打开面板', () => {
  $('#searchInput').blur();               // 焦点在搜索框时应让位给输入，故先失焦
  key('d');
  const a = !$('#drill').hidden;
  key('Escape');
  key('l');
  const b = !$('#panel').hidden;
  key('Escape');
  return (a && b) || `drill=${a} panel=${b}`;
});
check('焦点在搜索框时 D/L 不劫持输入', () => {
  $('#searchInput').focus();
  key('d');
  const notOpened = $('#drill').hidden;
  $('#searchInput').blur();
  return notOpened || '搜索框内按键被劫持';
});

/* ---------------- 状态持久化与重置 ---------------- */
check('学习记录写入 localStorage 并可重载', () => {
  const raw = window.localStorage.getItem('kaoyan-math/state/v1');
  if (!raw) return '未写入';
  const st = JSON.parse(raw);
  return (Object.keys(st.progress).length >= 2 && Array.isArray(st.history)) || JSON.stringify(Object.keys(st));
});
check('「重置全部学习记录」清空状态', () => {
  click($('#panelBtn'));
  click($('#resetAll'));
  const st = state();
  const cleared = Object.keys(st.progress).length === 0 && Object.keys(st.starred).length === 0;
  const chips = $$('.lv-chip[data-lv="2"]').length;
  key('Escape');
  return (cleared && chips === 0) || `cleared=${cleared} chips=${chips}`;
});

/* ---------------- 输出 ---------------- */
let bad = 0;
console.log('=== 运行时端到端测试（jsdom 执行真实脚本） ===');
for (const [mark, name, detail] of results) {
  if (mark === '✗') bad++;
  console.log(`  ${mark} ${name}${detail ? '  → ' + detail : ''}`);
}
console.log(`\n  共 ${results.length} 项，通过 ${results.length - bad} 项，失败 ${bad} 项`);
console.log(bad === 0 ? '✅ 运行时测试全部通过' : '❌ 存在失败项');
process.exit(bad === 0 ? 0 : 1);
