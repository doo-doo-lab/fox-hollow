/**
 * engine.js - 狐狸谷物语 游戏引擎
 * 状态管理、计算、tick循环、存档
 */

// ===== 游戏状态 =====
const G = {
  tick: 0, year: 1, season: 0, day: 0,
  res: {}, bld: {}, job: {}, upg: {},
  foxes: 0, maxFox: 0, freeFox: 0, happy: 1,
  rainSeason: -1,
  spiritSeason: -1,
  harvestSeason: -1,
  train: {},
  autoCraft: {},
  // v0.11.0 远行与贸易
  foxAway: 0,
  expDone: {},
  expeditions: [],
  pendingNarr: [],
  narratives: { oldRuin: [], cloudRidge: [] },
  feastSeason: -1,
  tradeWindYear: -1,
  caravan: null,
  caravanTimer: 0,
  // 抉择事件
  pendingChoice: null,  // { idx: number } 当前待选择的事件
  choicesDone: [],       // 已触发过的事件索引
  choiceBuffs: {},       // 一次性/永久 buff 追踪
};

let lastRealTime = Date.now();
let tickDebt = 0;      // 未满一个 tick 的毫秒余数（跨前后台和长间隔保留）
let offlineAccum = 0;  // 后台期间累计的离线补算秒数（回前台后统一提示）

function resetClock() {
  lastRealTime = Date.now();
  tickDebt = 0;
  offlineAccum = 0;
}

// 初始化状态
function initState() {
  for (const [k, d] of Object.entries(RD))
    G.res[k] = { v: 0, mx: d.mx, r: 0, on: !d.lock };
  for (const k of Object.keys(BD))
    G.bld[k] = { c: 0, on: !BD[k].uq };
  for (const k of Object.keys(JD))
    G.job[k] = { c: 0, on: !!JD[k].on };
  for (const k of Object.keys(UD))
    G.upg[k] = { done: 0, on: 0 };
}

// ===== 工具函数 =====
function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  if (Math.abs(n) > 0.001 && Math.abs(n) < 0.005) return n.toFixed(3);
  return n.toFixed(2);
}

function bp(id, i) {
  const p = BD[id].p[i];
  var cost = Math.ceil(p.b * Math.pow(p.k, G.bld[id].c));
  if (G.harvestSeason === G.season) cost = Math.ceil(cost * 0.7);
  return cost;
}

function canB(id) {
  for (let i = 0; i < BD[id].p.length; i++)
    if (G.res[BD[id].p[i].r].v < bp(id, i)) return false;
  return true;
}

function canU(id) {
  for (const p of UD[id].p)
    if (G.res[p.r].v < p.a) return false;
  return true;
}

function canC(id) {
  for (const p of CD[id].inp)
    if (G.res[p.r].v < p.a) return false;
  return true;
}

function chk(q) {
  if (!q) return true;
  if (q.b) for (const [k, n] of Object.entries(q.b))
    if ((G.bld[k]?.c || 0) < n) return false;
  if (q.u) for (const k of Object.keys(q.u))
    if (!G.upg[k]?.done) return false;
  if (q.exp) for (const [k, n] of Object.entries(q.exp))
    if ((G.expDone[k] || 0) < n) return false;
  return true;
}

// 每只狐狸消耗野莓的原始速率（tick单位），UI 用 *0.5 转为 /s
function foxEatRate() {
  var base = 0.7;
  if (G.upg.ancestorEye?.done) base *= 0.85;
  return base;
}

// 有效瞭望塔数（符咒耗尽时失效）
function activeWatchtowers() {
  var wt = G.bld.watchtower?.c || 0;
  if (!wt) return 0;
  // 符咒为0且瞭望塔在消耗 → 失效
  if (G.res.charm.v <= 0) {
    // 检查净符咒产量是否为负（即瞭望塔消耗 > 产出）
    var netCharm = G.res.charm.r || 0;
    if (netCharm < 0) return 0;
  }
  return wt;
}

// 远行时间乘数（瞭望塔每座 ×0.85 + 抉择永久加成）
function expTimeMul() {
  var wt = activeWatchtowers();
  var mul = Math.pow(0.85, wt);
  if (G.choiceBuffs && G.choiceBuffs.permTimeMul) mul *= G.choiceBuffs.permTimeMul;
  return mul;
}

