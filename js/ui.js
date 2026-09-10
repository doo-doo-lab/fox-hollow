/**
 * ui.js - 狐狸谷物语 界面渲染
 * 日志、资源面板、Tab内容、悬浮信息面板、初始化
 */

let curTab = 'b';
const openDetail = {};
const logs = [];
const tipCache = {};
let tipSeason = -1;
const _expFoxSel = {};

// ===== 面板折叠 =====
// fold.res / fold.log：左右栏折叠；fold.tab[id]：各页签内容折叠
// 状态存 localStorage（与游戏存档独立，不影响存档码/兼容）
var fold = { res: false, log: false, tab: {} };
try {
  var _fs = JSON.parse(localStorage.getItem('fhFold') || 'null');
  if (_fs && typeof _fs === 'object' && !Array.isArray(_fs)) {
    fold.res = _fs.res === true;
    fold.log = _fs.log === true;
    if (_fs.tab && typeof _fs.tab === 'object' && !Array.isArray(_fs.tab)) {
      TABS.forEach(function(tab) {
        if (typeof _fs.tab[tab.id] === 'boolean') fold.tab[tab.id] = _fs.tab[tab.id];
      });
    }
  }
} catch (e) { }

function saveFold() {
  try { localStorage.setItem('fhFold', JSON.stringify(fold)); } catch (e) { }
}

// 控件始终留在被隐藏内容之外。hidden 消除占高，同时隐藏可聚焦子项。
function applyFold() {
  ['res', 'log'].forEach(function(id) {
    var button = document.getElementById('fold-' + id);
    var body = document.getElementById(id === 'res' ? 'left-body' : 'log-list');
    body.hidden = fold[id];
    button.setAttribute('aria-expanded', String(!fold[id]));
    button.setAttribute('aria-label', (fold[id] ? '展开' : '收起') + (id === 'res' ? '资源面板' : '谷中见闻'));
    document.getElementById('fold-mark-' + id).textContent = fold[id] ? '展开' : '收起';
  });
  document.getElementById('center-body').hidden = !!fold.tab[curTab];
}

function toggleFold(which) {
  if (which !== 'res' && which !== 'log') return;
  fold[which] = !fold[which];
  saveFold();
  applyFold();
  if (!fold[which]) {
    if (which === 'res') rRes();
    else rLog();
  }
}

// 每个页签独立记忆折叠偏好；切页签不擅自展开之前收起的内容。
function tabClick(id) {
  var tab = TABS.find(function(t) { return t.id === id; });
  if (!tab || (tab.uq && !chk(tab.uq))) return;
  if (id === curTab) {
    fold.tab[id] = !fold.tab[id];
  } else {
    curTab = id;
  }
  saveFold();
  rTabs();
  rExpeditions();
  rTC();
}

function log(m, c) {
  logs.unshift({ m, c: c || '' });
  if (logs.length > 60) logs.pop();
  rLog();
}

// 从 tip 数组随机取一句（按 key 缓存，每季节刷新）
function pickTip(key, arr) {
  if (!arr || !arr.length) return '';
  // 季节变化时清空缓存
  if (G.season !== tipSeason) {
    for (var k in tipCache) delete tipCache[k];
    tipSeason = G.season;
  }
  if (!(key in tipCache)) {
    tipCache[key] = arr[Math.floor(Math.random() * arr.length)];
  }
  return tipCache[key];
}

// 生成悬浮面板 HTML（包裹在 .hp-wrap 中）
// label: 显示的名称文字
// sections: { desc, effects[], notes[], tip }
// opts: { tag, cls, onclick } 外层标签配置
function hpWrap(label, sections, opts) {
  opts = opts || {};
  var tag = opts.tag || 'span';
  var cls = opts.cls || '';
  var onclick = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
  var h = '<' + tag + ' class="hp-wrap ' + cls + '"' + onclick + '>';
  h += label;
  h += '<div class="hp">';
  if (sections.desc) h += '<div class="hp-desc">' + sections.desc + '</div>';
  if (sections.effects && sections.effects.length)
    h += '<div class="hp-eff">' + sections.effects.join('<br>') + '</div>';
  if (sections.notes && sections.notes.length)
    h += '<div class="hp-note">' + sections.notes.join('<br>') + '</div>';
  if (sections.tip) h += '<div class="hp-tip">' + sections.tip + '</div>';
  h += '</div>';
  h += '</' + tag + '>';
  return h;
}

// 建筑效果描述（人类可读）
function bldEffects(e) {
  var r = [];
  if (!e) return r;
  for (var k in e) {
    var v = e[k];
    if (k === 'maxFox') r.push('每座容纳 ' + v + ' 只狐狸');
    else if (k.endsWith('P')) { var rv = v * 0.5; r.push((RD[k.slice(0, -1)]?.n || k) + ' ' + (rv >= 0 ? '+' : '') + fmt(rv) + '/s'); }
    else if (k.endsWith('Mx')) r.push((RD[k.slice(0, -2)]?.n || k) + ' 上限 +' + v);
    else if (k === 'hapB') r.push('满意度 +' + (v * 100 | 0) + '%');
    else if (k === 'allM') r.push('全资源产量 +' + (v * 100 | 0) + '%');
  }
  return r;
}

