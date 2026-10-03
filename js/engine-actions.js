/**
 * engine-actions.js - 玩家直接触发的操作
 * gather / build / research / craft / aJob / trainJob / sell / 灵术 / autoCraft toggle
 *
 * 依赖：engine.js（G、工具函数 bp/canB/canU/canC/chk/specCostMul/researchCostMul、calcMx/calcR/calcH、log、rAll/rRes/rTC、tryRewardEvent、tryRemnant、trySpawnCaravan）
 */

// ===== 玩家操作 =====
function gather(type) {
  var amt = type === 'berry' ? 1 * G.happy : 1;
  // 轻手天赋：手动采集量 +50%
  if (type === 'berry' && G.jobTalent.gatherer === 'B')
    amt *= SPEC_JD.gatherer.B.gatherMul;
  // v0.16 政体：谷无主手动采集 +30%
  if (G.polity && POLITY[G.polity] && POLITY[G.polity].e.gatherM) {
    var polityBoost = 1 + Math.min(5, G.bld.polityHall?.c || 0) * 0.05;
    var gm = POLITY[G.polity].e.gatherM;
    amt *= (1 + (gm > 0 ? gm * polityBoost : gm));
  }
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
  if (id === 'smithy' && G.bld.smithy.c === 1) {
    G.res.iron.v = Math.min(G.res.iron.v + 3, G.res.iron.mx);
    log('锻造炉第一炉出铁了，获得 3 矿铁。', 'important');
  }
  rAll();
}

function research(id) {
  if (G.upg[id].done || !canU(id)) return;
  var rMul = researchCostMul();
  var inkPactUsed = (G.inkPact === G.season);
  for (const p of UD[id].p) G.res[p.r].v -= Math.ceil(p.a * rMul);
  G.upg[id].done = 1;
  if (UD[id].e?.plankU) { G.res.plank.on = 1; G.res.plank.mx = 100; }
  if (UD[id].e?.brickU) { G.res.brick.on = 1; G.res.brick.mx = 100; }
  // v0.14 文化研究解锁中间品资源
  if (id === 'folkLore' && G.res.dye) G.res.dye.on = 1;
  if (id === 'calendar' && G.res.wine) G.res.wine.on = 1;
  if (id === 'engraving' && G.res.ink) G.res.ink.on = 1;
  // v0.15 墨契：本次研究消耗墨契标记（A3：inkPactBp 一并清，避免遗留商队加成）
  if (inkPactUsed) {
    G.inkPact = -1;
    G.inkPactBp = false;
    log('墨契生效，本次研究花费 -40%。', 'echo');
  }
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
  var base = (G.train[id] || 0) + 2;
  // v0.16 政策：教育政策对授业费用的乘数
  var mul = 1;
  if (G.policies) {
    for (var dom in G.policies) {
      var optId = G.policies[dom];
      if (!optId || !POLICY[dom] || !POLICY[dom].opts[optId]) continue;
      var pe = POLICY[dom].opts[optId].e;
      if (pe && pe.trainCostM) mul += pe.trainCostM;
    }
  }
  return Math.max(1, Math.ceil(base * mul));
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
  G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce((s, j) => s + j.c, 0);
  // v0.15.1 建筑维持状态重置
  if (id === 'moonStage' && G.bld.moonStage.c <= 0) G.moonStageActive = false;
  if (id === 'artistry' && G.bld.artistry.c <= 0) G.artistryActive = false;
  log('出售了' + BD[id].n + '（剩余' + G.bld[id].c + '座）');
  rAll();
}

// ===== 灵术 =====
function spellCostMul() {
  if (G.bldSpec.shrine === 'B') return SPEC_BD.shrine.B.spellCostMul;
  return 1;
}