// ===== 产量计算 =====
function calcR() {
  const r = {}, m = {};
  for (const k of Object.keys(RD)) { r[k] = 0; m[k] = 1; }

  // 建筑被动产出
  for (const [id, s] of Object.entries(G.bld)) {
    if (!s.c) continue;
    const e = BD[id].e; if (!e) continue;
    for (const [k, v] of Object.entries(e))
      if (k.endsWith('P')) r[k.slice(0, -1)] = (r[k.slice(0, -1)] || 0) + v * s.c;
  }

  // 职业产出（含培训加成 × 满意度）
  for (const [id, s] of Object.entries(G.job)) {
    if (!s.c) continue;
    var trainBonus = 1 + (G.train[id] || 0) * 0.1;
    for (const [k, v] of Object.entries(JD[id].e))
      if (k.endsWith('P')) r[k.slice(0, -1)] = (r[k.slice(0, -1)] || 0) + v * s.c * trainBonus * G.happy;
  }

  // 祖灵加成（本季职业产出 +50%）
  if (G.spiritSeason === G.season) {
    for (const [id, s] of Object.entries(G.job)) {
      if (!s.c) continue;
      var trainBonus = 1 + (G.train[id] || 0) * 0.1;
      for (const [k, v] of Object.entries(JD[id].e))
        if (k.endsWith('P')) r[k.slice(0, -1)] = (r[k.slice(0, -1)] || 0) + v * s.c * trainBonus * G.happy * 0.5;
    }
  }

  // 研究加成
  for (const [id, s] of Object.entries(G.upg)) {
    if (!s.done) continue;
    const e = UD[id].e; if (!e) continue;
    for (const [k, v] of Object.entries(e))
      if (k.endsWith('M') && !k.startsWith('hap') && k !== 'plankU' && k !== 'brickU' && k !== 'winterBuff' && k !== 'foxEat')
        m[k.slice(0, -1)] = (m[k.slice(0, -1)] || 1) + v;
  }

  // 月光井全资源加成
  for (const [id, s] of Object.entries(G.bld)) {
    if (!s.c) continue;
    const e = BD[id].e; if (!e || !e.allM) continue;
    for (const k of Object.keys(r))
      m[k] = (m[k] || 1) + e.allM * s.c;
  }

  // 应用乘数
  for (const k of Object.keys(r)) r[k] *= (m[k] || 1);

  // 季节倍率（含灵狐庇护冬季加成）
  var berrySeasonMul = SM[G.season];
  if (G.season === 3 && G.upg.spiritShelter?.done) berrySeasonMul = 0.4;
  r.berry *= berrySeasonMul;

  // 祈雨术加成
  if (G.rainSeason === G.season) r.berry *= 1.5;

  // 狐狸消耗野莓（外出狐狸不消耗）
  r.berry -= (G.foxes - (G.foxAway || 0)) * foxEatRate();

  // 工坊自动制作（连续速率，受限于原料产量以保证显示准确）
  if (G.upg.craftMastery?.done) {
    if (!G.acOn) G.acOn = {};
    if (!G._acRates) G._acRates = {};
    if (!G._acStop) G._acStop = {};
    var fullAcRate = TPD / 50;
    for (var id in CD) {
      if (!G.autoCraft[id]) { G.acOn[id] = false; G._acRates[id] = 0; G._acStop[id] = ''; continue; }
      if (!chk(CD[id].uq)) { G.acOn[id] = false; G._acRates[id] = 0; G._acStop[id] = ''; continue; }

      // 检查原料是否足够启动（至少够一次制作）
      var canRun = true;
      var stopReason = '';
      for (var i = 0; i < CD[id].inp.length; i++) {
        if (G.res[CD[id].inp[i].r].v < CD[id].inp[i].a) { canRun = false; stopReason = 'input'; break; }
      }
      // 检查产出是否有空间
      if (canRun) {
        for (var i = 0; i < CD[id].out.length; i++) {
          var p = CD[id].out[i];
          if (G.res[p.r].mx > 0 && G.res[p.r].v >= G.res[p.r].mx) { canRun = false; stopReason = 'full'; break; }
        }
      }
      G.acOn[id] = canRun;
      G._acStop[id] = stopReason;
      if (!canRun) { G._acRates[id] = 0; continue; }

      // 计算可持续速率：取每种原料产量能支撑的最大制作速率的最小值
      // 最多消耗95%产量，留5%余量避免资源完全停滞
      var acRate = fullAcRate;
      var hasNegInput = false;
      for (var i = 0; i < CD[id].inp.length; i++) {
        var p = CD[id].inp[i];
        var inputRate = r[p.r] || 0;
        if (inputRate > 0) {
          var maxRate = inputRate * 0.95 / p.a;
          acRate = Math.min(acRate, maxRate);
        } else {
          hasNegInput = true;
        }
      }
      // 有原料无净产出时：若库存充足则降为慢速模式，否则停止连续制作
      if (hasNegInput) {
        var canReserve = true;
        for (var i = 0; i < CD[id].inp.length; i++) {
          if (G.res[CD[id].inp[i].r].v < CD[id].inp[i].a * 3) { canReserve = false; break; }
        }
        acRate = canReserve ? Math.min(acRate, fullAcRate * 0.25) : 0;
      }

      G._acRates[id] = acRate;

      for (var i = 0; i < CD[id].inp.length; i++) {
        var p = CD[id].inp[i];
        r[p.r] = (r[p.r] || 0) - p.a * acRate;
      }
      for (var i = 0; i < CD[id].out.length; i++) {
        var p = CD[id].out[i];
        r[p.r] = (r[p.r] || 0) + p.a * acRate;
      }
    }
  }

  for (const k of Object.keys(RD)) G.res[k].r = r[k] || 0;
}

function calcMx() {
  for (const [k, d] of Object.entries(RD)) {
    let mx = d.mx;
    for (const [id, s] of Object.entries(G.bld)) {
      if (!s.c) continue;
      const e = BD[id].e; if (!e) continue;
      if (e[k + 'Mx']) mx += e[k + 'Mx'] * s.c;
    }
    G.res[k].mx = mx;
  }
  let mf = 0;
  for (const [id, s] of Object.entries(G.bld))
    if (s.c && BD[id].e?.maxFox) mf += BD[id].e.maxFox * s.c;
  G.maxFox = mf;
}

function calcH() {
  let h = 1;
  if (G.foxes > 5) h -= (G.foxes - 5) * 0.02;
  for (const [id, s] of Object.entries(G.bld))
    if (s.c && BD[id].e?.hapB) h += BD[id].e.hapB * s.c;
  for (const [id, s] of Object.entries(G.upg))
    if (s.done && UD[id].e?.hapB) h += UD[id].e.hapB;
  // 山谷宴席 +15%
  if (G.feastSeason === G.season) h += 0.15;
  // 抉择事件掌印墙 +10%
  if (G.choiceBuffs && G.choiceBuffs.happySeason === G.season) h += 0.1;
  G.happy = Math.max(0.1, Math.min(2, h));
}

// ===== 解锁检查 =====
function updateUnlocks() {
  for (const k of Object.keys(BD))
    if (!G.bld[k].on && chk(BD[k].uq)) G.bld[k].on = 1;
  for (const k of Object.keys(JD))
    if (!G.job[k].on && chk(JD[k].uq)) G.job[k].on = 1;
  for (const k of Object.keys(UD))
    if (!G.upg[k].on && !G.upg[k].done && chk(UD[k].uq)) G.upg[k].on = 1;
}

// ===== 狐狸管理 =====
function rmFox() {
  if (!G.foxes) return;
  // 不移除外出狐狸
  var villageFox = G.foxes - (G.foxAway || 0);
  if (villageFox <= 0) return;
  G.foxes--;
  if (G.freeFox > 0) { G.freeFox--; return; }
  for (const k of Object.keys(G.job).reverse())
    if (G.job[k].c > 0) { G.job[k].c--; return; }
}