// 建筑解锁资源提示
function bldUnlockNotes(d) {
  var n = [];
  if (d.ur && d.ur.length) n.push('解锁资源：' + d.ur.map(function(r) { return RD[r].n; }).join('、'));
  if (d.e && d.e.maxFox) n.push('每只狐狸每秒消耗 ' + fmt(foxEatRate() * 0.5) + ' 野莓');
  return n;
}

// 职业效果描述
function jobEffects(id, e) {
  var r = [];
  // 斥候等无产出职业用 desc 字段
  if (JD[id] && JD[id].desc) {
    r.push(JD[id].desc);
    return r;
  }
  for (var k in e) {
    var v = e[k];
    if (k.endsWith('P')) r.push('每只狐狸产出：' + (RD[k.slice(0, -1)]?.n || k) + ' +' + (v * 0.5) + '/s');
  }
  return r;
}

// 研究效果描述
function upgEffects(e) {
  var r = [];
  if (!e) return r;
  for (var k in e) {
    var v = e[k];
    if (k === 'plankU') r.push('解锁资源：木板');
    else if (k === 'brickU') r.push('解锁资源：砖块');
    else if (k === 'hapB') r.push('满意度 +' + (v * 100 | 0) + '%');
    else if (k === 'winterBuff') r.push('冬季野莓倍率 ×0.25 → ×0.4');
    else if (k === 'foxEat') r.push('狐狸消耗野莓 -15%');
    else if (k === 'autoCraft') r.push('工坊配方可开启自动制作');
    else if (k.endsWith('M')) r.push((RD[k.slice(0, -1)]?.n || k) + ' 产量 +' + (v * 100 | 0) + '%');
  }
  return r;
}

function toggleDetail(id) {
  openDetail[id] = !openDetail[id];
  rTC();
}

// 格式化带符号的速率
function fmtR(v) {
  return (v >= 0 ? '+' : '') + fmt(v) + '/s';
}

// 资源速率来源明细
function resBreakdown(k) {
  var lines = [];
  // 无速率且无自动制作 → 不显示
  var hasRate = Math.abs(G.res[k].r) > 0.001;
  var hasAuto = false;
  if (G.upg.craftMastery?.done) {
    for (var cid in CD) {
      if (!G.autoCraft[cid]) continue;
      for (var i = 0; i < CD[cid].inp.length; i++)
        if (CD[cid].inp[i].r === k) hasAuto = true;
      for (var i = 0; i < CD[cid].out.length; i++)
        if (CD[cid].out[i].r === k) hasAuto = true;
    }
  }
  if (!hasRate && !hasAuto) return lines;

  // === 计算乘数（镜像 calcR 逻辑）===
  var mul = 1;
  var mulParts = [];
  for (var uid in G.upg) {
    if (!G.upg[uid].done) continue;
    var e = UD[uid].e; if (!e || !e[k + 'M']) continue;
    mul += e[k + 'M'];
    mulParts.push(UD[uid].n + ' +' + Math.round(e[k + 'M'] * 100) + '%');
  }
  for (var bid in G.bld) {
    if (!G.bld[bid].c) continue;
    var e = BD[bid].e; if (!e || !e.allM) continue;
    var b = e.allM * G.bld[bid].c;
    mul += b;
    mulParts.push(BD[bid].n + ' ×' + G.bld[bid].c + ' +' + Math.round(b * 100) + '%');
  }

  // 野莓季节/祈雨
  var sMul = 1;
  if (k === 'berry') {
    sMul = SM[G.season];
    if (G.season === 3 && G.upg.spiritShelter?.done) sMul = 0.4;
    mulParts.push(SN[G.season] + ' ×' + sMul);
    if (G.rainSeason === G.season) { sMul *= 1.5; mulParts.push('祈雨 ×1.5'); }
  }

  var spiritOn = G.spiritSeason === G.season;
  if (spiritOn) mulParts.push('祖灵 +50%');

  var fullMul = mul * sMul;

  // === 建筑产出 ===
  var hasBldOutput = false;
  for (var bid in BD) {
    var bc = G.bld[bid].c; if (!bc) continue;
    var e = BD[bid].e; if (!e || !e[k + 'P']) continue;
    hasBldOutput = true;
    var rate = e[k + 'P'] * bc * fullMul * 0.5;
    lines.push(BD[bid].n + ' ×' + bc + '  ' + fmtR(rate));
  }

  // === 职业产出（含训练、满意度、祖灵）===
  var hasJobOutput = false;
  for (var jid in JD) {
    var jc = G.job[jid].c; if (!jc) continue;
    var e = JD[jid].e; if (!e || !e[k + 'P']) continue;
    hasJobOutput = true;
    var tb = 1 + (G.train[jid] || 0) * 0.1;
    var sp = spiritOn ? 1.5 : 1;
    var rate = e[k + 'P'] * jc * tb * G.happy * sp * fullMul * 0.5;
    lines.push(JD[jid].n + ' ×' + jc + '  ' + fmtR(rate));
  }

  // === 加成汇总（仅当有建筑/职业被动产出时显示）===
  if ((hasBldOutput || hasJobOutput) && mulParts.length) {
    if (hasJobOutput && G.happy !== 1)
      mulParts.push('满意度 ' + Math.round(G.happy * 100) + '%');
    lines.push('加成: ' + mulParts.join('，'));
  }

  // === 狐狸消耗 ===
  if (k === 'berry' && G.foxes > 0) {
    var fe = foxEatRate() * 0.5;
    lines.push('狐狸 ×' + G.foxes + ' 消耗  ' + fmtR(-G.foxes * fe));
  }

  // === 自动制作 ===
  if (G.upg.craftMastery?.done) {
    for (var cid in CD) {
      if (!G.autoCraft[cid]) continue;
      var on = G.acOn && G.acOn[cid];
      if (!on) {
        // 暂停状态：检查该配方是否涉及当前资源
        var involves = false;
        for (var i = 0; i < CD[cid].inp.length; i++)
          if (CD[cid].inp[i].r === k) involves = true;
        for (var i = 0; i < CD[cid].out.length; i++)
          if (CD[cid].out[i].r === k) involves = true;
        if (involves) {
          var stopR = (G._acStop && G._acStop[cid]) || '';
          if (stopR === 'full') lines.push('自动' + CD[cid].n + '  暂停（产出已满）');
          else lines.push('自动' + CD[cid].n + '  暂停（原料不足）');
        }
        continue;
      }
      // 直接读取引擎计算的实际自动制作速率
      var ar = (G._acRates && G._acRates[cid]) ? G._acRates[cid] * 0.5 : 0;
      for (var i = 0; i < CD[cid].inp.length; i++) {
        if (CD[cid].inp[i].r === k)
          lines.push('自动' + CD[cid].n + '  ' + fmtR(-CD[cid].inp[i].a * ar));
      }
      for (var i = 0; i < CD[cid].out.length; i++) {
        if (CD[cid].out[i].r === k)
          lines.push('自动' + CD[cid].n + '  ' + fmtR(CD[cid].out[i].a * ar));
      }
    }
  }

  return lines;
}

