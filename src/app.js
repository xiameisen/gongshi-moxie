/* ============================================================
   考研数学 · 高等数学 速查与默写
   运行时：主题 / 目录 / 检索（与原版一致）
          + 默写自测（遗忘曲线排程）/ 收藏 / 错题本 / 掌握度面板
   无任何外部依赖，所有状态存于 localStorage。
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 工具 ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DAY = 86400000;
  var today = function () { return Math.floor(Date.now() / DAY); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ESC[c]; }); };
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 状态 ---------------- */
  var KEY = 'kaoyan-math/state/v1';
  var S = { theme: null, progress: {}, starred: {}, wrong: {}, history: [] };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        S.theme = o.theme || null;
        S.progress = o.progress || {};
        S.starred = o.starred || {};
        S.wrong = o.wrong || {};
        S.history = o.history || [];
      }
    }
  } catch (e) { /* 忽略：隐私模式下 localStorage 不可用 */ }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------------- 数据索引（从 DOM 读取，无需重复内嵌） ---------------- */
  var cards = $$('.card').map(function (el) {
    return {
      id: el.getAttribute('data-card'),
      ch: el.getAttribute('data-ch'),
      sec: el.getAttribute('data-sec'),
      title: el.getAttribute('data-title') || '',
      tag: el.getAttribute('data-tag') || '',
      kw: el.getAttribute('data-kw') || '',
      el: el
    };
  });
  var byId = {};
  cards.forEach(function (c) { byId[c.id] = c; });

  var chapters = $$('section.chapter').map(function (el) {
    var h2 = el.querySelector('h2');
    return {
      id: el.id,
      num: ($('.num', el) || {}).textContent ? $('.num', el).textContent.trim() : '',
      title: h2 ? h2.textContent.trim() : '',
      el: el
    };
  });
  var chById = {};
  chapters.forEach(function (c) { chById[c.id] = c; });

  /* ---------------- 排程（简化的间隔重复） ---------------- */
  function dueList() {
    var t = today();
    return cards.filter(function (c) { return S.progress[c.id] && S.progress[c.id].due <= t; })
      .sort(function (a, b) { return S.progress[a.id].due - S.progress[b.id].due; });
  }
  function newList() { return cards.filter(function (c) { return !S.progress[c.id]; }); }
  function starredList() { return cards.filter(function (c) { return S.starred[c.id]; }); }
  function wrongList() { return cards.filter(function (c) { return S.wrong[c.id]; }); }

  function rate(card, lv) {
    var p = S.progress[card.id] || { lv: -1, iv: 0, n: 0, due: today(), wrong: 0 };
    p.n++;
    p.last = today();
    if (lv === 0) {
      p.lv = 0; p.iv = 0; p.due = today(); p.wrong = (p.wrong || 0) + 1;
      var w = S.wrong[card.id] || { n: 0 };
      w.n++; w.last = today();
      S.wrong[card.id] = w;
    } else if (lv === 1) {
      p.lv = 1; p.iv = 1; p.due = today() + 1;
    } else {
      p.lv = 2;
      p.iv = p.iv ? Math.min(180, Math.round(p.iv * 2.4)) : 1;
      p.due = today() + p.iv;
    }
    S.progress[card.id] = p;
    save();
    paintCard(card);
    refreshCounts();
  }

  /* ---------------- 卡片视觉状态 ---------------- */
  function paintCard(card) {
    var chip = $('.lv-chip', card.el);
    if (chip) {
      var p = S.progress[card.id];
      chip.setAttribute('data-lv', p ? String(p.lv) : '0');
      if (p) { chip.setAttribute('data-seen', '1'); } else { chip.removeAttribute('data-seen'); }
      chip.title = !p ? '掌握度：未学习'
        : (p.lv === 2 ? '已记住 · 下次复习 ' + fmtDay(p.due)
          : p.lv === 1 ? '有点模糊 · 下次复习 ' + fmtDay(p.due)
            : '忘了 · 待复习');
    }
    var star = $('.ct-btn[data-act="star"]', card.el);
    if (star) {
      var on = !!S.starred[card.id];
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
    }
  }
  function paintAll() { cards.forEach(paintCard); refreshCounts(); }

  function fmtDay(day) {
    if (day == null) return '—';
    var d = day - today();
    if (d <= 0) return '今天';
    if (d === 1) return '明天';
    if (d < 30) return d + ' 天后';
    return Math.round(d / 30) + ' 个月后';
  }

  function refreshCounts() {
    var due = dueList().length;
    var badge = $('#dueBadge');
    if (badge) {
      badge.textContent = due > 99 ? '99+' : String(due);
      badge.classList.toggle('zero', due === 0);
    }
    var learned = cards.filter(function (c) { return S.progress[c.id] && S.progress[c.id].lv === 2; }).length;
    var hl = $('#heroLearned');
    if (hl) hl.textContent = String(learned);
    ['#tabDue', '#tabStar', '#tabWrong'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      el.textContent = sel === '#tabDue' ? String(due)
        : sel === '#tabStar' ? String(starredList().length)
          : String(wrongList().length);
    });
  }

  /* ---------------- 主题 ---------------- */
  var themeBtn = $('#themeBtn');
  if (S.theme) document.documentElement.setAttribute('data-theme', S.theme);
  function syncIcon() {
    themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  }
  syncIcon();
  themeBtn.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    S.theme = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', S.theme);
    save(); syncIcon();
  });

  /* ---------------- 目录 ---------------- */
  var toc = $('#toc');
  var multiSubject = $$('.subject-block').length > 1;
  var lastSubject = null;
  chapters.forEach(function (ch) {
    if (multiSubject) {
      var block = ch.el.closest ? ch.el.closest('.subject-block') : null;
      var sid = block ? block.getAttribute('data-subject') : null;
      if (sid && sid !== lastSubject) {
        lastSubject = sid;
        var nm = block.querySelector('.sh-name');
        var sh = document.createElement('div');
        sh.className = 'toc-subject';
        sh.textContent = nm ? nm.textContent : sid;
        toc.appendChild(sh);
      }
    }
    var head = $('.ch-head', ch.el);
    var color = getComputedStyle(head).getPropertyValue('--c1').trim() || '#4f46e5';
    var items = $$('.sec', ch.el).map(function (s) {
      var h = s.querySelector('h3');
      return '<a href="#' + s.id + '">' + esc(h ? h.textContent.replace(/\s+/g, ' ').trim() : s.id) + '</a>';
    }).join('');
    var group = document.createElement('div');
    group.className = 'toc-group open';
    group.innerHTML = '<div class="toc-ch"><span class="dot" style="background:' + color + '"></span>'
      + '<span>' + esc(ch.num + ' · ' + ch.title) + '</span><span class="arrow">▶</span></div>'
      + '<div class="toc-items">' + items + '</div>';
    toc.appendChild(group);
  });
  $$('.toc-ch').forEach(function (el) {
    el.addEventListener('click', function () { el.parentElement.classList.toggle('open'); });
  });

  /* ---------------- 检索（沿用原版行为：data-kw + 全文，含隐藏的 LaTeX 源） ---------------- */
  var input = $('#searchInput');
  var clearBtn = $('#clearBtn');
  var info = $('#searchInfo');
  var noResult = $('#noResult');
  var kbd = $('.searchbox kbd');

  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) {
      cards.forEach(function (c) { c.el.classList.remove('hidden'); });
      $$('.sec').forEach(function (s) { s.classList.remove('hidden'); });
      chapters.forEach(function (c) { c.el.classList.remove('hidden'); });
      info.classList.remove('show'); noResult.classList.remove('show');
      clearBtn.style.display = 'none'; kbd.style.display = '';
      return;
    }
    clearBtn.style.display = 'grid'; kbd.style.display = 'none';
    var count = 0;
    cards.forEach(function (c) {
      var hay = (c.kw + ' ' + c.el.textContent).toLowerCase();
      var hit = hay.indexOf(q) !== -1;
      c.el.classList.toggle('hidden', !hit);
      if (hit) count++;
    });
    $$('.sec').forEach(function (s) {
      s.classList.toggle('hidden', s.querySelectorAll('.card:not(.hidden)').length === 0);
    });
    var visCh = 0;
    chapters.forEach(function (c) {
      var vis = c.el.querySelectorAll('.sec:not(.hidden)').length > 0;
      c.el.classList.toggle('hidden', !vis);
      if (vis) visCh++;
    });
    info.textContent = '找到 ' + count + ' 条匹配公式，分布在 ' + visCh + ' 个章节';
    info.classList.add('show');
    noResult.classList.toggle('show', count === 0);
  }
  input.addEventListener('input', function () { search(input.value); });
  clearBtn.addEventListener('click', function () { input.value = ''; search(''); input.focus(); });

  /* ---------------- 滚动高亮 / 返回顶部 / 移动端 ---------------- */
  var links = $$('.toc-items a');
  var backTop = $('#backTop');
  window.addEventListener('scroll', function () {
    backTop.classList.toggle('show', window.scrollY > 600);
    var current = '';
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el && el.getBoundingClientRect().top < 120) current = a.getAttribute('href').slice(1);
    });
    links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href').slice(1) === current); });
  }, { passive: true });
  backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#menuBtn').addEventListener('click', function () { $('#sidebar').classList.toggle('open'); });
  $$('.toc-items a').forEach(function (a) {
    a.addEventListener('click', function () { $('#sidebar').classList.remove('open'); });
  });

  /* ---------------- 收藏 ---------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.ct-btn[data-act="star"]') : null;
    if (btn) {
      var cardEl = btn.closest('.card');
      var c = byId[cardEl.getAttribute('data-card')];
      if (!c) return;
      if (S.starred[c.id]) delete S.starred[c.id]; else S.starred[c.id] = { at: today() };
      save(); paintCard(c); refreshCounts();
      if (drill.open && drill.cur && drill.cur.id === c.id) syncDrillStar();
      return;
    }
    var chBtn = e.target.closest ? e.target.closest('.ch-drill') : null;
    if (chBtn) { openDrill('ch:' + chBtn.getAttribute('data-ch')); }
  });

  /* ============================================================
     默写自测
     ============================================================ */
  var CAP = { due: 30, new: 20, all: 20, starred: 20, wrong: 20 };

  var drill = {
    open: false, queue: [], idx: 0, cur: null, revealed: false,
    scope: 'due', repeats: {}, session: null, answered: 0
  };

  var drillEl = document.createElement('div');
  drillEl.className = 'overlay';
  drillEl.id = 'drill';
  drillEl.hidden = true;
  drillEl.innerHTML = [
    '<div class="box">',
    '  <div class="box-head">',
    '    <span class="box-title">✍️ 默写自测</span>',
    '    <select class="scope-select" id="drillScope"></select>',
    '    <span class="drill-progress"><i id="drillBar"></i></span>',
    '    <span class="muted" id="drillMeta"></span>',
    '    <span class="spacer"></span>',
    '    <button class="close-btn" id="drillClose" title="关闭（Esc）">✕</button>',
    '  </div>',
    '  <div class="box-body" id="drillBody">',
    '    <div id="drillQuiz">',
    '      <div class="drill-crumb" id="drillCrumb"></div>',
    '      <div class="drill-q" id="drillQ"></div>',
    '      <div class="drill-tags" id="drillTags"></div>',
    '      <div class="drill-hint" id="drillHint" hidden></div>',
    '      <div class="drill-answer masked" id="drillAnswer"></div>',
    '    </div>',
    '  </div>',
    '  <div class="box-foot">',
    '    <div class="drill-actions" id="drillActions">',
    '      <button class="btn primary" id="drillShow">显示答案 <kbd>空格</kbd></button>',
    '      <button class="btn" id="drillHintBtn">提示 <kbd>H</kbd></button>',
    '      <button class="btn" id="drillStar">☆ 收藏</button>',
    '      <button class="btn" id="drillSkip">跳过 <kbd>→</kbd></button>',
    '    </div>',
    '    <div class="drill-rate" id="drillRate" hidden>',
    '      <span class="drill-rate-label">这张记得怎么样？</span>',
    '      <button class="btn ok" data-rate="2">✅ 记住了 <kbd>1</kbd></button>',
    '      <button class="btn mid" data-rate="1">🤔 有点模糊 <kbd>2</kbd></button>',
    '      <button class="btn bad" data-rate="0">❌ 忘了 <kbd>3</kbd></button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(drillEl);

  var dScope = $('#drillScope'), dBar = $('#drillBar'), dMeta = $('#drillMeta');
  var dCrumb = $('#drillCrumb'), dQ = $('#drillQ'), dTags = $('#drillTags');
  var dHint = $('#drillHint'), dAnswer = $('#drillAnswer');
  var dActions = $('#drillActions'), dRate = $('#drillRate'), dBody = $('#drillBody');

  function scopeOptionsHtml() {
    return [
      '<option value="due">今日待复习（' + dueList().length + '）</option>',
      '<option value="new">未学过（' + newList().length + '）</option>',
      '<option value="all">全部卡片（' + cards.length + '）</option>',
      '<option value="starred">收藏（' + starredList().length + '）</option>',
      '<option value="wrong">错题（' + wrongList().length + '）</option>',
    ].concat(chapters.map(function (c) {
      var n = cards.filter(function (x) { return x.ch === c.id; }).length;
      return '<option value="ch:' + esc(c.id) + '">' + esc(c.num + ' ' + c.title) + '（' + n + '）</option>';
    })).join('');
  }

  function buildQueue(scope) {
    var list;
    if (scope === 'new') list = newList();
    else if (scope === 'all') list = cards.slice();
    else if (scope === 'starred') list = starredList();
    else if (scope === 'wrong') list = wrongList();
    else if (scope.indexOf('ch:') === 0) {
      var ch = scope.slice(3);
      list = cards.filter(function (c) { return c.ch === ch; });
    } else list = dueList();

    var ordered = (scope === 'due' || scope.indexOf('ch:') === 0) ? list.slice() : shuffle(list);
    var cap = scope.indexOf('ch:') === 0 ? 999 : (CAP[scope] || 20);
    return { queue: ordered.slice(0, cap), total: ordered.length };
  }

  function openDrill(scope) {
    if (!dScope.options.length) dScope.innerHTML = scopeOptionsHtml();
    if (scope) dScope.value = scope;
    else if (!dScope.value) dScope.value = 'due';
    startRound(dScope.value);
    drillEl.hidden = false;
    drill.open = true;
  }

  function startRound(scope) {
    var b = buildQueue(scope);
    drill.scope = scope;
    drill.queue = b.queue;
    drill.idx = 0;
    drill.cur = null;
    drill.repeats = {};
    drill.answered = 0;
    drill.poolTotal = b.total;
    drill.session = { total: b.queue.length, ok: 0, mid: 0, bad: 0 };
    $('#drillQuiz').hidden = false;
    dActions.hidden = false;
    dRate.hidden = true;
    if (!drill.queue.length) { showEmpty(); return; }
    nextCard();
  }

  function showEmpty() {
    var hint = drill.scope === 'due'
      ? '今天没有需要复习的卡片。可以去「未学过」开始新的一轮，或直接浏览全书。'
      : drill.scope === 'starred' ? '还没有收藏任何卡片。在卡片右上角点 ☆ 即可收藏。'
        : drill.scope === 'wrong' ? '错题本是空的——保持住！自评为「忘了」的卡片会自动进来。'
          : '这个范围暂时没有卡片。';
    $('#drillQuiz').innerHTML = '<div class="empty">' + esc(hint) + '</div>';
    dActions.hidden = true;
    dRate.hidden = true;
    dMeta.textContent = '0 / 0';
    dBar.style.width = '0%';
  }

  function answerHtml(card) {
    return $$(':scope > *', card.el).filter(function (n) {
      return !n.classList.contains('ct');
    }).map(function (n) { return n.outerHTML; }).join('');
  }

  function nextCard() {
    if (drill.idx >= drill.queue.length) { finishRound(); return; }
    drill.cur = drill.queue[drill.idx++];
    drill.revealed = false;

    var card = drill.cur;
    var ch = chById[card.ch] || { num: '', title: '' };
    var secEl = document.getElementById(card.sec);
    var secTitle = secEl ? (secEl.querySelector('h3') || {}).textContent || '' : '';
    dCrumb.textContent = ch.num + ' ' + ch.title + ' · ' + secTitle.replace(/\s+/g, ' ').trim();

    var t = $('.ct-t', card.el);
    dQ.innerHTML = t ? t.innerHTML : esc(card.title);
    var kws = card.kw.split(/\s+/).filter(Boolean).slice(0, 6);
    dTags.innerHTML = (card.tag ? '<span>' + esc(card.tag) + '</span>' : '')
      + (kws.length ? '<span>关键词 ' + kws.length + ' 个</span>' : '');

    dHint.hidden = true;
    dHint.innerHTML = '<b>提示（关联关键词）：</b>' + esc(card.kw || '（无）');
    dAnswer.classList.add('masked');
    dAnswer.innerHTML = '<div class="drill-placeholder"><div style="font-size:24px">✍️</div>'
      + '<div>先在纸上写出公式，再点「显示答案」</div>'
      + '<div class="muted">（按空格显示，按 H 看关键词提示）</div></div>'
      + answerHtml(card);

    dActions.hidden = false;
    dRate.hidden = true;
    $('#drillShow').hidden = false;
    syncDrillStar();
    updateBar();
  }

  function syncDrillStar() {
    var b = $('#drillStar');
    if (!b || !drill.cur) return;
    var on = !!S.starred[drill.cur.id];
    b.textContent = on ? '★ 已收藏' : '☆ 收藏';
  }

  function updateBar() {
    var done = Math.max(0, drill.idx - 1);
    var total = drill.queue.length;
    dBar.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    dMeta.textContent = done + ' / ' + total + (drill.poolTotal > total ? '（共 ' + drill.poolTotal + '）' : '');
  }

  function reveal() {
    if (drill.revealed || !drill.cur) return;
    drill.revealed = true;
    dAnswer.classList.remove('masked');
    dRate.hidden = false;
    $('#drillShow').hidden = true;
  }

  function answer(lv) {
    if (!drill.cur) return;
    if (!drill.revealed) { reveal(); return; }
    var card = drill.cur;
    rate(card, lv);
    if (lv === 2) drill.session.ok++;
    else if (lv === 1) drill.session.mid++;
    else drill.session.bad++;
    drill.answered++;

    if (lv === 0) {
      var n = drill.repeats[card.id] || 0;
      if (n < 2) { drill.repeats[card.id] = n + 1; drill.queue.push(card); }
    }
    nextCard();
  }

  function finishRound() {
    var s = drill.session;
    var score = s.total ? Math.round(((s.ok + s.mid * 0.5) / s.total) * 100) : 0;
    S.history.push({ t: today(), scope: drill.scope, total: s.total, ok: s.ok, mid: s.mid, bad: s.bad });
    if (S.history.length > 60) S.history = S.history.slice(-60);
    save();

    dActions.hidden = true;
    dRate.hidden = true;
    $('#drillQuiz').hidden = false;
    dCrumb.textContent = '';
    dQ.textContent = '';
    dTags.innerHTML = '';
    dHint.hidden = true;
    dAnswer.classList.remove('masked');
    dAnswer.innerHTML = '';
    $('#drillQuiz').innerHTML = '<div class="drill-summary">'
      + '<h3>本轮完成 🎉</h3>'
      + '<div class="big">' + score + '<span style="font-size:16px"> 分</span></div>'
      + '<div class="grid">'
      + '<div><b>' + s.total + '</b>本轮卡片</div>'
      + '<div><b>' + s.ok + '</b>记住了</div>'
      + '<div><b>' + s.mid + '</b>有点模糊</div>'
      + '<div><b>' + s.bad + '</b>忘了</div>'
      + '<div><b>' + dueList().length + '</b>待复习</div>'
      + '</div>'
      + '<p class="muted" style="margin-top:14px">记住了的卡片会按间隔重复（1 → 2 → 6 → 14 天…）再次出现；忘了的卡片进入错题本，并已在本轮重现。</p>'
      + '</div>';
    dMeta.textContent = '完成';
    dBar.style.width = '100%';
    refreshCounts();
  }

  function closeDrill() {
    drillEl.hidden = true;
    drill.open = false;
    drill.cur = null;
    refreshCounts();
  }

  $('#drillClose').addEventListener('click', closeDrill);
  drillEl.addEventListener('click', function (e) { if (e.target === drillEl) closeDrill(); });
  dScope.addEventListener('change', function () { startRound(dScope.value); });
  $('#drillShow').addEventListener('click', reveal);
  $('#drillHintBtn').addEventListener('click', function () { dHint.hidden = !dHint.hidden; });
  $('#drillStar').addEventListener('click', function () {
    if (!drill.cur) return;
    var id = drill.cur.id;
    if (S.starred[id]) delete S.starred[id]; else S.starred[id] = { at: today() };
    save(); paintCard(drill.cur); syncDrillStar(); refreshCounts();
  });
  $('#drillSkip').addEventListener('click', function () { if (drill.cur) nextCard(); });
  dRate.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rate]');
    if (b) answer(parseInt(b.getAttribute('data-rate'), 10));
  });

  /* ============================================================
     学习面板：待复习 / 收藏 / 错题 / 掌握度
     ============================================================ */
  var panelEl = document.createElement('div');
  panelEl.className = 'overlay';
  panelEl.id = 'panel';
  panelEl.hidden = true;
  panelEl.innerHTML = [
    '<div class="box">',
    '  <div class="box-head">',
    '    <span class="box-title">📚 学习面板</span>',
    '    <div class="tabs" id="panelTabs">',
    '      <button class="tab active" data-tab="due">待复习 <b id="tabDue">0</b></button>',
    '      <button class="tab" data-tab="starred">收藏 <b id="tabStar">0</b></button>',
    '      <button class="tab" data-tab="wrong">错题 <b id="tabWrong">0</b></button>',
    '      <button class="tab" data-tab="progress">掌握度</button>',
    '    </div>',
    '    <span class="spacer"></span>',
    '    <button class="close-btn" id="panelClose" title="关闭（Esc）">✕</button>',
    '  </div>',
    '  <div class="box-body" id="panelBody"></div>',
    '  <div class="box-foot">',
    '    <button class="btn" id="resetAll">重置全部学习记录</button>',
    '    <span class="muted" id="panelStat"></span>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(panelEl);

  var pBody = $('#panelBody'), pStat = $('#panelStat');
  var panelTab = 'due';

  function liItem(c, meta, actions) {
    var ch = chById[c.ch] || { num: '', title: '' };
    return '<div class="list-item" data-open="' + esc(c.id) + '">'
      + '<span class="lv-chip" data-lv="' + (S.progress[c.id] ? S.progress[c.id].lv : 0) + '"'
      + (S.progress[c.id] ? ' data-seen="1"' : '') + '></span>'
      + '<div class="li-main"><div class="li-title">' + esc(c.title) + '</div>'
      + '<div class="li-meta">' + esc(ch.num + ' ' + ch.title) + (c.tag ? ' · ' + esc(c.tag) : '')
      + (meta ? ' · ' + esc(meta) : '') + '</div></div>'
      + (actions || '<button class="btn mini" data-go="' + esc(c.id) + '">定位</button>')
      + '</div>';
  }

  function renderPanel() {
    var html = '';
    if (panelTab === 'due') {
      var due = dueList();
      html = due.length ? '<div class="list">' + due.map(function (c) {
        var p = S.progress[c.id];
        return liItem(c, '上次 ' + fmtDay(p.last) + ' · ' + (p.lv === 2 ? '已记住' : p.lv === 1 ? '模糊' : '忘了'),
          '<button class="btn mini primary" data-drill="' + esc(c.id) + '">复习</button>');
      }).join('') + '</div>'
        : '<div class="empty">今天没有待复习的卡片 🎉<br>去「默写自测 → 未学过」开始新一轮吧。</div>';
    } else if (panelTab === 'starred') {
      var st = starredList();
      html = st.length ? '<div class="list">' + st.map(function (c) { return liItem(c, '收藏于 ' + fmtDay(S.starred[c.id].at)); }).join('') + '</div>'
        : '<div class="empty">还没有收藏的卡片。卡片右上角点 ☆ 即可收藏。</div>';
    } else if (panelTab === 'wrong') {
      var wr = wrongList();
      html = wr.length ? '<div class="list">' + wr.map(function (c) {
        return liItem(c, '错 ' + S.wrong[c.id].n + ' 次',
          '<button class="btn mini primary" data-drill="' + esc(c.id) + '">复习</button>'
          + '<button class="btn mini" data-unwrong="' + esc(c.id) + '">移出</button>');
      }).join('') + '</div>'
        : '<div class="empty">错题本是空的——保持住！自评为「忘了」的卡片会自动进来。</div>';
    } else {
      var learned = 0, mid = 0, bad = 0, untouched = 0;
      cards.forEach(function (c) {
        var p = S.progress[c.id];
        if (!p) untouched++;
        else if (p.lv === 2) learned++;
        else if (p.lv === 1) mid++;
        else bad++;
      });
      var mins = S.history.reduce(function (a, h) { return a + h.total; }, 0);
      html = '<div class="summary-cards">'
        + '<div><b>' + learned + '</b><span>已记住</span></div>'
        + '<div><b>' + mid + '</b><span>有点模糊</span></div>'
        + '<div><b>' + bad + '</b><span>忘了</span></div>'
        + '<div><b>' + untouched + '</b><span>未学习</span></div>'
        + '<div><b>' + S.history.length + '</b><span>默写轮次</span></div>'
        + '<div><b>' + mins + '</b><span>累计答题</span></div>'
        + '</div>';
      var total = cards.length || 1;
      html += chapters.map(function (ch) {
        var cs = cards.filter(function (c) { return c.ch === ch.id; });
        var n = cs.length || 1;
        var a = 0, b = 0, d = 0;
        cs.forEach(function (c) {
          var p = S.progress[c.id];
          if (!p) return;
          if (p.lv === 2) a++; else if (p.lv === 1) b++; else d++;
        });
        return '<div class="prog-row"><div class="prog-name" title="' + esc(ch.title) + '">'
          + esc(ch.num + ' ' + ch.title) + '</div>'
          + '<div class="prog-bar">'
          + '<i class="done" style="width:' + (a / n * 100) + '%"></i>'
          + '<i class="mid" style="width:' + (b / n * 100) + '%"></i>'
          + '<i class="bad" style="width:' + (d / n * 100) + '%"></i>'
          + '</div><div class="prog-num">' + a + '/' + cs.length + ' 已掌握</div></div>';
      }).join('');
      html += '<p class="muted" style="margin-top:14px">全书已掌握 ' + learned + ' / ' + total
        + ' 张（' + Math.round(learned / total * 100) + '%）。绿色=已记住，橙色=模糊，红色=忘了，灰色=未学。</p>';
    }
    pBody.innerHTML = html;
    pStat.textContent = '数据保存在本机浏览器（localStorage），不会上传。';
    refreshCounts();
  }

  function openPanel(tab) {
    if (tab) panelTab = tab;
    $$('#panelTabs .tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === panelTab); });
    renderPanel();
    panelEl.hidden = false;
  }
  function closePanel() { panelEl.hidden = true; }

  $('#panelClose').addEventListener('click', closePanel);
  panelEl.addEventListener('click', function (e) { if (e.target === panelEl) closePanel(); });
  $('#panelTabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab');
    if (!t) return;
    panelTab = t.getAttribute('data-tab');
    $$('#panelTabs .tab').forEach(function (x) { x.classList.toggle('active', x === t); });
    renderPanel();
  });

  pBody.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) {
      var c = byId[go.getAttribute('data-go')];
      closePanel();
      if (c) {
        c.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        c.el.style.transition = 'box-shadow .3s';
        c.el.style.boxShadow = '0 0 0 3px var(--primary)';
        setTimeout(function () { c.el.style.boxShadow = ''; }, 1600);
      }
      return;
    }
    var d = e.target.closest('[data-drill]');
    if (d) {
      var card = byId[d.getAttribute('data-drill')];
      closePanel();
      if (card) openDrillWith([card]);
      return;
    }
    var uw = e.target.closest('[data-unwrong]');
    if (uw) {
      delete S.wrong[uw.getAttribute('data-unwrong')];
      save(); renderPanel();
      return;
    }
  });

  $('#resetAll').addEventListener('click', function () {
    if (!window.confirm('确定清空全部学习记录（掌握度、收藏、错题、统计）吗？此操作不可撤销。')) return;
    S.progress = {}; S.starred = {}; S.wrong = {}; S.history = [];
    save(); paintAll(); renderPanel();
  });

  /* 单卡复习：临时队列 */
  function openDrillWith(list) {
    drillEl.hidden = false;
    drill.open = true;
    if (!dScope.options.length) dScope.innerHTML = scopeOptionsHtml();
    drill.scope = 'single';
    drill.queue = list.slice();
    drill.idx = 0;
    drill.cur = null;
    drill.repeats = {};
    drill.answered = 0;
    drill.poolTotal = drill.queue.length;
    drill.session = { total: drill.queue.length, ok: 0, mid: 0, bad: 0 };
    $('#drillQuiz').hidden = false;
    dActions.hidden = false;
    dRate.hidden = true;
    nextCard();
  }

  /* ---------------- 顶栏入口 ---------------- */
  $('#drillBtn').addEventListener('click', function () {
    dScope.innerHTML = scopeOptionsHtml();
    openDrill(dueList().length ? 'due' : 'new');
  });
  $('#panelBtn').addEventListener('click', function () { openPanel('due'); });

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', function (e) {
    var inInput = document.activeElement === input;
    if (e.key === '/' && !inInput && !drill.open && panelEl.hidden) { e.preventDefault(); input.focus(); return; }
    if (e.key === 'Escape') {
      if (drill.open) { closeDrill(); return; }
      if (!panelEl.hidden) { closePanel(); return; }
      if (inInput) { input.value = ''; search(''); input.blur(); }
      return;
    }
    if (drill.open) {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); reveal(); return; }
      if (e.key === 'h' || e.key === 'H') { dHint.hidden = !dHint.hidden; return; }
      if (drill.revealed && (e.key === '1' || e.key === '2' || e.key === '3')) {
        answer(parseInt(e.key, 10) - 1); return;
      }
      if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') { if (drill.cur) nextCard(); return; }
      return;
    }
    if (inInput) return;
    if (e.key === 'd' || e.key === 'D') { $('#drillBtn').click(); }
    else if (e.key === 'l' || e.key === 'L') { openPanel('due'); }
  });

  /* ---------------- 初始化 ---------------- */
  paintAll();
})();