// ===== 离线/后台进度补算 =====
function simulateOffline(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  // 限制最大补算时间为 24 小时
  seconds = Math.min(seconds, 86400);
  var ticksToRun = Math.floor(seconds * 1000 / TMS);
  // 静默跑 tick（不输出日志、不触发迁入）
  for (var i = 0; i < ticksToRun; i++) {
    G.tick++;
    G.day += 1 / TPD;
    if (G.day >= DPS) {
      G.day = 0;
      G.season++;
      if (G.season >= 4) { G.season = 0; G.year++; }
      // 商队离开
      if (G.caravan) { G.caravan = null; G.caravanTimer = 0; }
      // 商队到访
      if (!G.caravan && G.upg.beyondValley?.done) {
        G.caravanTimer = (G.caravanTimer || 0) + 1;
        if (G.caravanTimer >= 2 && Math.random() < 0.5) trySpawnCaravan(true);
      }
    }
    updateUnlocks();
    calcMx();
    calcH();
    calcR();
    for (var k in G.res) {
      var s = G.res[k];
      if (!s.on) continue;
      s.v += s.r / TPD;
      if (s.mx > 0) s.v = Math.min(s.v, s.mx);
      if (s.v < 0) {
        s.v = 0;
        if (k === 'berry' && G.foxes > 0 && G.tick % 50 === 0) rmFox();
      }
    }
    // 狐狸迁入（降低概率避免离线刷狐狸）
    if (G.foxes < G.maxFox && G.res.berry.v > 20 && Math.random() < 0.015)
      G.foxes++;
    G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce(function(s, j) { return s + j.c; }, 0);
    // 远行倒计时（静默）
    tickExpeditions(true);
    // 工坊自动制作（离散批次）
    if (G.upg.craftMastery?.done && G.tick % 50 === 0) runAutoCraft();
    // 商队季节到期在季节更替中处理
  }
  // 页面仍在后台时先不提示，累计到回前台后统一提示，避免长时间后台每分钟刷一条补算日志
  offlineAccum += seconds;
  if (typeof document !== 'undefined' && document.hidden) return;
  var total = offlineAccum;
  offlineAccum = 0;
  announceReturn(total);
}

// 回到前台时的补算提示 + 暂存叙事展示
function announceReturn(seconds) {
  if (seconds >= 30) {
    var mins = Math.floor(seconds / 60);
    var hrs = Math.floor(mins / 60);
    var msg;
    if (hrs > 0) msg = '离开了 ' + hrs + ' 小时 ' + (mins % 60) + ' 分钟';
    else if (mins > 0) msg = '离开了 ' + mins + ' 分钟';
    else msg = '离开了 ' + Math.floor(seconds) + ' 秒';
    log(msg + '，资源已自动补算。', 'important');
  }
  // 显示离线/后台期间返回的远行与叙事
  if (G.pendingNarr && G.pendingNarr.length) {
    for (var i = 0; i < G.pendingNarr.length; i++)
      log(G.pendingNarr[i], 'echo');
    G.pendingNarr = [];
  }
}

// ===== 主循环 =====
function tick() {
  // 唯一的时间入口：游戏页签/折叠状态只影响 UI，不参与游戏推进。
  var now = Date.now();
  var elapsedMs = Math.max(0, now - lastRealTime);
  lastRealTime = now;
  tickDebt += elapsedMs;
  var ticksToRun = Math.floor(tickDebt / TMS);
  tickDebt -= ticksToRun * TMS;

  if (ticksToRun > 5000 / TMS) {
    // 长间隔按完整 tick 补算；不额外减去一个 tick，也不丢弃毫秒余数。
    // simulateOffline 内仍保留单次最多 24 小时的既有限制。
    simulateOffline(ticksToRun * TMS / 1000);
  } else {
    for (var i = 0; i < ticksToRun; i++) tickOnce();
  }

  // 回到前台：展示后台期间累计的补算提示与暂存叙事
  if ((offlineAccum > 0 || (G.pendingNarr && G.pendingNarr.length)) &&
      !(typeof document !== 'undefined' && document.hidden)) {
    var totalAcc = offlineAccum;
    offlineAccum = 0;
    announceReturn(totalAcc);
  }
}

// 单个游戏 tick（原 tick 主体逻辑）
function tickOnce() {
  G.tick++;
  G.day += 1 / TPD;

  // 季节更替
  if (G.day >= DPS) {
    G.day = 0;
    G.season++;
    if (G.season >= 4) { G.season = 0; G.year++; }
    log(SN[G.season] + '来临了。（第' + G.year + '年）', 'important');
    if (G.season === 3 && G.foxes > 0)
      log('寒冬降至，野莓产量骤降！', 'warn');
    // 商队离开（停留1季后自动离开）
    if (G.caravan) {
      var cv = CVD[G.caravan.id];
      log(cv ? cv.leaveLog : '商队离开了。', 'event');
      G.caravan = null;
      G.caravanTimer = 0;
    }
    // 商队到访检查
    if (!G.caravan && G.upg.beyondValley?.done) {
      G.caravanTimer = (G.caravanTimer || 0) + 1;
      if (G.caravanTimer >= 2 && Math.random() < 0.5) {
        trySpawnCaravan();
      }
    }
  }

  updateUnlocks();
  calcMx();
  calcH();
  calcR();

  // 资源增长
  for (const [k, s] of Object.entries(G.res)) {
    if (!s.on) continue;
    s.v += s.r / TPD;
    if (s.mx > 0) s.v = Math.min(s.v, s.mx);
    if (s.v < 0) {
      s.v = 0;
      if (k === 'berry' && G.foxes > 0 && G.tick % 50 === 0) {
        log('狐狸们饿肚子了！一只村民离开了山谷。', 'warn');
        rmFox();
      }
    }
  }

  // 狐狸迁入
  var foxProb = 0.015;
  if (G.foxes < G.maxFox && G.res.berry.v > 20 && Math.random() < foxProb) {
    G.foxes++;
    log('一只流浪小狐狸被莓果香味吸引，加入了村落！', 'important');
  }

  G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce((s, j) => s + j.c, 0);

  // 远行倒计时
  tickExpeditions();

  // 工坊自动制作：连续速率在 calcR() 中处理，离散批次每50tick执行一次
  if (G.upg.craftMastery?.done && G.tick % 50 === 0) runAutoCraft();

  // 山谷见闻
  if (Math.random() < 0.0003) tryEvent();

  // 世界的回响（极稀有叙事，约 3 小时一次）
  if (Math.random() < 0.00002) tryWorldEcho();

  // 遗光被动掉落（极低概率，约每 55 分钟一次）
  if (Math.random() < 0.00006) tryRemnant();
}