// ===== 渲染：Tab栏 =====
function rTabs() {
  var container = document.getElementById('tabs');
  var visible = TABS.filter(function(t) {
    return !t.uq || chk(t.uq);
  });
  if (!visible.some(function(t) { return t.id === curTab; })) curTab = visible[0].id;
  Array.from(container.children).forEach(function(button) {
    if (!visible.some(function(t) { return t.id === button.dataset.tab; })) button.remove();
  });
  visible.forEach(function(t) {
    var button = document.getElementById('tab-' + t.id);
    if (!button) {
      button = document.createElement('button');
      button.id = 'tab-' + t.id;
      button.type = 'button';
      button.dataset.tab = t.id;
      button.setAttribute('aria-controls', 'center-body');
      button.innerHTML = '<span class="tab-name"></span><span class="fold-mark" aria-hidden="true"></span>';
      button.querySelector('.tab-name').textContent = t.n;
      button.addEventListener('click', function() { tabClick(this.dataset.tab); });
      container.appendChild(button);
    }
    var active = t.id === curTab;
    var collapsed = !!fold.tab[t.id];
    button.className = 'tab' + (active ? ' on' : '');
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-expanded', String(active && !collapsed));
    button.setAttribute('aria-label', active ? t.n + '，' + (collapsed ? '展开' : '收起') + '内容' : '切换到' + t.n + (collapsed ? '，内容已折叠' : ''));
    var mark = button.querySelector('.fold-mark');
    mark.textContent = collapsed ? '展开' : '收起';
    mark.hidden = !active;
  });
}

// ===== 渲染：资源面板 =====
function rRes() {
  var panel = document.getElementById('res-list');
  var h = '', lc = '';
  for (var k in RD) {
    var d = RD[k], s = G.res[k];
    if (!s.on) continue;
    if (d.c !== lc) { lc = d.c; h += '<div class="res-cat">' + d.c + '</div>'; }
    var rr = '';
    var realRate = s.r * 0.5;
    if (Math.abs(realRate) > 0.0005) rr = '<span class="rr ' + (realRate >= 0 ? 'pos' : 'neg') + '">' +
      (realRate >= 0 ? '+' : '') + fmt(realRate) + '/s</span>';

    // resource hover panel
    var sec = { tip: pickTip('res_' + k, d.tip) };
    var bd = resBreakdown(k);
    if (bd.length) sec.effects = bd;
    var rnCls = 'rn' + (k === 'remnant' ? ' rn-remnant' : '');
    var nameHtml = hpWrap('<span class="' + rnCls + '">' + d.n + '</span>', sec, { cls: 'hp-wrap-res' });

    var rvCls = 'rv' + (k === 'remnant' ? ' rv-remnant' : '');
    h += '<div class="res-row">' + nameHtml +
      '<span class="' + rvCls + '">' + fmt(s.v) +
      (s.mx > 0 ? '/' + fmt(s.mx) : '') + rr + '</span></div>';
  }
  document.getElementById('res-list').innerHTML = h;
  document.getElementById('fox-info').innerHTML =
    '狐狸村民：<b>' + G.foxes + (G.maxFox > 0 ? ' / ' + G.maxFox : '') + '</b>' +
    (G.foxAway > 0 ? ' （外出 ' + G.foxAway + '）' : '') +
    (G.freeFox > 0 ? ' （闲置 ' + G.freeFox + '）' : '');
}

