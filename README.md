# 公式默写 · 考研数学（高等数学）

把原来的单文件《高等数学公式速查手册》改造成**数据驱动、可构建、带学习闭环**的考研备考工具。

**在线使用：<https://xiameisen.github.io/gongshi-moxie/>**（手机、平板打开即可直接默写）

- 产物是**零依赖、可离线的单文件 HTML**（`docs/index.html`，约 2.3 MB），双击即用，无网络、无 CDN、无字体请求。
- 内容与渲染分离：公式以 LaTeX 源码存于 JSON，构建期用 MathJax 渲染成 SVG。
- 在原「查阅」能力之上，新增**默写自测 + 遗忘曲线排程 + 错题本 + 掌握度面板**。

---

## 快速开始

```bash
npm install --cache ./.npm-cache    # 沙箱环境需把 npm 缓存指向工作区内
npm run all                        # 抽取 → 构建 → 校验 → 运行时测试
```

单独执行：

| 命令 | 作用 |
| --- | --- |
| `npm run extract` | `src/original.html` → `content/subjects/calculus.json`（含 788 条 LaTeX 源码）+ `src/base.css` |
| `npm run build` | 内容 JSON + 样式 + 运行时 → `docs/index.html` |
| `npm run verify` | 逐条比对新旧公式 SVG、结构计数、静态检查 |
| `npm run smoke` | 用 jsdom 真实执行页面脚本，跑 31 项学习功能端到端测试 |

> 只需要成品：直接打开 `docs/index.html`。

---

## 在线版

| | |
| --- | --- |
| 网址 | <https://xiameisen.github.io/gongshi-moxie/> |
| 仓库 | <https://github.com/xiameisen/gongshi-moxie> |
| 发布方式 | GitHub Pages，来源为 `main` 分支的 `/docs` 目录 |

手机、平板直接打开网址即可默写；学习记录存在各自浏览器的 localStorage 里，互不影响。

更新线上版本：

```bash
npm run all                              # 重建并跑完两道校验
git add -A && git commit -m "..." && git push
```

> `tools/publish.mjs` 是备用发布通道：当本机到 `github.com:443` 的连接被阻断、
> git 的 smart-HTTP 不可用，但 `api.github.com` 可达时，它用 REST API
> （blob → tree → commit → ref）把工作树推成真实提交，并可顺带开启 Pages。
> 网络正常时直接用 `git push` 即可，不需要它。

---

## 目录结构

```
kaoyan-math/
├─ src/
│  ├─ original.html     原始文件（只读存档，抽取的唯一来源）
│  ├─ base.css          从原始文件提取的样式（原样保留，保证视觉 1:1）
│  ├─ app.css           学习功能扩展样式
│  └─ app.js            运行时：主题/目录/检索/默写/错题本/面板
├─ content/
│  ├─ subjects.json     学科注册表（calculus 已启用；线代、概率已登记为 planned）
│  └─ subjects/
│     └─ calculus.json  高等数学内容源（13 章 / 57 节 / 123 卡 / 788 公式）
├─ tools/
│  ├─ lib/math.mjs      MathJax 渲染封装（按 (display, tex) 去重 + 全局字形缓存）
│  ├─ extract.mjs       抽取器
│  ├─ build.mjs         构建器
│  ├─ verify.mjs        等价性与静态校验
│  └─ smoke.mjs         jsdom 端到端测试
└─ docs/index.html      构建产物（交付物）
```

---

## 内容模型

每张卡片是一个对象，正文用「HTML + 数学定界符」表示：

```json
{
  "id": "s0-1.0",
  "title": "倍角公式",
  "titleHtml": "倍角公式",
  "tag": "三角",
  "kw": "三角函数 倍角 半角 和差化积 积化和差 sin cos tan",
  "tex": ["\\sin 2\\theta = 2\\sin\\theta\\cos\\theta"],
  "html": "<div class=\"formula\">$$\\sin 2\\theta = 2\\sin\\theta\\cos\\theta$$</div>"
}
```

约定：

- `$…$` = 行内公式，`$$…$$` = 块级公式（构建期渲染为 SVG，并在旁边保留隐藏的
  `<span class="latex-src">` 源码 —— 因此可以直接用 `sin`、`frac` 这类符号名检索）。
- `html` 里其余部分就是普通 HTML（`<b>` `<ul>` `<table class="tbl">`
  `<div class="note">` `<div class="tip">` `<div class="rel">`），沿用 `base.css` 的类名即可。
- `kw` 是检索关键词，同时作为**默写时的提示**。
- 章节对象带 `color`（渐变主色）、`num`、`title/desc`、`source`（原笔记页码）。

数据流：

```
src/original.html ──extract──▶ content/subjects/calculus.json
                                      │
              src/base.css + app.css + app.js
                                      ▼
                              build ──▶ docs/index.html
```

---

## 学习功能