function tryEvent() {
  // 筛选符合条件的事件
  var pool = [];
  for (var i = 0; i < ED.length; i++) {
    var ev = ED[i];
    if (ev.uq && !chk(ev.uq)) continue;
    if (ev.s && ev.s.indexOf(G.season) === -1) continue;
    pool.push(ev);
  }
  if (!pool.length) return;
  // 按权重随机
  var total = 0;
  for (var i = 0; i < pool.length; i++) total += (pool[i].w || 1);
  var roll = Math.random() * total;
  var sum = 0;
  var picked = pool[0];
  for (var i = 0; i < pool.length; i++) {
    sum += (pool[i].w || 1);
    if (roll < sum) { picked = pool[i]; break; }
  }
  // 应用效果
  var rewards = [];
  if (picked.e) {
    for (var k in picked.e) {
      if (G.res[k]) {
        G.res[k].v += picked.e[k];
        if (!G.res[k].on) G.res[k].on = true;
        if (G.res[k].mx > 0) G.res[k].v = Math.min(G.res[k].v, G.res[k].mx);
        var sign = picked.e[k] >= 0 ? '+' : '';
        rewards.push(RD[k].n + ' ' + sign + picked.e[k]);
      }
    }
  }
  var msg = picked.t;
  if (rewards.length) msg += '（' + rewards.join('，') + '）';
  // 获得遗光的事件统一使用遗光专属样式
  log(msg, picked.e && picked.e.remnant ? 'remnant' : 'event');
}

function tryRewardEvent() {
  // 筛选有数值奖励且符合条件的事件
  var pool = [];
  for (var i = 0; i < ED.length; i++) {
    var ev = ED[i];
    if (!ev.e) continue; // 必须有数值奖励
    if (ev.uq && !chk(ev.uq)) continue;
    if (ev.s && ev.s.indexOf(G.season) === -1) continue;
    pool.push(ev);
  }
  if (!pool.length) return;
  var picked = pool[Math.floor(Math.random() * pool.length)];
  var rewards = [];
  for (var k in picked.e) {
    if (G.res[k]) {
      G.res[k].v += picked.e[k];
      if (!G.res[k].on) G.res[k].on = true;
      if (G.res[k].mx > 0) G.res[k].v = Math.min(G.res[k].v, G.res[k].mx);
      var sign = picked.e[k] >= 0 ? '+' : '';
      rewards.push(RD[k].n + ' ' + sign + picked.e[k]);
    }
  }
  var msg = picked.t;
  if (rewards.length) msg += '（' + rewards.join('，') + '）';
  log(msg, picked.e && picked.e.remnant ? 'remnant' : 'event');
}

function tryWorldEcho() {
  var pool = [];
  for (var i = 0; i < WD.length; i++) {
    if (WD[i].s === G.season) pool.push(WD[i]);
  }
  if (!pool.length) return;
  var picked = pool[Math.floor(Math.random() * pool.length)];
  log(picked.t, 'echo');
}

function tryRemnant() {
  var s = G.res.remnant;
  if (!s) return;
  if (s.mx > 0 && s.v >= s.mx) return;
  s.v += 1;
  if (!s.on) s.on = true;
  var msg = REMNANT_LOGS[Math.floor(Math.random() * REMNANT_LOGS.length)];
  log(msg + '（遗光 +1）', 'remnant');
}

// ===== 玩家操作 =====
function gather(type) {
  const amt = type === 'berry' ? 1 * G.happy : 1;
  const s = G.res[type];
  s.v = Math.min(s.v + amt, s.mx);
  if (!s.on) s.on = true;
  // 手动采集时 2% 概率发现遗光
  if (Math.random() < 0.02) tryRemnant();
  rRes(); rTC();
}

function build(id) {
  if (!canB(id)) return;
  for (let i = 0; i < BD[id].p.length; i++)
    G.res[BD[id].p[i].r].v -= bp(id, i);
  G.bld[id].c++;
  if (BD[id].ur) for (const r of BD[id].ur) G.res[r].on = true;
  log('建造了' + BD[id].n + '（共' + G.bld[id].c + '座）');
  rAll();
}

function research(id) {
  if (G.upg[id].done || !canU(id)) return;
  for (const p of UD[id].p) G.res[p.r].v -= p.a;
  G.upg[id].done = 1;
  if (UD[id].e?.plankU) { G.res.plank.on = 1; G.res.plank.mx = 100; }
  if (UD[id].e?.brickU) { G.res.brick.on = 1; G.res.brick.mx = 100; }
  log('研究完成：' + UD[id].n, 'important');
  rAll();
}

function craft(id) {
  if (!canC(id)) return;
  for (const p of CD[id].inp) G.res[p.r].v -= p.a;
  for (const p of CD[id].out)
    G.res[p.r].v = Math.min(G.res[p.r].v + p.a, G.res[p.r].mx);
  log('制作了' + CD[id].n);
  rAll();
}

function aJob(id, d) {
  if (d > 0 && G.freeFox <= 0) return;
  if (d < 0 && G.job[id].c <= 0) return;
  G.job[id].c += d;
  G.freeFox -= d;
  rAll();
}

function trainCost(id) {
  return (G.train[id] || 0) + 2;
}

function canTrain(id) {
  return G.res.scroll.v >= trainCost(id);
}

function trainJob(id) {
  var cost = trainCost(id);
  if (G.res.scroll.v < cost) return;
  G.res.scroll.v -= cost;
  G.train[id] = (G.train[id] || 0) + 1;
  log(JD[id].n + '完成了第' + G.train[id] + '次授业，产出提升！', 'important');
  rAll();
}

function sell(id) {
  if (!G.bld[id] || G.bld[id].c <= 0) return;
  G.bld[id].c--;
  // 返还当前等级（降级后）造价的 50%
  for (let i = 0; i < BD[id].p.length; i++) {
    var refund = Math.floor(bp(id, i) * 0.5);
    G.res[BD[id].p[i].r].v = Math.min(G.res[BD[id].p[i].r].v + refund, G.res[BD[id].p[i].r].mx);
  }
  // 重算容量，超出的狐狸保留为闲置
  calcMx();
  G.freeFox = G.foxes - Object.values(G.job).reduce((s, j) => s + j.c, 0);
  log('出售了' + BD[id].n + '（剩余' + G.bld[id].c + '座）');
  rAll();
}

// ===== 灵术 =====
function canSpell(id) {
  if (!chk(SD[id].uq)) return false;
  for (const p of SD[id].cost)
    if (G.res[p.r].v < p.a) return false;
  return true;
}