// ===== 渲染：公共远行进度（所有页签共用，不自行计时） =====
function rExpeditions() {
  var panel = document.getElementById('expeditions-panel');
  var list = document.getElementById('expedition-list');
  var expeditions = G.expeditions || [];
  panel.hidden = !expeditions.length;
  while (list.children.length > expeditions.length) list.lastElementChild.remove();
  for (var i = 0; i < expeditions.length; i++) {
    var exp = expeditions[i];
    var row = list.children[i];
    if (!row) {
      row = document.createElement('div');
      row.className = 'exp-active';
      row.innerHTML = '<div class="exp-active-hdr">' +
        '<span class="exp-dest-name"></span><span class="exp-info"></span>' +
        '<span class="exp-spirit-used">灵路已用</span></div>' +
        '<div class="exp-bar-bg" role="progressbar" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="exp-bar-fill"></div></div>';
      list.appendChild(row);
    }
    var total = Math.max(1, exp.totalTicks || exp.ticksLeft || 1);
    var pct = Math.max(0, Math.min(100, (total - exp.ticksLeft) / total * 100));
    var daysLeft = Math.max(0, Math.ceil(exp.ticksLeft / TPD));
    var name = EXD[exp.dest].n;
    row.querySelector('.exp-dest-name').textContent = name;
    row.querySelector('.exp-info').textContent = exp.foxCount + '只狐狸 · 剩余' + daysLeft + '天';
    row.querySelector('.exp-spirit-used').hidden = !exp.usedSpiritPath;
    var bar = row.querySelector('.exp-bar-bg');
    bar.setAttribute('aria-label', '前往' + name + '的远行进度');
    bar.setAttribute('aria-valuenow', pct.toFixed(1));
    bar.setAttribute('aria-valuetext', '剩余' + daysLeft + '天');
    // 复用进度条节点；切页签不销毁它，也不重启进度动画。
    row.querySelector('.exp-bar-fill').style.width = pct.toFixed(1) + '%';
  }
}