| 功能 | 说明 |
| --- | --- |
| **默写自测** | 显示卡片标题与标签、公式部分留白；先在纸上写出，再点「显示答案」自评。支持「提示」按钮给出关联关键词。 |
| **遗忘曲线排程** | 记住了 → 间隔 ×2.4（1 → 2 → 6 → 14 → 34… 上限 180 天）；有点模糊 → 明天再来；忘了 → 今天重来，并在本轮末尾重现（最多 2 次）。 |
| **错题本** | 自评为「忘了」的卡片自动进入，可手动移出，支持一键复习。 |
| **收藏** | 卡片右上角 ☆；面板可按收藏筛选。 |
| **掌握度面板** | 四个标签页：待复习 / 收藏 / 错题 / 掌握度；掌握度按章节给出绿（已记住）/ 橙（模糊）/ 红（忘了）/ 灰（未学）堆叠进度条。 |
| **复习范围** | 今日待复习、未学过、全部、收藏、错题，或按章节（章节标题右侧有「✍️ 默写本章」）。 |
| **快捷键** | `/` 聚焦搜索 · `D` 默写 · `L` 面板 · `空格` 显示答案 · `H` 提示 · `1/2/3` 自评 · `→` 跳过 · `Esc` 关闭。搜索框聚焦时 `D`/`L` 不劫持输入。 |

学习记录保存在浏览器 `localStorage`（键 `kaoyan-math/state/v1`），不上传；面板底部可一键重置。

---

## 如何扩展

### 新增一门学科（以线性代数为例）

1. 准备内容文件 `content/subjects/linear-algebra.json`，结构同 `calculus.json`
   （顶层 `chapters` 数组即可；`meta` 可省略）。
2. **章节 `id` 必须全局唯一**，建议加前缀：`la-ch0`、`la-ch1`…（构建器会校验并报错提醒）。
3. 在 `content/subjects.json` 中把该学科的 `status` 改为 `"active"`。
4. `npm run build`。

一旦有 2 门以上学科，构建器会自动插入学科分节标题（`.subject-head`），目录也会自动按学科分组。
其余功能（默写、错题本、掌握度）无需改动——它们都是从 DOM 的 `data-subject` / `data-ch` / `data-card` 属性读取的。

### 新增或修改公式

直接编辑 `content/subjects/calculus.json`，在对应卡片的 `html` 里写 `$…$` / `$$…$$`，然后 `npm run build`。
不需要手写 SVG，也不需要联网。

> 注意：`npm run extract` 会**覆盖** `content/subjects/calculus.json`。手工增补的内容请另存为新的学科文件，
> 或先把 `src/original.html` 换成你的新来源。

### 关于 `exam-scopes`（考纲映射）

`content/subjects.json` 已为每门学科预留 `examScopes`（数学一 / 二 / 三）。
卡片级考纲标注（要求层级、真题频率）是下一步扩展点，可在卡片对象上增加 `scope` / `level` / `freq` 字段，
构建器与面板都按「字段缺失即忽略」设计，加字段不会破坏现有产物。

---

## 校验

`npm run all` 最后两步是硬门槛：

**等价性校验**（`verify.mjs`）—— 逐条（按文档顺序）比对新旧 788 个公式的 SVG：

```
原文件公式 788 条 / 产物公式 788 条
✓ 全部逐字节一致
✓ 章节 13 / 小节 57 / 卡片 123 / 公式 788 / 表格 9 / 注释 18 / 技巧 11 / 关系图 2
✓ 无外部资源引用（离线可用）
```

**运行时测试**（`smoke.mjs`）—— jsdom 真实执行 `docs/index.html` 的内联脚本，31 项全绿，
覆盖目录生成、检索、主题、默写全流程（遮挡 → 显示 → 自评 → 排程）、错题本、收藏、掌握度面板、
快捷键、持久化与重置。

---

## 已知事项

1. **原文件 11 处 `latex-src` 存在双重转义**（HTML 里写作 `&amp;amp;`，正确 TeX 应为 `&`）。
   抽取器做了收敛还原（`normalizeTex`），因此这 11 个含 `\begin{cases}` / `\begin{vmatrix}` 的公式
   现在渲染正确——在原始文件里它们的隐藏源码其实是有误的。
2. **原始文件并没有真正的函数图象**：附录 A.1「常用函数图象汇总」只是一份文字清单。
   若要补上真正的函数图像（幂/指/对/三角/反三角，以及旋转体、二重积分换序等交互图），
   需要在内容模型里新增图片/绘图字段，属于后续扩展。
3. 产物 2.3 MB 中绝大部分是 MathJax 的 SVG 路径数据（788 个公式 + 共享字形缓存）。
   已做去重：642 条唯一公式，命中复用 146 次。
4. 沙箱环境下 npm 必须带 `--cache ./.npm-cache`，否则默认缓存目录（`%LOCALAPPDATA%\npm-cache`）在工作区之外会被拒绝写入。