function castSpell(id) {
  if (!canSpell(id)) return;

  if (id === 'rain' && G.rainSeason === G.season) {
    log('本季已经祈过雨了。', 'warn');
    return;
  }
  if (id === 'summon' && G.spiritSeason === G.season) {
    log('本季已经召唤过祖灵了。', 'warn');
    return;
  }
  if (id === 'harvest' && G.harvestSeason === G.season) {
    log('本季已经举办过丰收祭了。', 'warn');
    return;
  }
  if (id === 'spiritPath') {
    // 找剩余时间最长的、未使用过灵路的远行
    var target = null, maxT = -1;
    for (var i = 0; i < G.expeditions.length; i++) {
      if (!G.expeditions[i].usedSpiritPath && G.expeditions[i].ticksLeft > maxT) {
        maxT = G.expeditions[i].ticksLeft;
        target = G.expeditions[i];
      }
    }
    if (!target) { log('没有可加速的远行队伍。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= p.a;
    target.ticksLeft = Math.ceil(target.ticksLeft * 0.7);
    target.usedSpiritPath = true;
    log('灵路开启，前往' + EXD[target.dest].n + '的队伍加速了！', 'important');
    rAll();
    return;
  }
  if (id === 'tradeWind') {
    if (G.tradeWindYear === G.year) { log('今年已经召唤过商风了。', 'warn'); return; }
    if (G.caravan) { log('已有商队在场。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= p.a;
    G.tradeWindYear = G.year;
    trySpawnCaravan();
    log('商风吹起，远方的商队循风而来！', 'important');
    rAll();
    return;
  }
  if (id === 'feast') {
    if (G.feastSeason === G.season) { log('本季已经举办过宴席了。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= p.a;
    G.feastSeason = G.season;
    log('山谷宴席开始了，狐狸们的满意度提升！', 'important');
    rAll();
    return;
  }

  for (const p of SD[id].cost) G.res[p.r].v -= p.a;

  if (id === 'rain') {
    G.rainSeason = G.season;
    log('符咒燃尽，天空飘来细雨，野莓产量提升！', 'important');
  } else if (id === 'summon') {
    G.spiritSeason = G.season;
    log('先祖的身影若隐若现，所有职业产出大幅提升！', 'important');
  } else if (id === 'harvest') {
    G.harvestSeason = G.season;
    log('丰收祭奏效了，本季建筑造价降低！', 'important');
    // 触发一次有数值奖励的山谷见闻
    tryRewardEvent();
  }
  rAll();
}

// ===== 工坊自动制作 =====
function toggleAutoCraft(id) {
  G.autoCraft[id] = !G.autoCraft[id];
  rTC();
}

function runAutoCraft() {
  for (var id in CD) {
    if (!G.autoCraft[id]) continue;
    if (!chk(CD[id].uq)) continue;
    // 检查原料是否充足
    var ok = true;
    for (var i = 0; i < CD[id].inp.length; i++) {
      var p = CD[id].inp[i];
      var s = G.res[p.r];
      if (s.v < p.a) { ok = false; break; }
    }
    if (!ok) continue;
    // 检查产出是否还有空间
    var hasSpace = true;
    for (var i = 0; i < CD[id].out.length; i++) {
      var p = CD[id].out[i];
      var s = G.res[p.r];
      if (s.mx > 0 && s.v >= s.mx) { hasSpace = false; break; }
    }
    if (!hasSpace) continue;
    // 执行制作
    for (var i = 0; i < CD[id].inp.length; i++) {
      var p = CD[id].inp[i];
      G.res[p.r].v -= p.a;
    }
    for (var i = 0; i < CD[id].out.length; i++) {
      var p = CD[id].out[i];
      G.res[p.r].v = Math.min(G.res[p.r].v + p.a, G.res[p.r].mx > 0 ? G.res[p.r].mx : Infinity);
    }
  }
}

// ===== 远行系统 =====
function maxExpeditions() {
  return G.bld.trailroad?.c || 0;
}

function canSendExp(destId) {
  var d = EXD[destId];
  if (!d) return false;
  if (!chk(d.uq)) return false;
  if (G.expeditions.length >= maxExpeditions()) return false;
  if (G.freeFox <= 0) return false;
  for (var i = 0; i < d.cost.length; i++)
    if (G.res[d.cost[i].r].v < d.cost[i].a) return false;
  return true;
}

function sendExpedition(destId, foxCount) {
  var d = EXD[destId];
  foxCount = Math.min(foxCount || 1, Math.min(3, G.freeFox));
  if (foxCount <= 0) return;
  if (!canSendExp(destId)) return;
  // 扣资源
  for (var i = 0; i < d.cost.length; i++)
    G.res[d.cost[i].r].v -= d.cost[i].a;
  // 锁定狐狸
  G.foxAway = (G.foxAway || 0) + foxCount;
  G.freeFox -= foxCount;
  // 计算实际路程 tick
  var cb = G.choiceBuffs || {};
  var timeMul = expTimeMul();
  // 一次性目的地时间乘数
  if (cb.nextSendTimeMul && cb.nextSendTimeMul[destId]) {
    timeMul *= cb.nextSendTimeMul[destId];
    delete cb.nextSendTimeMul[destId];
  }
  var days = d.days * timeMul;
  var ticks = Math.ceil(days * TPD);
  G.expeditions.push({
    dest: destId,
    foxCount: foxCount,
    ticksLeft: ticks,
    totalTicks: ticks,
    usedSpiritPath: false
  });
  log('派出 ' + foxCount + ' 只狐狸前往' + d.n + '。', 'important');
  rAll();
}

function tickExpeditions(silent) {
  if (!G.expeditions || !G.expeditions.length) return;
  for (var i = G.expeditions.length - 1; i >= 0; i--) {
    G.expeditions[i].ticksLeft--;
    if (G.expeditions[i].ticksLeft <= 0) {
      resolveExpedition(i, silent);
    }
  }
}

function resolveExpedition(idx, silent) {
  var exp = G.expeditions[idx];
  var d = EXD[exp.dest];
  // 归还狐狸
  G.foxAway = Math.max(0, (G.foxAway || 0) - exp.foxCount);
  G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce(function(s, j) { return s + j.c; }, 0);
  // 计算奖励倍率
  var scoutBonus = 1 + (G.job.scout?.c || 0) * 0.2;
  var researchBonus = G.upg.longJourney?.done ? 1.5 : 1;
  var choiceRewardMul = 1;
  var cb = G.choiceBuffs || {};
  if (cb.nextRewardMul && cb.nextRewardMul[exp.dest]) {
    choiceRewardMul = cb.nextRewardMul[exp.dest];
    delete cb.nextRewardMul[exp.dest];
  }
  var mul = scoutBonus * researchBonus * choiceRewardMul;
  // 抽取奖励（2-3项）
  var rewardCount = 2 + (Math.random() < 0.5 ? 1 : 0);
  var pool = d.rewards.slice();
  var rewards = [];
  for (var r = 0; r < rewardCount && pool.length > 0; r++) {
    var ri = Math.floor(Math.random() * pool.length);
    var rw = pool[ri];
    if (Math.random() > rw.prob) { pool.splice(ri, 1); continue; }
    var amt = Math.floor((rw.min + Math.random() * (rw.max - rw.min + 1)) * mul);
    if (amt <= 0) amt = 1;
    if (G.res[rw.r]) {
      G.res[rw.r].v += amt;
      if (!G.res[rw.r].on) G.res[rw.r].on = true;
      if (G.res[rw.r].mx > 0) G.res[rw.r].v = Math.min(G.res[rw.r].v, G.res[rw.r].mx);
      rewards.push(RD[rw.r].n + ' +' + amt);
    }
    pool.splice(ri, 1);
  }
  // 抉择 buff：额外资源奖励
  if (cb.nextReturn && cb.nextReturn[exp.dest]) {
    var bonusList = cb.nextReturn[exp.dest];
    for (var bi = 0; bi < bonusList.length; bi++) {
      var b = bonusList[bi];
      if (G.res[b.r]) {
        G.res[b.r].v += b.a;
        if (!G.res[b.r].on) G.res[b.r].on = true;
        if (G.res[b.r].mx > 0) G.res[b.r].v = Math.min(G.res[b.r].v, G.res[b.r].mx);
        if (b.a > 0) rewards.push(RD[b.r].n + ' +' + b.a);
        else rewards.push(RD[b.r].n + ' ' + b.a);
      }
    }
    delete cb.nextReturn[exp.dest];
  }
  // 叙事碎片
  if (d.narrative && NARR[exp.dest]) {
    if (!G.narratives) G.narratives = { oldRuin: [], cloudRidge: [] };
    var narrList = G.narratives[exp.dest] || [];
    var nextIdx = narrList.length;
    if (nextIdx < NARR[exp.dest].length) {
      narrList.push(nextIdx);
      G.narratives[exp.dest] = narrList;
      if (!silent) {
        log(NARR[exp.dest][nextIdx], 'echo');
      } else {
        if (!G.pendingNarr) G.pendingNarr = [];
        G.pendingNarr.push(NARR[exp.dest][nextIdx]);
      }
    }
  }
  // 记录完成次数
  G.expDone[exp.dest] = (G.expDone[exp.dest] || 0) + 1;
  // 日志
  var returnLog = d.logs[Math.floor(Math.random() * d.logs.length)];
  if (!silent) {
    log(returnLog, 'event');
    if (rewards.length) log('带回了：' + rewards.join('，'), 'important');
    // 抉择事件触发：斥候≥2，30%概率，无待处理抉择
    if ((G.job.scout?.c || 0) >= 2 && !G.pendingChoice && Math.random() < 0.3) {
      tryTriggerChoice();
    }
  } else {
    if (!G.pendingNarr) G.pendingNarr = [];
    G.pendingNarr.push('离开期间，远行队伍从' + d.n + '返回了。（' + rewards.join('，') + '）');
  }
  // 移除
  G.expeditions.splice(idx, 1);
}

// ===== 抉择事件系统 =====
function tryTriggerChoice() {
  if (!G.choicesDone) G.choicesDone = [];
  var pool = [];
  for (var i = 0; i < CHOICE_EVENTS.length; i++) {
    if (G.choicesDone.indexOf(i) === -1) pool.push(i);
  }
  if (!pool.length) return;
  var picked = pool[Math.floor(Math.random() * pool.length)];
  G.pendingChoice = { idx: picked };
  rAll();
  showChoiceModal(picked);
}

function applyChoice(eventIdx, optIdx) {
  if (!G.choiceBuffs) G.choiceBuffs = {};
  var cb = G.choiceBuffs;
  if (!cb.nextReturn) cb.nextReturn = {};
  if (!cb.nextRewardMul) cb.nextRewardMul = {};
  if (!cb.nextSendTimeMul) cb.nextSendTimeMul = {};

  if (eventIdx === 0) {
    if (optIdx === 0) {
      // A: 消耗圆木×1，下次旧墟返回古币+2
      G.res.wood.v = Math.max(0, G.res.wood.v - 1);
      cb.nextReturn.oldRuin = (cb.nextReturn.oldRuin || []).concat([{ r: 'ancCoin', a: 2 }]);
      log('村名被刻在了墙的末位。刻刀很钝，但字迹很深。', 'event');
    } else {
      // B: 下次旧墟返回学识+5
      cb.nextReturn.oldRuin = (cb.nextReturn.oldRuin || []).concat([{ r: 'lore', a: 5 }]);
      log('斥候把墙上每一个名字都描了回来。那些名字，值得被认真读一遍。', 'event');
    }
  }
  else if (eventIdx === 1) {
    if (optIdx === 0) {
      // A: 下次密林与云岭返回奖励×1.3
      cb.nextRewardMul.forest = (cb.nextRewardMul.forest || 1) * 1.3;
      cb.nextRewardMul.cloudRidge = (cb.nextRewardMul.cloudRidge || 1) * 1.3;
      log('往南走的念头在每只狐狸心里生了根。但不是现在。', 'event');
    } else {
      // B: 野莓+30、圆木+10，下次旧墟返回古币-2
      G.res.berry.v += 30;
      G.res.wood.v += 10;
      cb.nextReturn.oldRuin = (cb.nextReturn.oldRuin || []).concat([{ r: 'ancCoin', a: -2 }]);
      log('井水是甜的。脚下的土地是好的。留在这里，没什么不对。', 'event');
    }
  }
  else if (eventIdx === 2) {
    if (optIdx === 0) {
      // A: 消耗碎石×5，永久所有远行时间×0.95
      G.res.stone.v = Math.max(0, G.res.stone.v - 5);
      cb.permTimeMul = (cb.permTimeMul || 1) * 0.95;
      log('新砌的石标比旧的更稳。路，从此更好走了一点。', 'event');
    } else {
      // B: 下次云岭返回符咒+1，下次云岭远行时间×1.2
      cb.nextReturn.cloudRidge = (cb.nextReturn.cloudRidge || []).concat([{ r: 'charm', a: 1 }]);
      cb.nextSendTimeMul.cloudRidge = (cb.nextSendTimeMul.cloudRidge || 1) * 1.2;
      log('石标被小心扶正了。祖先的卡槽还在，一个也没动。', 'event');
    }
  }
  else if (eventIdx === 3) {
    if (optIdx === 0) {
      // A: 消耗圆木×3碎石×2，本季满意度+10%
      G.res.wood.v = Math.max(0, G.res.wood.v - 3);
      G.res.stone.v = Math.max(0, G.res.stone.v - 2);
      cb.happySeason = G.season;
      log('村口的掌印墙立起来了。第一个按上去的幼崽，爪子还沾着泥。', 'event');
    } else {
      // B: 学识+15，下次旧墟返回卷轴+1
      G.res.lore.v += 15;
      cb.nextReturn.oldRuin = (cb.nextReturn.oldRuin || []).concat([{ r: 'scroll', a: 1 }]);
      log('掌印墙没有做。但那天晚上的讨论，比任何一堂课都有收获。', 'event');
    }
  }
  else if (eventIdx === 4) {
    if (optIdx === 0) {
      // A: 下次旧墟远行时间×1.5，返回古币+8卷轴+1
      cb.nextSendTimeMul.oldRuin = (cb.nextSendTimeMul.oldRuin || 1) * 1.5;
      cb.nextReturn.oldRuin = (cb.nextReturn.oldRuin || []).concat([
        { r: 'ancCoin', a: 8 }, { r: 'scroll', a: 1 }
      ]);
      log('老狐狸跟着队伍出发了。走得很慢，但每一步都在认路。', 'event');
    } else {
      // B: 人口+1，下次旧墟遗民商队价格减半
      G.foxes += 1;
      G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce(function(s, j) { return s + j.c; }, 0);
      cb.ruinfolkDiscount = true;
      log('老狐狸留下来了。他每天傍晚都朝南坐很久，但再没提过回去的事。', 'event');
    }
  }

  // 标记已完成
  if (!G.choicesDone) G.choicesDone = [];
  G.choicesDone.push(eventIdx);
  G.pendingChoice = null;
  closeModal();
  rAll();
}

// ===== 商队系统 =====
function trySpawnCaravan(silent) {
  // 筛选可出现的商队
  var pool = [];
  for (var id in CVD) {
    if (chk(CVD[id].uq)) pool.push(id);
  }
  if (!pool.length) return;
  var picked = pool[Math.floor(Math.random() * pool.length)];
  G.caravan = { id: picked, bought: {} };
  G.caravanTimer = 0;
  if (!silent) {
    log(CVD[picked].arriveLog, 'event');
  }
}

function caravanCostMul() {
  if (G.choiceBuffs && G.choiceBuffs.ruinfolkDiscount && G.caravan && G.caravan.id === 'ruinfolk') return 0.5;
  return 1;
}

function canBuyFromCaravan(itemIdx) {
  if (!G.caravan) return false;
  var cv = CVD[G.caravan.id];
  if (!cv) return false;
  if (G.caravan.bought[itemIdx]) return false;
  var item = cv.sell[itemIdx];
  if (!item) return false;
  var mul = caravanCostMul();
  for (var i = 0; i < item.cost.length; i++)
    if (G.res[item.cost[i].r].v < Math.ceil(item.cost[i].a * mul)) return false;
  return true;
}

function buyFromCaravan(itemIdx) {
  if (!canBuyFromCaravan(itemIdx)) return;
  var cv = CVD[G.caravan.id];
  var item = cv.sell[itemIdx];
  var mul = caravanCostMul();
  for (var i = 0; i < item.cost.length; i++)
    G.res[item.cost[i].r].v -= Math.ceil(item.cost[i].a * mul);
  for (var i = 0; i < item.give.length; i++) {
    var g = item.give[i];
    G.res[g.r].v += g.a;
    if (!G.res[g.r].on) G.res[g.r].on = true;
    if (G.res[g.r].mx > 0) G.res[g.r].v = Math.min(G.res[g.r].v, G.res[g.r].mx);
  }
  G.caravan.bought[itemIdx] = true;
  // 消耗折扣 buff
  if (G.choiceBuffs && G.choiceBuffs.ruinfolkDiscount && G.caravan.id === 'ruinfolk') {
    G.choiceBuffs.ruinfolkDiscount = false;
  }
  log('购买了 ' + item.n + '。');
  rAll();
}

function canSellToCaravan() {
  if (!G.caravan) return false;
  var cv = CVD[G.caravan.id];
  if (!cv || !cv.buy) return false;
  if (G.caravan.bought['sell']) return false;
  for (var i = 0; i < cv.buy.take.length; i++)
    if (G.res[cv.buy.take[i].r].v < cv.buy.take[i].a) return false;
  return true;
}

function sellToCaravan() {
  if (!canSellToCaravan()) return;
  var cv = CVD[G.caravan.id];
  for (var i = 0; i < cv.buy.take.length; i++)
    G.res[cv.buy.take[i].r].v -= cv.buy.take[i].a;
  for (var i = 0; i < cv.buy.give.length; i++) {
    var g = cv.buy.give[i];
    G.res[g.r].v += g.a;
    if (G.res[g.r].mx > 0) G.res[g.r].v = Math.min(G.res[g.r].v, G.res[g.r].mx);
  }
  G.caravan.bought['sell'] = true;
  log('出售了物资给' + cv.n + '。');
  rAll();
}

// 重置 G 到初始骨架（保留引用，清除所有属性后填入默认值）
function resetG() {
  for (var k in G) delete G[k];
  G.tick = 0; G.year = 1; G.season = 0; G.day = 0;
  G.res = {}; G.bld = {}; G.job = {}; G.upg = {};
  G.foxes = 0; G.maxFox = 0; G.freeFox = 0; G.happy = 1;
  G.rainSeason = -1; G.spiritSeason = -1; G.harvestSeason = -1;
  G.train = {}; G.autoCraft = {}; G.acOn = {};
  G.foxAway = 0; G.expDone = {}; G.expeditions = [];
  G.pendingNarr = []; G.narratives = { oldRuin: [], cloudRidge: [] };
  G.feastSeason = -1; G.tradeWindYear = -1;
  G.caravan = null; G.caravanTimer = 0;
  G.pendingChoice = null; G.choicesDone = []; G.choiceBuffs = {};
}
function migrate() {
  // v0.8.1: 移除草药系统
  if (G.res.herb) delete G.res.herb;
  if (G.bld.herbGarden) delete G.bld.herbGarden;
  if (G.job.herbalist) {
    // 释放药师为闲置狐狸
    G.freeFox = (G.freeFox || 0) + (G.job.herbalist.c || 0);
    delete G.job.herbalist;
  }
  if (G.upg.herbalWisdom) delete G.upg.herbalWisdom;

  // v0.8.2: 先祖之眼效果变更（foxProb → foxEat）
  // 无需特殊处理，旧效果 key 不影响运行

  // v0.8.3: 新增 spiritSeason, harvestSeason
  if (G.spiritSeason === undefined) G.spiritSeason = -1;
  if (G.harvestSeason === undefined) G.harvestSeason = -1;

  // 修复木板/砖块上限（旧存档研究已完成但 mx 仍为 0）
  if (G.upg.carpentry?.done && G.res.plank && G.res.plank.mx < 100) {
    G.res.plank.mx = 100; G.res.plank.on = 1;
  }
  if (G.upg.masonry?.done && G.res.brick && G.res.brick.mx < 100) {
    G.res.brick.mx = 100; G.res.brick.on = 1;
  }

  // 补齐新版本新增的资源/建筑/职业/研究状态
  if (!G.autoCraft) G.autoCraft = {};
  if (!G.acOn) G.acOn = {};
  // v0.11.0 远行与贸易
  G.foxAway = G.foxAway || 0;
  G.expDone = G.expDone || {};
  G.expeditions = G.expeditions || [];
  G.pendingNarr = G.pendingNarr || [];
  G.narratives = G.narratives || { oldRuin: [], cloudRidge: [] };
  G.feastSeason = G.feastSeason ?? -1;
  G.tradeWindYear = G.tradeWindYear ?? -1;
  G.caravan = G.caravan || null;
  G.caravanTimer = G.caravanTimer || 0;
  // 抉择事件
  G.pendingChoice = G.pendingChoice || null;
  G.choicesDone = G.choicesDone || [];
  G.choiceBuffs = G.choiceBuffs || {};

  for (const k of Object.keys(RD))
    if (!G.res[k]) G.res[k] = { v: 0, mx: RD[k].mx, r: 0, on: !RD[k].lock };
  for (const k of Object.keys(BD))
    if (!G.bld[k]) G.bld[k] = { c: 0, on: !BD[k].uq };
  for (const k of Object.keys(JD))
    if (!G.job[k]) G.job[k] = { c: 0, on: !!JD[k].on };
  for (const k of Object.keys(UD))
    if (!G.upg[k]) G.upg[k] = { done: 0, on: 0 };
}

// ===== 存档 =====
let saveFailLogged = false;
function save() {
  try {
    localStorage.setItem('fhSave', JSON.stringify(G));
    saveFailLogged = false;
  } catch (e) {
    if (!saveFailLogged) {
      log('自动存档失败，建议导出存档码备份。', 'warn');
      saveFailLogged = true;
    }
  }
}

function load() {
  try {
    const s = localStorage.getItem('fhSave');
    if (s) {
      resetG();
      Object.assign(G, JSON.parse(s));
      migrate();
      log('读取了存档。');
    }
  } catch (e) { }
  resetClock();
}

function manualSave() {
  save();
  log('已手动保存。', 'important');
}

function resetGame() {
  if (!confirm('确定要重置游戏吗？所有进度将被清空，无法恢复。')) return;
  try { localStorage.removeItem('fhSave'); } catch (e) { }
  location.reload();
}

// ===== 存档码 =====
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

function showCodeExport() {
  save();
  var code = btoa(unescape(encodeURIComponent(JSON.stringify(G))));
  document.getElementById('modal-title').textContent = '存档码（复制保存）';
  document.getElementById('modal-body').innerHTML =
    '<textarea id="code-out" readonly style="width:100%;height:100px;font-size:11px;font-family:monospace;resize:vertical;border:1px solid #ccc;padding:4px;">' +
    code + '</textarea>' +
    '<div style="margin-top:6px;">' +
    '<button onclick="copyCode()" style="padding:3px 12px;cursor:pointer;border:1px solid #bbb;background:#fff;font-size:12px;">复制</button>' +
    '<span id="copy-msg" style="margin-left:8px;color:#070;font-size:12px;"></span></div>';
  document.getElementById('modal-overlay').style.display = 'flex';
  log('已生成存档码。', 'important');
}

function copyCode() {
  var ta = document.getElementById('code-out');
  ta.select();
  document.execCommand('copy');
  document.getElementById('copy-msg').textContent = '已复制！';
}

function showCodeImport() {
  document.getElementById('modal-title').textContent = '导入存档码';
  document.getElementById('modal-body').innerHTML =
    '<textarea id="code-in" placeholder="在此粘贴存档码…" style="width:100%;height:100px;font-size:11px;font-family:monospace;resize:vertical;border:1px solid #ccc;padding:4px;"></textarea>' +
    '<div style="margin-top:6px;">' +
    '<button onclick="applyCode()" style="padding:3px 12px;cursor:pointer;border:1px solid #bbb;background:#fff;font-size:12px;">恢复存档</button>' +
    '<span id="import-msg" style="margin-left:8px;font-size:12px;"></span></div>';
  document.getElementById('modal-overlay').style.display = 'flex';
}

function applyCode() {
  var code = document.getElementById('code-in').value.trim();
  if (!code) return;
  try {
    var json = decodeURIComponent(escape(atob(code)));
    var data = JSON.parse(json);
    resetG();
    Object.assign(G, data);
    migrate();
    resetClock();
    log('存档码导入成功！', 'important');
    document.getElementById('import-msg').style.color = '#070';
    document.getElementById('import-msg').textContent = '恢复成功！';
    rAll();
  } catch (e) {
    document.getElementById('import-msg').style.color = '#b00';
    document.getElementById('import-msg').textContent = '存档码无效，请检查。';
    log('存档码导入失败：格式错误。', 'warn');
  }
}