// ===== 渲染：Tab内容 =====
function rTC() {
  var tcEl = document.getElementById('tc');
  // 当前页签折叠包含公共远行区域；引擎和进度数据仍持续推进。
  document.getElementById('center-body').hidden = !!fold.tab[curTab];
  if (fold.tab[curTab]) return;
  var h = '';

  if (curTab === 'b') {
    // 手动采集按钮（悬浮面板）
    h += '<div class="gather-row">';
    var gatherBtns = [
      { key: 'berry', label: '采集野莓', onclick: "gather('berry')" },
      { key: 'wood',  label: '拾取圆木', onclick: "gather('wood')" },
      { key: 'stone', label: '捡拾碎石', onclick: "gather('stone')" },
    ];
    for (var gi = 0; gi < gatherBtns.length; gi++) {
      var gb = gatherBtns[gi];
      var sec = { tip: pickTip('gather_' + gb.key, GATHER_TIP[gb.key]) };
      h += hpWrap(
        '<button class="gbtn" onclick="' + gb.onclick + '">' + gb.label + '</button>',
        sec,
        { cls: 'hp-wrap-gather' }
      );
    }
    h += '</div>';

    // 建筑列表
    for (var id in BD) {
      var d = BD[id];
      if (!G.bld[id].on) continue;
      var ok = canB(id);
      var costs = d.p.map(function(p, i) {
        var need = bp(id, i), have = G.res[p.r].v;
        return (have < need ? '<span class="short">' : '') +
          RD[p.r].n + ' ' + Math.ceil(need) +
          (have < need ? '</span>' : '');
      }).join(', ');

      // hover panel for building name
      var sec = {
        desc: d.d,
        effects: bldEffects(d.e),
        notes: bldUnlockNotes(d),
        tip: pickTip('bld_' + id, d.tip)
      };
      var nameHtml = hpWrap(
        '<span class="bld-name">' + d.n + '</span>',
        sec,
        { onclick: "toggleDetail('" + id + "')" }
      );

      h += '<div class="bld-row">';
      h += '<div class="bld-top">';
      h += nameHtml;
      h += '<span class="bld-cnt">(' + G.bld[id].c + ')</span>';
      h += '<span class="bld-cost">' + costs + '</span>';
      h += '<button class="bld-btn" onclick="build(\'' + id + '\')" ' + (ok ? '' : 'disabled') + '>建造</button>';
      if (G.bld[id].c > 0) h += '<button class="bld-btn sell-btn" onclick="sell(\'' + id + '\')">出售</button>';
      h += '</div>';
      h += '</div>';
    }

    // 灵术按钮
    var anySpell = 0;
    for (var sid in SD) {
      if (!chk(SD[sid].uq)) continue;
      if (!anySpell) { h += '<div class="res-cat" style="margin-top:10px;">灵术</div>'; anySpell = 1; }
      var ok = canSpell(sid);
      var cost = SD[sid].cost.map(function(p) {
        var have = G.res[p.r].v;
        return (have < p.a ? '<span class="short">' : '') +
          RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
      }).join(', ');
      var extra = '';
      if (sid === 'rain' && G.rainSeason === G.season) extra = ' <span style="color:#888;font-size:11px;">（本季已施）</span>';
      if (sid === 'summon' && G.spiritSeason === G.season) extra = ' <span style="color:#888;font-size:11px;">（本季已施）</span>';
      if (sid === 'harvest' && G.harvestSeason === G.season) extra = ' <span style="color:#888;font-size:11px;">（本季已施）</span>';
      if (sid === 'feast' && G.feastSeason === G.season) extra = ' <span style="color:#888;font-size:11px;">（本季已施）</span>';
      if (sid === 'tradeWind' && G.tradeWindYear === G.year) extra = ' <span style="color:#888;font-size:11px;">（今年已施）</span>';
      if (sid === 'tradeWind' && G.caravan) extra = ' <span style="color:#888;font-size:11px;">（商队在场）</span>';
      if (sid === 'spiritPath') {
        var hasTarget = false;
        for (var ei = 0; ei < (G.expeditions||[]).length; ei++)
          if (!G.expeditions[ei].usedSpiritPath) hasTarget = true;
        if (!hasTarget) extra = ' <span style="color:#888;font-size:11px;">（无可加速）</span>';
        else {
          // 找目标显示
          var tgt = null, maxT = -1;
          for (var ei = 0; ei < G.expeditions.length; ei++)
            if (!G.expeditions[ei].usedSpiritPath && G.expeditions[ei].ticksLeft > maxT) { maxT = G.expeditions[ei].ticksLeft; tgt = G.expeditions[ei]; }
          if (tgt) extra = ' <span style="color:#888;font-size:11px;">（→' + EXD[tgt.dest].n + '）</span>';
        }
      }
      var sec = { effects: [SD[sid].d], tip: pickTip('spell_' + sid, SD[sid].tip) };
      var nameHtml = hpWrap('<span class="bld-name">' + SD[sid].n + '</span>', sec);
      h += '<div class="bld-row"><div class="bld-top">' +
        nameHtml + extra +
        '<span class="bld-cost">' + cost + '</span>' +
        '<button class="bld-btn" onclick="castSpell(\'' + sid + '\')" ' +
        (ok ? '' : 'disabled') + '>施法</button></div></div>';
    }
  }

  else if (curTab === 'v') {
    // 满意度计算明细
    var hapNotes = ['基础：100%'];
    if (G.foxes > 5) hapNotes.push('人口惩罚（' + G.foxes + '-5）：-' + ((G.foxes - 5) * 2) + '%');
    for (var bid in G.bld) {
      if (G.bld[bid].c && BD[bid].e?.hapB)
        hapNotes.push(BD[bid].n + ' ×' + G.bld[bid].c + '：+' + (BD[bid].e.hapB * G.bld[bid].c * 100 | 0) + '%');
    }
    for (var uid in G.upg) {
      if (G.upg[uid].done && UD[uid].e?.hapB)
        hapNotes.push(UD[uid].n + '：+' + (UD[uid].e.hapB * 100 | 0) + '%');
    }
    var hapSec = { effects: hapNotes, notes: ['当前职业产出倍率：×' + (G.happy * 100 | 0) + '%'] };
    var hapHtml = hpWrap('<b>' + (G.happy * 100 | 0) + '%</b>', hapSec);

    h += '<div class="village-hdr">闲置：<b>' + Math.max(0, G.freeFox) +
      '</b> / 总计 ' + G.foxes + ' &nbsp; 满意度：' + hapHtml + '</div>';
    var any = 0;
    for (var id in JD) {
      var d = JD[id];
      if (!G.job[id].on) continue; any = 1;
      var trainLv = G.train[id] || 0;
      var eff = jobEffects(id, d.e);
      if (trainLv > 0) eff.push('授业加成：+' + (trainLv * 10) + '%');
      var sec = {
        desc: d.d,
        effects: eff,
        tip: pickTip('job_' + id, d.tip)
      };
      var nameHtml = hpWrap('<span class="jn">' + d.n + '</span>', sec);
      var tCost = trainCost(id);
      var tOk = canTrain(id);
      var trainSec = {
        desc: '消耗 ' + tCost + ' 卷轴，该职业所有从业者产出 +10%',
        tip: pickTip('train_' + id, ['师傅领进门，修行靠嚼草。', '学会了新本事的狐狸，尾巴翘得更高了。'])
      };
      var trainBtnHtml = hpWrap(
        '<button class="train-btn" onclick="trainJob(\'' + id + '\')" ' +
        (tOk ? '' : 'disabled') + '>授业</button>',
        trainSec,
        { cls: 'hp-wrap-train' }
      );
      var trainHtml = '<span class="job-train">' +
        trainBtnHtml +
        (trainLv > 0 ? '<span class="train-lv">Lv' + trainLv + '</span>' : '') +
        '</span>';
      h += '<div class="job-row">' +
        '<button class="jbtn" onclick="aJob(\'' + id + '\',-1)">-</button>' +
        '<span class="jc">' + G.job[id].c + '</span>' +
        '<button class="jbtn" onclick="aJob(\'' + id + '\',1)">+</button>' +
        nameHtml +
        '<span class="jd">' + d.d + '</span>' +
        trainHtml + '</div>';
    }
    if (!any) h += '<div style="color:#aaa;font-size:13px;">建造设施来解锁职业。</div>';
  }

  else if (curTab === 'c') {
    var any = 0;
    var hasAuto = G.upg.craftMastery?.done;
    for (var id in CD) {
      var d = CD[id];
      if (!chk(d.uq)) continue; any = 1;
      var ok = canC(id);
      var cost = d.inp.map(function(p) {
        var have = G.res[p.r].v;
        return (have < p.a ? '<span class="short">' : '') +
          RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
      }).join(', ');
      var out = d.out.map(function(p) { return RD[p.r].n + ' ' + p.a; }).join(', ');
      var sec = { desc: d.d, tip: pickTip('craft_' + id, d.tip) };
      if (hasAuto && G.autoCraft[id]) {
        var running = G.acOn && G.acOn[id];
        var autoRate = 1 / (50 * TMS / 1000);
        var autoEffects = [];
        var actualAcRate = (G._acRates && G._acRates[id]) ? G._acRates[id] * 0.5 : 0;
        autoEffects.push('满速: ' + d.out.map(function(p) { return RD[p.r].n + ' +' + fmt(p.a * autoRate) + '/s'; }).join(', '));
        if (running) {
          if (actualAcRate > 0 && actualAcRate < autoRate * 0.99) {
            autoEffects.push('状态: 降速运行（' + d.out.map(function(p) { return RD[p.r].n + ' +' + fmt(p.a * actualAcRate) + '/s'; }).join(', ') + '）');
          } else {
            autoEffects.push('状态: 满速运行中');
          }
        } else {
          var stopReason = (G._acStop && G._acStop[id]) || '';
          if (stopReason === 'full') autoEffects.push('状态: 暂停（产出已满）');
          else autoEffects.push('状态: 暂停（原料不足）');
        }
        autoEffects.push('原料不足时自动降速');
        sec.effects = autoEffects;
      }
      var nameHtml = hpWrap('<span class="cr-name">' + d.n + '</span>', sec);
      var autoBtn = '';
      if (hasAuto) {
        var isOn = G.autoCraft[id];
        autoBtn = '<button class="cr-btn auto-btn' + (isOn ? ' auto-on' : '') +
          '" onclick="toggleAutoCraft(\'' + id + '\')">' +
          (isOn ? '自动:开' : '自动:关') + '</button>';
      }
      h += '<div class="cr-row"><div class="cr-top">' +
        nameHtml +
        '<span class="cr-cost">' + cost + ' → ' + out + '</span>' +
        '<button class="cr-btn" onclick="craft(\'' + id + '\')" ' +
        (ok ? '' : 'disabled') + '>制作</button>' +
        autoBtn + '</div></div>';
    }
    if (!any) h += '<div style="color:#aaa;font-size:13px;">继续研究来解锁配方。</div>';
  }

  else if (curTab === 'r') {
    var any = 0;
    for (var id in UD) {
      var d = UD[id];
      if (G.upg[id].done || !G.upg[id].on) continue; any = 1;
      var ok = canU(id);
      var cost = d.p.map(function(p) {
        var have = G.res[p.r].v;
        return (have < p.a ? '<span class="short">' : '') +
          RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
      }).join(', ');
      var sec = { desc: d.d, effects: upgEffects(d.e), tip: pickTip('upg_' + id, d.tip) };
      var nameHtml = hpWrap('<span class="cr-name">' + d.n + '</span>', sec);
      h += '<div class="cr-row"><div class="cr-top">' +
        nameHtml +
        '<span class="cr-cost">' + cost + '</span>' +
        '<button class="cr-btn" onclick="research(\'' + id + '\')" ' +
        (ok ? '' : 'disabled') + '>研究</button></div></div>';
    }
    var done = Object.entries(G.upg).filter(function(e) { return e[1].done; });
    if (done.length) {
      h += '<div class="res-cat" style="margin-top:8px;">已完成</div>';
      for (var i = 0; i < done.length; i++) {
        var uid = done[i][0];
        var sec = { effects: upgEffects(UD[uid].e), tip: pickTip('upg_' + uid, UD[uid].tip) };
        var nameHtml = hpWrap('✓ ' + UD[uid].n, sec);
        h += '<div class="cr-done">' + nameHtml + '</div>';
      }
    }
    if (!any && !done.length)
      h += '<div style="color:#aaa;font-size:13px;">建造藏书阁来解锁研究。</div>';
  }

  else if (curTab === 'w') {
    // ===== 山外 Tab =====

    // --- 派遣远行 ---
    var maxExp = maxExpeditions();
    var curExp = G.expeditions ? G.expeditions.length : 0;
    h += '<div class="res-cat" style="margin-top:10px;">远行目的地 <span style="font-size:11px;color:#aaa;">（队伍 ' + curExp + '/' + maxExp + '）</span></div>';

    if (maxExp <= 0) {
      h += '<div style="color:#aaa;font-size:13px;">建造驿道来派出远行队伍。</div>';
    } else {
      var wt = activeWatchtowers();
      if (wt > 0) {
        h += '<div style="font-size:11px;color:#888;margin-bottom:6px;">瞭望塔 ×' + wt + '：远行时间 ×' + expTimeMul().toFixed(2) + '</div>';
      }
      for (var did in EXD) {
        var dd = EXD[did];
        if (!chk(dd.uq)) continue;
        var canSend = canSendExp(did);
        var days = Math.ceil(dd.days * expTimeMul());
        var costStr = dd.cost.map(function(p) {
          var have = G.res[p.r].v;
          return (have < p.a ? '<span class="short">' : '') +
            RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
        }).join(', ');
        var rwPrev = dd.rewards.map(function(rw) {
          var probStr = rw.prob < 1 ? ' (' + Math.round(rw.prob * 100) + '%)' : '';
          return RD[rw.r].n + ' ' + rw.min + '-' + rw.max + probStr;
        }).join('，');
        var sec = {
          desc: (dd.d ? dd.d + '<br>' : '') + '路程：' + days + ' 天',
          effects: ['可能获得：' + rwPrev],
          notes: dd.narrative ? ['每次必定获得一段叙事碎片'] : [],
          tip: pickTip('exp_' + did, dd.tip)
        };
        var nameHtml = hpWrap('<span class="bld-name">' + dd.n + '</span>', sec);
        h += '<div class="exp-row"><div class="exp-row-top">';
        h += nameHtml;
        h += '<span class="exp-days">' + days + '天</span>';
        h += '<span class="bld-cost">' + costStr + '</span>';
        var maxSend = Math.min(3, G.freeFox);
        var selVal = _expFoxSel[did] || 1;
        h += '<span class="exp-fox-btns">';
        for (var fi = 1; fi <= 3; fi++) {
          var isSel = fi === selVal;
          var dis = fi > maxSend;
          h += '<button class="exp-fox-btn' + (isSel ? ' sel' : '') + '"' +
            (dis ? ' disabled' : ' onclick="_expFoxSel[\'' + did + '\']=' + fi + ';rTC()"') +
            '>' + fi + '只</button>';
        }
        h += '</span>';
        h += '<button class="bld-btn" onclick="sendExpedition(\'' + did + '\', _expFoxSel[\'' + did + '\'] || 1)" ' +
          (canSend ? '' : 'disabled') + '>派遣</button>';
        h += '</div></div>';
      }
    }

    // --- 商队面板 ---
    h += '<div class="res-cat" style="margin-top:10px;">商队</div>';
    if (G.caravan) {
      var cv = CVD[G.caravan.id];
      h += '<div class="cv-name">' + cv.n + ' <span style="color:#888;font-size:11px;">（停留至本季结束）</span></div>';
      for (var si = 0; si < cv.sell.length; si++) {
        var item = cv.sell[si];
        var bought = G.caravan.bought[si];
        var canBuyNow = canBuyFromCaravan(si);
        var costStr = item.cost.map(function(p) {
          var have = G.res[p.r].v;
          return (have < p.a ? '<span class="short">' : '') +
            RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
        }).join(', ');
        var giveStr = item.give.map(function(p) { return RD[p.r].n + ' ×' + p.a; }).join(', ');
        h += '<div class="cv-item">';
        h += '<span class="cv-item-name">购买 ' + giveStr + '</span>';
        h += '<span class="bld-cost">' + costStr + '</span>';
        if (bought) {
          h += '<span class="cv-bought">已购</span>';
        } else {
          h += '<button class="bld-btn" onclick="buyFromCaravan(' + si + ')" ' + (canBuyNow ? '' : 'disabled') + '>购买</button>';
        }
        h += '</div>';
      }
      if (cv.buy) {
        var soldAlready = G.caravan.bought['sell'];
        var canSellNow = canSellToCaravan();
        var takeStr = cv.buy.take.map(function(p) {
          var have = G.res[p.r].v;
          return (have < p.a ? '<span class="short">' : '') +
            RD[p.r].n + ' ' + p.a + (have < p.a ? '</span>' : '');
        }).join(', ');
        var giveStr2 = cv.buy.give.map(function(p) { return RD[p.r].n + ' ×' + p.a; }).join(', ');
        h += '<div class="cv-item">';
        h += '<span class="cv-item-name">出售 ' + takeStr + ' → ' + giveStr2 + '</span>';
        if (soldAlready) {
          h += '<span class="cv-bought">已售</span>';
        } else {
          h += '<button class="bld-btn" onclick="sellToCaravan()" ' + (canSellNow ? '' : 'disabled') + '>出售</button>';
        }
        h += '</div>';
      }
    } else {
      h += '<div style="color:#aaa;font-size:13px;">暂无商队到访。</div>';
    }

    // --- 叙事碎片 ---
    var hasNarr = false;
    for (var nk in NARR) {
      if (NARR[nk].length) { hasNarr = true; break; }
    }
    if (hasNarr) {
      h += '<div class="res-cat" style="margin-top:10px;">山外拾遗</div>';
      var narrSections = [
        { key: 'oldRuin', label: '旧墟手记' },
        { key: 'cloudRidge', label: '云岭石刻' },
      ];
      for (var ni = 0; ni < narrSections.length; ni++) {
        var ns = narrSections[ni];
        var narrData = NARR[ns.key];
        if (!narrData || !narrData.length) continue;
        var collected = (G.narratives && G.narratives[ns.key]) ? G.narratives[ns.key].length : 0;
        h += '<div class="narr-section">';
        h += '<div class="narr-title">' + ns.label + ' <span style="color:#888;font-size:11px;">（' + collected + '/' + narrData.length + '）</span></div>';
        for (var nj = 0; nj < narrData.length; nj++) {
          if (nj < collected) {
            h += '<div class="narr-item narr-unlocked">' + narrData[nj] + '</div>';
          } else {
            h += '<div class="narr-item narr-locked">???</div>';
          }
        }
        h += '</div>';
      }
    }
  }

  tcEl.innerHTML = h;
}