function canSpell(id) {
  if (!chk(SD[id].uq)) return false;
  var mul = spellCostMul();
  for (const p of SD[id].cost)
    if (G.res[p.r].v < Math.ceil(p.a * mul)) return false;
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
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    target.ticksLeft = Math.ceil(target.ticksLeft * 0.7);
    target.usedSpiritPath = true;
    log('灵路开启，前往' + EXD[target.dest].n + '的队伍加速了！', 'important');
    rAll();
    return;
  }
  if (id === 'tradeWind') {
    if (G.tradeWindYear === G.year) { log('今年已经召唤过商风了。', 'warn'); return; }
    if (G.caravan) { log('已有商队在场。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    G.tradeWindYear = G.year;
    trySpawnCaravan();
    log('商风吹起，远方的商队循风而来！', 'important');
    rAll();
    return;
  }
  if (id === 'feast') {
    if (G.feastSeason === G.season) { log('本季已经举办过宴席了。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    G.feastSeason = G.season;
    log('山谷宴席开始了，狐狸们的满意度提升！', 'important');
    rAll();
    return;
  }
  // v0.15 文化灵术
  if (id === 'overflow') {
    if (G.overflowSeason === G.season) { log('本季已经施过盈库了。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    G.overflowSeason = G.season;
    log('盈库灵术施展，本季资源上限扩展，满仓不再浪费！', 'important');
    rAll();
    return;
  }
  if (id === 'doubleCraft') {
    if (G.doubleCraftSeason === G.season) { log('本季已经施过双工了。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    G.doubleCraftSeason = G.season;
    log('双工灵术施展，工坊产出提升 50%！', 'important');
    rAll();
    return;
  }
  if (id === 'inkPact') {
    if (G.inkPact === G.season) { log('墨契尚未用完，请先完成一次研究。', 'warn'); return; }
    for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());
    G.inkPact = G.season;
    G.inkPactBp = true;
    log('墨契写就，下次研究花费降低，下支商队或更易携带图纸。', 'important');
    rAll();
    return;
  }

  for (const p of SD[id].cost) G.res[p.r].v -= Math.ceil(p.a * spellCostMul());

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

// ===== 工坊自动制作开关 =====
// 注：连续速率在 calcR() 中处理，此处仅切换 G.autoCraft[id] 标记。
function toggleAutoCraft(id) {
  G.autoCraft[id] = !G.autoCraft[id];
  rTC();
}

// ===== v0.15 节令系统：应用本季选择 =====
// selection: { dye: bool, wine: bool, ink: bool }
// silent=true：离线补算时调用，不输出 per-season 日志（汇总在 simulateOffline 末尾）
// 资源不够的项自动跳过。
function applySeasonRites(selection, silent) {
  G.seasonRites = { dye: false, wine: false, ink: false, all: false };
  var applied = [];
  var skipped = [];
  for (const k of Object.keys(SEASON_RITES)) {
    var cfg = SEASON_RITES[k];
    if (!selection[k]) continue;
    if (G.res[k] && G.res[k].v >= cfg.consume) {
      G.res[k].v -= cfg.consume;
      G.seasonRites[k] = true;
      applied.push(cfg.name);
    } else {
      skipped.push(cfg.name);
    }
  }
  G.seasonRites.all = G.seasonRites.dye && G.seasonRites.wine && G.seasonRites.ink;
  G.lastSeasonRites = { dye: !!selection.dye, wine: !!selection.wine, ink: !!selection.ink };
  G.pendingSeasonRites = { open: false };
  G.lastRiteToast = G.season;
  if (silent) return;  // 离线模式：跳过 per-season 日志和 rAll，由调用者处理
  if (applied.length) {
    var msg = '本季节令已应用：' + applied.join('、');
    if (G.seasonRites.all) msg += '（三全礼生效）';
    log(msg, 'event');
  }
  if (skipped.length) {
    log('资源不足，跳过：' + skipped.join('、'), 'warn');
  }
  rAll();
}

// ===== v0.14 习俗激活 =====
function customById(id) {
  for (var i = 0; i < CUSTD.length; i++) if (CUSTD[i].id === id) return CUSTD[i];
  return null;
}

// 注：req.customsHave = 数组，要求已激活特定的习俗 id（CUSTD unlock 用）；
//     与 chk(q.custom) 不同，后者是数字（已激活习俗总数门槛，BD/UD uq 用）。
function customUnlocked(id) {
  var c = customById(id);
  if (!c) return false;
  var req = c.unlock || {};
  if (req.u) for (var i = 0; i < req.u.length; i++) if (!G.upg[req.u[i]]?.done) return false;
  if (req.b) for (var k in req.b) if ((G.bld[k]?.c || 0) < req.b[k]) return false;
  if (req.j) for (var k in req.j) if ((G.job[k]?.c || 0) < req.j[k]) return false;
  if (req.r) for (var k in req.r) if ((G.res[k]?.v || 0) < req.r[k]) return false;
  if (req.customsHave) for (var i = 0; i < req.customsHave.length; i++) if (!G.customs[req.customsHave[i]]) return false;
  if (req.choice) for (var i = 0; i < req.choice.length; i++) if ((G.choicesDone || []).indexOf(req.choice[i]) < 0) return false;
  if (req.spring && (G.springExpDone || 0) < req.spring) return false;
  return true;
}

// §14.5 修复 3：习俗"是否对玩家可见"——习俗依赖的研究至少需出现在研究面板上
// （研究尚未 on 也尚未 done → 整张习俗卡隐藏，避免暴露玩家不认识的研究名）
function isCustomVisible(cst) {
  if (!cst) return false;
  var req = cst.unlock || {};
  if (req.u) {
    for (var i = 0; i < req.u.length; i++) {
      var udId = req.u[i];
      if (!G.upg[udId] || !(G.upg[udId].on || G.upg[udId].done)) return false;
    }
  }
  return true;
}

function canActivateCustom(id) {
  if (G.customs && G.customs[id]) return false; // 已激活
  if (!customUnlocked(id)) return false;
  var c = customById(id);
  for (var i = 0; i < c.cost.length; i++)
    if (G.res[c.cost[i].r].v < c.cost[i].a) return false;
  return true;
}

function activateCustom(id) {
  if (!canActivateCustom(id)) return;
  var c = customById(id);
  // 扣资源
  for (var i = 0; i < c.cost.length; i++)
    G.res[c.cost[i].r].v -= c.cost[i].a;
  // 标记激活（值为激活时 tick，便于将来扩展）
  if (!G.customs) G.customs = {};
  G.customs[id] = G.tick || 1;
  // onActivate 一次性效果
  if (c.onActivate) {
    if (c.onActivate.trainScholar) {
      G.train = G.train || {};
      G.train.scholar = (G.train.scholar || 0) + c.onActivate.trainScholar;
    }
    if (c.onActivate.ruinNarrAdvance) {
      // 旧墟叙事推进 +1（如果未到末尾）
      if (G.narratives && G.narratives.oldRuin && G.narratives.oldRuin.length < NARR.oldRuin.length) {
        var nextIdx = G.narratives.oldRuin.length;
        G.narratives.oldRuin.push(nextIdx);
        log(NARR.oldRuin[nextIdx], 'echo');
      }
    }
    if (c.onActivate.silentSeason) G.silentSeason = G.season;
  }
  log('习俗激活：' + c.n, 'important');
  rAll();
}

// ===== v0.15 节令面板交互（UI onclick 调用） =====
function markRiteIntroSeen() {
  G.riteIntroSeen = true;
  rAll();
}

function setRiteMode(mode) {
  if (mode !== 'auto' && mode !== 'manual') return;
  G.riteMode = mode;
  log('节令模式切换为：' + (mode === 'auto' ? '自动应用' : '手动确认'), 'echo');
  rAll();
}

// 从 DOM checkbox 收集玩家选择
function _readRiteCheckboxes() {
  var sel = { dye: false, wine: false, ink: false };
  for (var k of Object.keys(SEASON_RITES)) {
    var el = document.getElementById('rite-cb-' + k);
    if (el) sel[k] = !!el.checked;
  }
  return sel;
}

function confirmRites() {
  var sel = _readRiteCheckboxes();
  applySeasonRites(sel, false);
  // applySeasonRites 内已 rAll
}

function skipRites() {
  // 不消耗、不加成；只清 pending 标记并记忆"全空"为下季 default
  G.seasonRites = { dye: false, wine: false, ink: false, all: false };
  G.lastSeasonRites = { dye: false, wine: false, ink: false };
  G.pendingSeasonRites = { open: false };
  log('本季节令已跳过。', 'event');
  rAll();
}

function saveRiteDefault() {
  var sel = _readRiteCheckboxes();
  G.lastSeasonRites = sel;
  log('节令默认已保存：将在下季按此应用。', 'echo');
  rAll();
}

// ===== v0.16 政体操作 =====
function choosePolity(id) {
  if (!POLITY[id]) return;
  if (G.polity) return; // 已有政体，用 changePolity
  if (!G.upg.polityLore?.done) return;
  G.polity = id;
  log('谷中定下政体：' + POLITY[id].n + '。', 'important');
  rAll();
}

function changePolity(id) {
  if (!POLITY[id]) return;
  if (id === G.polity) return;
  // 费用：300 议事录 + 100 古币
  if (!G.res.council || G.res.council.v < 300) { log('议事录不足，无法变更政体。', 'warn'); return; }
  if (!G.res.ancCoin || G.res.ancCoin.v < 100) { log('古币不足，无法变更政体。', 'warn'); return; }
  G.res.council.v -= 300;
  G.res.ancCoin.v -= 100;
  var oldName = G.polity ? POLITY[G.polity].n : '无';
  G.polity = id;
  G.polityChanges++;
  G.polityPenaltySeason = G.season;
  G.polityPenaltyYear = G.year;
  log('政体从「' + oldName + '」变为「' + POLITY[id].n + '」，满意度暂时下降。', 'important');
  rAll();
}

// 政策切换费用（含公议会 -30%）
function policySwitchCost(domain) {
  var base = POLICY[domain]?.cost || 10;
  var mul = 1;
  if (G.polity && POLITY[G.polity] && POLITY[G.polity].e.policyCostMul) {
    var polityBoost = 1 + Math.min(5, G.bld.polityHall?.c || 0) * 0.05;
    mul = POLITY[G.polity].e.policyCostMul; // 公议会 = 0.70
    // policyCostMul 是已经乘好的比率，不需要 polityBoost
    // 但"正面效果受政堂加成"，这里 -30% 是正面，实际= 1 - (1-0.70)*polityBoost
    mul = 1 - (1 - mul) * polityBoost; // e.g. 1 - 0.3 * 1.15 = 0.655
  }
  return Math.max(1, Math.ceil(base * mul));
}

function setPolicy(domain, option) {
  if (!POLICY[domain] || !POLICY[domain].opts[option]) return;
  if (!G.upg.policyLore?.done) return;
  // 冷却检查
  if (G.policyCooldowns[domain] > 0) {
    log('政策「' + POLICY[domain].n + '」仍在冷却中（剩余 ' + G.policyCooldowns[domain] + ' 年）。', 'warn');
    return;
  }
  // 如果已经是当前选项
  if (G.policies[domain] === option) return;
  // 费用
  var cost = policySwitchCost(domain);
  // 首次选择免费
  var isFirst = !G.policies[domain];
  if (!isFirst) {
    if (!G.res.council || G.res.council.v < cost) {
      log('议事录不足（需 ' + cost + '），无法切换政策。', 'warn');
      return;
    }
    G.res.council.v -= cost;
    // 设置冷却
    G.policyCooldowns[domain] = POLICY[domain].cooldown || 2;
  }
  G.policies[domain] = option;
  var optName = POLICY[domain].opts[option].n;
  if (isFirst) {
    log('政策「' + POLICY[domain].n + '」首次确立：' + optName, 'important');
  } else {
    log('政策「' + POLICY[domain].n + '」切换为：' + optName + '（议事录 -' + cost + '）', 'important');
  }
  rAll();
}
