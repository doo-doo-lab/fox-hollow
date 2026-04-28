/**
 * engine-systems.js - 子系统：远行 / 抉择事件 / 商队 / 图纸专精
 *
 * 依赖：engine.js（G、chk、expTimeMul、log、rAll、tickExpeditions 在本文件、closeModal）
 *      engine-actions.js（无直接依赖）
 *      ui.js（showChoiceModal）
 */

// ===== 远行系统 =====
function maxExpeditions() {
  return G.bld.trailroad?.c || 0;
}

function canSendExp(destId) {
  var d = EXD[destId];
  if (!d) return false;
  if (!chk(d.uq)) return false;
  if (G.expeditions.length >= maxExpeditions()) return false;
  if ((G.job.scout?.c || 0) <= 0) return false;
  for (var i = 0; i < d.cost.length; i++)
    if (G.res[d.cost[i].r].v < d.cost[i].a) return false;
  return true;
}

function sendExpedition(destId, foxCount) {
  var d = EXD[destId];
  foxCount = Math.min(foxCount || 1, Math.min(3, G.job.scout?.c || 0));
  if (foxCount <= 0) return;
  if (!canSendExp(destId)) return;
  // 扣资源
  for (var i = 0; i < d.cost.length; i++)
    G.res[d.cost[i].r].v -= d.cost[i].a;
  // 斥候出征
  G.foxAway = (G.foxAway || 0) + foxCount;
  G.job.scout.c -= foxCount;
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
  // 斥候归队
  G.foxAway = Math.max(0, (G.foxAway || 0) - exp.foxCount);
  if (!G.job.scout) G.job.scout = { c: 0, on: 1 };
  G.job.scout.c += exp.foxCount;
  G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce(function(s, j) { return s + j.c; }, 0);
  // 计算奖励倍率：在岗斥候 +5%/人 + 授业次数 +10%/级
  var scoutBonus = 1 + (G.job.scout?.c || 0) * 0.05 + (G.train.scout || 0) * 0.10;
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
  G.caravan = { id: picked, bought: {}, blueprint: null };
  G.caravanTimer = 0;
  // 图纸掉落判定
  var bpChance = 0.5;
  if (G.jobTalent.merchant === 'B') bpChance += SPEC_JD.merchant.B.bpChanceBonus;
  if (Math.random() < bpChance) rollBlueprint(picked);
  if (!silent) {
    log(CVD[picked].arriveLog, 'event');
    if (G.caravan.blueprint) log('商队带来了一张图纸。', 'important');
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

// ===== 图纸与专精系统 =====
function rollBlueprint(caravanId) {
  var cv = CVD[caravanId];
  if (!cv || !cv.blueprintPool) return;
  // 检查图纸费用资源上限（玩家必须有对应资源上限才生成图纸）
  for (var ci = 0; ci < cv.bpCost.length; ci++) {
    var costRes = cv.bpCost[ci].r;
    if (G.res[costRes] && G.res[costRes].mx === 0 && !G.res[costRes].on) return;
  }
  var pool = [];
  for (var i = 0; i < cv.blueprintPool.length; i++) {
    var bp = cv.blueprintPool[i];
    var target = bp.target, type = bp.type;
    // 每个 target 有 A/B 两张图纸
    var specs = type === 'bld' ? SPEC_BD[target] : SPEC_JD[target];
    if (!specs) continue;
    for (var dir of ['A', 'B']) {
      // 已激活该目标任意方向 → 排除
      if (type === 'bld' && G.bldSpec[target]) continue;
      if (type === 'job' && G.jobTalent[target]) continue;
      // 已持有同目标同方向 → 排除
      var held = false, heldOther = false;
      for (var j = 0; j < G.blueprints.length; j++) {
        if (G.blueprints[j].target === target && G.blueprints[j].spec === dir) held = true;
        if (G.blueprints[j].target === target && G.blueprints[j].spec !== dir) heldOther = true;
      }
      if (held) continue;
      // 同目标另一方向已持有 → 互斥排除
      if (heldOther) continue;
      pool.push({ id: target + '_' + dir, target: target, spec: dir, type: type });
    }
  }
  if (!pool.length) return;
  var picked = pool[Math.floor(Math.random() * pool.length)];
  G.caravan.blueprint = {
    id: picked.id, target: picked.target, spec: picked.spec, type: picked.type,
    cost: cv.bpCost
  };
}

function canBuyBlueprint() {
  if (!G.caravan || !G.caravan.blueprint) return false;
  if (G.caravan.bought['blueprint']) return false;
  var bp = G.caravan.blueprint;
  var mul = caravanCostMul();
  for (var i = 0; i < bp.cost.length; i++)
    if (G.res[bp.cost[i].r].v < Math.ceil(bp.cost[i].a * mul)) return false;
  return true;
}

function buyBlueprint() {
  if (!canBuyBlueprint()) return;
  var bp = G.caravan.blueprint;
  var mul = caravanCostMul();
  for (var i = 0; i < bp.cost.length; i++)
    G.res[bp.cost[i].r].v -= Math.ceil(bp.cost[i].a * mul);
  G.blueprints.push({ id: bp.id, target: bp.target, spec: bp.spec, type: bp.type });
  G.caravan.bought['blueprint'] = true;
  // 消耗折扣 buff
  if (G.choiceBuffs && G.choiceBuffs.ruinfolkDiscount && G.caravan.id === 'ruinfolk') {
    G.choiceBuffs.ruinfolkDiscount = false;
  }
  var specData = bp.type === 'bld' ? SPEC_BD[bp.target][bp.spec] : SPEC_JD[bp.target][bp.spec];
  log('购入图纸：' + specData.n + '。', 'important');
  rAll();
}

function activateSpec(bpIdx) {
  if (bpIdx < 0 || bpIdx >= G.blueprints.length) return;
  var bp = G.blueprints[bpIdx];
  if (bp.type !== 'bld') return;
  if (G.bldSpec[bp.target]) return; // 已激活
  if ((G.bld[bp.target]?.c || 0) < 5) return; // 需要≥5座
  G.bldSpec[bp.target] = bp.spec;
  G.blueprints.splice(bpIdx, 1);
  // 自动丢弃同目标另一方向的图纸
  for (var i = G.blueprints.length - 1; i >= 0; i--) {
    if (G.blueprints[i].target === bp.target) G.blueprints.splice(i, 1);
  }
  var specData = SPEC_BD[bp.target][bp.spec];
  var bldName = BD[bp.target]?.n || bp.target;
  log('激活专精：' + bldName + '「' + specData.n + '」。', 'important');
  rAll();
}

function activateJobTalent(bpIdx) {
  if (bpIdx < 0 || bpIdx >= G.blueprints.length) return;
  var bp = G.blueprints[bpIdx];
  if (bp.type !== 'job') return;
  if (G.jobTalent[bp.target]) return; // 已激活
  G.jobTalent[bp.target] = bp.spec;
  G.blueprints.splice(bpIdx, 1);
  // 自动丢弃同目标另一方向的图纸
  for (var i = G.blueprints.length - 1; i >= 0; i--) {
    if (G.blueprints[i].target === bp.target) G.blueprints.splice(i, 1);
  }
  var talentData = SPEC_JD[bp.target][bp.spec];
  var jobName = JD[bp.target]?.n || bp.target;
  log('激活天赋：' + jobName + '「' + talentData.n + '」。', 'important');
  rAll();
}
