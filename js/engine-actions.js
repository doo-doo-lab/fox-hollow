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
  var rMul = researchCostMul();
  for (const p of UD[id].p) G.res[p.r].v -= Math.ceil(p.a * rMul);
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
  G.freeFox = G.foxes - (G.foxAway || 0) - Object.values(G.job).reduce((s, j) => s + j.c, 0);
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
