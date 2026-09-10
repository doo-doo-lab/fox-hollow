const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers.cjs');

test('旧墟、云岭各只保留指定短句，完整数据数量正确', () => {
  const game = createGame();
  assert.deepEqual(game.json('EXD.oldRuin.tip'), ['有的门还开着，像在等谁回来吃饭。']);
  assert.deepEqual(game.json('EXD.cloudRidge.tip'), ['从那上面看，村子小得像一个念头。']);
  assert.deepEqual(game.json('[Object.keys(RD).length,Object.keys(BD).length,Object.keys(JD).length,Object.keys(UD).length,Object.keys(SD).length,ED.length,WD.length]'), [15, 16, 8, 11, 6, 26, 18]);
});

for (const tab of ['b', 'v', 'c', 'r', 'w']) {
  test(`页签 ${tab} 不参与引擎计时，远行与生产持续推进`, () => {
    const game = createGame();
    game.prepareExpedition();
    game.run(`var curTab = '${tab}'; var fold = {res:true,log:true,tab:{'${tab}':true}};`);
    const before = game.run('G.expeditions[0].ticksLeft');
    for (let i = 0; i < 10; i++) game.advance(200);
    assert.equal(game.run('G.tick'), 10);
    assert.equal(game.run('G.expeditions[0].ticksLeft'), before - 10);
  });
}

test('后台回调每秒一次时仍执行每秒五个 tick', () => {
  const game = createGame();
  game.prepareExpedition();
  for (let i = 0; i < 20; i++) game.advance(1000);
  assert.equal(game.run('G.tick'), 100);
  assert.equal(game.run('G.expeditions[0].ticksLeft'), 200);
});

test('长间隔补算不扣掉一个 tick：6 秒应推进 30 tick', () => {
  const game = createGame();
  game.prepareExpedition();
  game.advance(6000);
  assert.equal(game.run('G.tick'), 30);
  assert.equal(game.run('G.expeditions[0].ticksLeft'), 270);
});

test('短间隔余数跨越长补算仍保留：125 + 6050 + 25ms = 31 tick', () => {
  const game = createGame();
  game.advance(125);
  game.advance(6050);
  game.advance(25);
  assert.equal(game.run('G.tick'), 31);
});

test('同一时刻重复回调或系统时间回拨不会重复推进或积累负欠账', () => {
  const game = createGame();
  game.advance(200);
  game.advance(0);
  assert.equal(game.run('G.tick'), 1);
  game.advance(-1000);
  assert.equal(game.run('G.tick'), 1);
  game.advance(200);
  assert.equal(game.run('G.tick'), 2);
});

test('后台到期只结算一次，回前台立即输出暂存叙事并归还狐狸', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run('G.expeditions[0].ticksLeft = 20; document.hidden = true;');
  game.advance(6000);
  assert.equal(game.run('G.expDone.oldRuin'), 1);
  assert.equal(game.run('G.expeditions.length'), 0);
  assert.equal(game.run('G.foxAway'), 0);
  assert.equal(game.run('G.freeFox'), 6);
  assert.equal(game.run('G.narratives.oldRuin.length'), 1);
  assert.ok(game.run('G.pendingNarr.length') > 0);
  game.run('document.hidden = false');
  game.advance(0);
  assert.equal(game.run('G.pendingNarr.length'), 0);
  const count = game.messages.length;
  game.advance(0);
  game.advance(200);
  assert.equal(game.messages.length, count);
  assert.equal(game.run('G.expDone.oldRuin'), 1);
});

test('多队同时返回均只结算一次且不漏队伍', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run("sendExpedition('oldRuin', 2); G.expeditions.forEach(e => e.ticksLeft = 1)");
  game.advance(200);
  assert.equal(game.run('G.expDone.oldRuin'), 2);
  assert.equal(game.run('G.expeditions.length'), 0);
  assert.equal(game.run('G.foxAway'), 0);
  assert.equal(game.run('G.freeFox'), 6);
  assert.equal(game.run('G.narratives.oldRuin.length'), 2);
});

test('灵路仍选择最长的未加速队伍，并且每队只能使用一次', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run(`
    G.bld.shrine.c = 1; G.res.charm.v = 20;
    sendExpedition('oldRuin', 1);
    G.expeditions[0].ticksLeft = 100;
    castSpell('spiritPath');
  `);
  assert.equal(game.run('G.expeditions[0].usedSpiritPath'), false);
  assert.equal(game.run('G.expeditions[1].usedSpiritPath'), true);
  assert.equal(game.run('G.expeditions[1].ticksLeft'), 210);
  game.run("castSpell('spiritPath'); castSpell('spiritPath')");
  assert.equal(game.run('G.expeditions[0].ticksLeft'), 70);
  assert.equal(game.run('G.expeditions[1].ticksLeft'), 210);
});

test('读取旧存档重置运行时欠账，不改变保存的远行记录', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run('save()');
  game.advance(150);
  game.run('load()');
  game.advance(50);
  assert.equal(game.run('G.tick'), 0);
  assert.equal(game.run('G.expeditions[0].ticksLeft'), 300);
});