// ===== 渲染：日志 =====
function rLog() {
  var entries = logs.slice(0, 30).map(function(e) {
    var row = document.createElement('div');
    row.className = 'log ' + (e.c || '');
    row.textContent = e.m;
    return row;
  });
  document.getElementById('log-list').replaceChildren(...entries);
}

// ===== 渲染：季节 =====
function rSeason() {
  document.getElementById('season-display').textContent =
    SN[G.season] + ' · 第' + G.year + '年 · 第' + (Math.floor(G.day) + 1) + '天';
}

// ===== 全量渲染 =====
var _blockTC = 0;
function rAll() {
  rRes(); rTabs(); rExpeditions();
  // select 交互期间跳过 rTC 重建
  if (_blockTC > 0) { _blockTC--; }
  else { rTC(); }
  rSeason();
}

// ===== 抉择事件 Modal =====
function showChoiceModal(idx) {
  var ev = CHOICE_EVENTS[idx];
  if (!ev) return;
  document.getElementById('modal-title').textContent = '远行抉择';
  var h = '<div style="line-height:1.7;margin-bottom:10px;color:#555;">' + ev.t + '</div>';
  for (var i = 0; i < ev.opts.length; i++) {
    var opt = ev.opts[i];
    h += '<div style="margin-bottom:8px;padding:6px 8px;border:1px solid #ddd;background:#fafafa;">';
    h += '<div style="font-weight:bold;color:#333;margin-bottom:2px;">' + opt.label + '</div>';
    h += '<div style="font-size:11px;color:#888;margin-bottom:4px;">' + opt.desc + '</div>';
    h += '<button onclick="applyChoice(' + idx + ',' + i + ')" style="padding:3px 14px;cursor:pointer;border:1px solid #bbb;background:#fff;font-size:12px;">选择</button>';
    h += '</div>';
  }
  document.getElementById('modal-body').innerHTML = h;
  // 隐藏关闭按钮（必须做出选择）
  var closeBtn = document.querySelector('#modal-box > div:last-child');
  if (closeBtn) closeBtn.style.display = 'none';
  document.getElementById('modal-overlay').style.display = 'flex';
}

