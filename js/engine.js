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
  // v0.12.0 图纸与专精
  blueprints: [],        // 已持有图纸 [{ id, target, spec, type }]
  bldSpec: {},           // 已激活建筑专精 { berryPatch: 'A', ... }
  jobTalent: {},         // 已激活职业天赋 { gatherer: 'B', ... }
};

let lastRealTime = Date.now();

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
  cost = Math.ceil(cost * specCostMul(id, p.r));
  return cost;
}

// 专精/天赋造价乘数（乘法叠加）
function specCostMul(bldId, resKey) {
  var mul = 1;
  // 莓果园沃土/野蔓 造价修正（对自身造价）
  var spec = G.bldSpec[bldId];
  if (spec && SPEC_BD[bldId] && SPEC_BD[bldId][spec] && SPEC_BD[bldId][spec].costMul)
    mul *= SPEC_BD[bldId][spec].costMul;
  // 锻造炉巧工：所有建筑矿铁造价 -15%
  if (resKey === 'iron' && G.bldSpec.smithy === 'B')
    mul *= SPEC_BD.smithy.B.costReduce.mul;
  // 铁匠省料：锻造炉造价 -15%
  if (bldId === 'smithy' && G.jobTalent.smith === 'B')
    mul *= SPEC_JD.smith.B.bldCostReduce.mul;
  return mul;
}

function canB(id) {
  for (let i = 0; i < BD[id].p.length; i++)
    if (G.res[BD[id].p[i].r].v < bp(id, i)) return false;
  return true;
}

function researchCostMul() {
  if (G.jobTalent.scholar === 'B') return SPEC_JD.scholar.B.resCostMul;
  return 1;
}

function canU(id) {
  var mul = researchCostMul();
  for (const p of UD[id].p)
    if (G.res[p.r].v < Math.ceil(p.a * mul)) return false;
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
  if (G.bldSpec.tannery === 'A') base *= SPEC_BD.tannery.A.foxEatMul;
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

  // 建筑被动产出（含专精加成）
  for (const [id, s] of Object.entries(G.bld)) {
    if (!s.c) continue;
    const e = BD[id].e; if (!e) continue;
    var specData = G.bldSpec[id] && SPEC_BD[id] ? SPEC_BD[id][G.bldSpec[id]] : null;
    for (const [k, v] of Object.entries(e)) {
      if (!k.endsWith('P')) continue;
      var resKey = k.slice(0, -1);
      var val = v;
      // 建筑专精产量乘数
      if (specData) {
        if (specData.prodMul) val *= specData.prodMul;
        // 藏书阁穷卷/秘阁 特殊乘数
        if (resKey === 'lore' && specData.loreProdMul) val = v * specData.loreProdMul;
        if (resKey === 'scroll' && specData.scrollProdMul) val = v * specData.scrollProdMul;
        if (resKey === 'charm' && specData.charmProdMul) val = v * specData.charmProdMul;
      }
      r[resKey] = (r[resKey] || 0) + val * s.c;
    }
    // 建筑专精额外产出
    if (specData && specData.extraP) {
      for (var ek in specData.extraP)
        r[ek] = (r[ek] || 0) + specData.extraP[ek] * s.c * TPD;
    }
    // 建筑专精消耗（drain）
    if (specData && specData.drain) {
      for (var dk in specData.drain)
        r[dk] = (r[dk] || 0) - specData.drain[dk] * s.c * TPD;
    }
  }

  // 职业产出（含培训加成 × 满意度 × 天赋加成）
  for (const [id, s] of Object.entries(G.job)) {
    if (!s.c) continue;
    var trainBonus = 1 + (G.train[id] || 0) * 0.1;
    var talentData = G.jobTalent[id] && SPEC_JD[id] ? SPEC_JD[id][G.jobTalent[id]] : null;
    for (const [k, v] of Object.entries(JD[id].e)) {
      if (!k.endsWith('P')) continue;
      var resKey = k.slice(0, -1);
      var val = v;
      if (talentData) {
        if (talentData.prodMul) val *= talentData.prodMul;
        if (resKey === 'lore' && talentData.loreProdMul) val = v * talentData.loreProdMul;
        if (resKey === 'scroll' && talentData.scrollProdMul) val = v * talentData.scrollProdMul;
      }
      r[resKey] = (r[resKey] || 0) + val * s.c * trainBonus * G.happy;
    }
    // 天赋额外产出
    if (talentData && talentData.extraP) {
      for (var ek in talentData.extraP)
        r[ek] = (r[ek] || 0) + talentData.extraP[ek] * s.c * TPD * trainBonus * G.happy;
    }
  }

  // 祖灵加成（本季职业产出 +50%，含天赋加成）
  if (G.spiritSeason === G.season) {
    for (const [id, s] of Object.entries(G.job)) {
      if (!s.c) continue;
      var trainBonus = 1 + (G.train[id] || 0) * 0.1;
      var talentData = G.jobTalent[id] && SPEC_JD[id] ? SPEC_JD[id][G.jobTalent[id]] : null;
      for (const [k, v] of Object.entries(JD[id].e)) {
        if (!k.endsWith('P')) continue;
        var resKey = k.slice(0, -1);
        var val = v;
        if (talentData) {
          if (talentData.prodMul) val *= talentData.prodMul;
          if (resKey === 'lore' && talentData.loreProdMul) val = v * talentData.loreProdMul;
          if (resKey === 'scroll' && talentData.scrollProdMul) val = v * talentData.scrollProdMul;
        }
        r[resKey] = (r[resKey] || 0) + val * s.c * trainBonus * G.happy * 0.5;
      }
      // 天赋额外产出也受祖灵加成
      if (talentData && talentData.extraP) {
        for (var ek in talentData.extraP)
          r[ek] = (r[ek] || 0) + talentData.extraP[ek] * s.c * TPD * trainBonus * G.happy * 0.5;
      }
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

  // 季节倍率（含灵狐庇护冬季加成 + 霜藏专精）
  var berrySeasonMul = SM[G.season];
  if (G.season === 3 && G.upg.spiritShelter?.done) berrySeasonMul = 0.4;
  if (G.season === 3 && G.bldSpec.warehouse === 'B') berrySeasonMul *= (1 + SPEC_BD.warehouse.B.winterBuff);
  r.berry *= berrySeasonMul;

  // 祈雨术加成
  if (G.rainSeason === G.season) r.berry *= 1.5;

  // 狐狸消耗野莓（外出狐狸不消耗）
  r.berry -= (G.foxes - (G.foxAway || 0)) * foxEatRate();

  // 采集者勤爪额外消耗（独立加项，不受厚韧放大）
  if (G.jobTalent.gatherer === 'A' && G.job.gatherer.c > 0)
    r.berry -= SPEC_JD.gatherer.A.extraEat * G.job.gatherer.c * TPD;

  // 鞣革坊薄削持续转化（兽皮→铜钱，不同速率）
  if (G.bldSpec.tannery === 'B' && G.res.leather.v > 0 && G.res.coin.v < G.res.coin.mx) {
    var cvt = SPEC_BD.tannery.B.convert;
    r[cvt.from] = (r[cvt.from] || 0) - cvt.drainRate * TPD;
    r[cvt.to] = (r[cvt.to] || 0) + cvt.gainRate * TPD;
  }

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
      if (e[k + 'Mx']) {
        var contrib = e[k + 'Mx'] * s.c;
        // 深窖：储藏窖上限翻倍（仅自身贡献）
        if (id === 'warehouse' && G.bldSpec.warehouse === 'A') contrib *= SPEC_BD.warehouse.A.mxMul;
        // 秘阁：藏书阁学识上限翻倍（仅自身贡献）
        if (id === 'library' && k === 'lore' && G.bldSpec.library === 'B') contrib *= SPEC_BD.library.B.loreMxMul;
        mx += contrib;
      }
    }
    // 霜藏：野莓上限 +50%（乘于总上限）
    if (k === 'berry' && G.bldSpec.warehouse === 'B') mx = Math.floor(mx * SPEC_BD.warehouse.B.berryMxMul);
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
  for (const [id, s] of Object.entries(G.bld)) {
    if (!s.c) continue;
    if (BD[id].e?.hapB) h += BD[id].e.hapB * s.c;
    // 福佑：灵狐祠额外满意度
    if (id === 'shrine' && G.bldSpec.shrine === 'A') h += SPEC_BD.shrine.A.hapBonus * s.c;
  }
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
    // 工坊自动制作：连续速率在 calcR() 中处理（v0.13.2 移除了 runAutoCraft 离散批次）
    // 商队季节到期在季节更替中处理
  }
  // 显示补算结果（离开不足 30 秒不提示）
  if (seconds < 30) return;
  var mins = Math.floor(seconds / 60);
  var hrs = Math.floor(mins / 60);
  var msg;
  if (hrs > 0) msg = '离开了 ' + hrs + ' 小时 ' + (mins % 60) + ' 分钟';
  else if (mins > 0) msg = '离开了 ' + mins + ' 分钟';
  else msg = '离开了 ' + Math.floor(seconds) + ' 秒';
  log(msg + '，资源已自动补算。', 'important');
  // 显示离线期间返回的远行
  if (G.pendingNarr && G.pendingNarr.length) {
    for (var i = 0; i < G.pendingNarr.length; i++)
      log(G.pendingNarr[i], 'echo');
    G.pendingNarr = [];
  }
}

// ===== 主循环 =====
function tick() {
  // 检测后台切回：如果距上次 tick 超过 5 秒，补算中间的时间
  var now = Date.now();
  var gap = (now - lastRealTime) / 1000;
  lastRealTime = now;
  if (gap > 5) {
    simulateOffline(gap - TMS / 1000);
    rAll();
    return;
  }

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

  // 工坊自动制作：连续速率已在 calcR() 中处理（之前还有一份 runAutoCraft 离散批次造成 2x 双计数，已移除）

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
  var hasRemnant = picked.e && picked.e.remnant;
  log(msg, hasRemnant ? 'echo' : 'event');
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
  var hasRemnant = picked.e && picked.e.remnant;
  log(msg, hasRemnant ? 'echo' : 'event');
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
  log(msg + '（遗光 +1）', 'echo');
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
  // v0.12.0 图纸与专精
  G.blueprints = []; G.bldSpec = {}; G.jobTalent = {};
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
  // v0.12.0 图纸与专精
  G.blueprints = G.blueprints || [];
  G.bldSpec = G.bldSpec || {};
  G.jobTalent = G.jobTalent || {};

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
  lastRealTime = Date.now();
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