// ===== 启动 =====
function startGame() {
  initState();
  load();
  log('欢迎来到狐狸谷！采集资源，建造家园。', 'important');
  applyFold();
  rAll();
  var _renderAcc = 0;
  setInterval(function () {
    var t0 = G.tick;
    tick();
    // 按实际推进的 tick 数控制渲染节奏（后台补跑多个 tick 时也能及时刷新）
    _renderAcc += G.tick - t0;
    if (_renderAcc >= 5) { _renderAcc %= 5; rAll(); }
  }, TMS);
  setInterval(save, 30000);

  // 浏览器恢复前台时立即同步；同一时刻的定时器回调不会重复结算。
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) return;
    tick();
    _renderAcc = 0;
    rAll();
  });

  // Position fixed hover panels — delegate via mouseenter (no bubbling noise)
  var _hpCur = null;
  document.addEventListener('mouseover', function(ev) {
    var wrap = ev.target.closest('.hp-wrap');
    if (wrap === _hpCur) return; // same wrap, skip
    _hpCur = wrap;
    if (!wrap) return;
    var hp = wrap.querySelector('.hp');
    if (!hp) return;
    var rect = wrap.getBoundingClientRect();
    var isRes = wrap.classList.contains('hp-wrap-res');
    if (isRes) {
      hp.style.left = (rect.right + 6) + 'px';
      hp.style.top = rect.top + 'px';
    } else {
      var left = rect.left;
      var top = rect.bottom + 4;
      if (left + 260 > window.innerWidth) left = window.innerWidth - 266;
      // Use actual panel height for bottom clamp
      hp.style.display = 'block';
      var ph = hp.offsetHeight || 160;
      hp.style.display = '';
      if (top + ph > window.innerHeight) top = rect.top - ph - 4;
      hp.style.left = Math.max(0, left) + 'px';
      hp.style.top = Math.max(0, top) + 'px';
    }
  });
  document.addEventListener('mouseout', function(ev) {
    var wrap = ev.target.closest('.hp-wrap');
    if (wrap && wrap === _hpCur && !wrap.contains(ev.relatedTarget)) _hpCur = null;
  });

  // select 交互保护（已改用按钮组，保留mousedown防护备用）
  document.addEventListener('mousedown', function(ev) {
    if (ev.target.tagName === 'SELECT') _blockTC = 5;
  }, true);
}

startGame();
