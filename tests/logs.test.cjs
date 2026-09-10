const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers.cjs');

function assertRemnantMessage(game, amount = 1) {
  const earned = game.messages.filter(e => e.m.includes(`遗光 +${amount}`));
  assert.equal(earned.length, 1);
  assert.equal(earned[0].c, 'remnant');
  assert.ok(earned[0].m.endsWith(`遗光 +${amount}）`), earned[0].m);
  assert.equal(game.run('G.res.remnant.v'), amount);
}

test('八条遗光发现叙事均同色并且仅附一次 +1', () => {
  for (let i = 0; i < 8; i++) {
    const game = createGame();
    game.run(`Math.random = () => ${(i + 0.1) / 8}; tryRemnant()`);
    assertRemnantMessage(game);
  }
});

for (const resource of ['berry', 'wood', 'stone']) {
  test(`手动采集 ${resource} 获得遗光的颜色、数量与实际奖励一致`, () => {
    const game = createGame();
    game.run(`Math.random = () => 0; gather('${resource}')`);
    assertRemnantMessage(game);
  });
}

test('被动遗光掉落使用专属日志且不把世界回响一起变色', () => {
  const game = createGame();
  game.run('Math.random = () => 0; tickOnce()');
  assertRemnantMessage(game);
  assert.ok(game.messages.some(e => e.c === 'echo' && !e.m.includes('遗光 +')));
});

for (const action of ['tryEvent', 'tryRewardEvent']) {
  for (const index of [0, 1]) {
    test(`${action} 的第 ${index + 1} 个真实遗光见闻统一着色`, () => {
      const game = createGame();
      game.run(`
        G.bld.moonwell.c = 1;
        const event = ED.filter(e => e.e?.remnant)[${index}];
        ED.splice(0, ED.length, event);
        ${action}();
      `);
      assertRemnantMessage(game);
    });
  }
}

test('混合奖励仍整条变色，遗光合计放到末尾', () => {
  const game = createGame();
  game.run("ED.splice(0, ED.length, {t:'发现了物资。',e:{remnant:1,wood:2}}); tryEvent()");
  assertRemnantMessage(game);
  assert.match(game.messages[0].m, /圆木 \+2，遗光 \+1）$/);
});

test('在线远行带回遗光的奖励汇总统一着色', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run('Math.random = () => 0; resolveExpedition(0, false)');
  assertRemnantMessage(game);
  assert.equal(game.run('G.expDone.oldRuin'), 1);
});

test('远行倍率保留真实 +N，不为了提示 +1 改掉奖励数量', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run(`
    Math.random = () => 0;
    G.job.scout.c = 3; G.upg.longJourney.done = 1;
    G.pendingChoice = {idx:0};
    resolveExpedition(0, false);
  `);
  assertRemnantMessage(game, 2);
});

test('离线返回日志经保存/读取后仍保留遗光类别，展示不再次发奖励', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run('Math.random = () => 0; resolveExpedition(0, true); save(); load(); announceReturn(0)');
  assertRemnantMessage(game);
  assert.ok(game.messages.some(e => e.c === 'echo'));
  const before = game.messages.length;
  game.run('announceReturn(0)');
  assert.equal(game.messages.length, before);
  assert.equal(game.run('G.res.remnant.v'), 1);
});

test('旧存档字符串队列兼容，纯叙事不误判，非法队列项被忽略', () => {
  const game = createGame();
  game.run(`
    G.pendingNarr = [
      '这段故事提到遗光，却没有资源奖励。',
      '离开期间，队伍返回了。（矿铁 +3，遗光 +1）',
      {m:'另一队带回了物资。（遗光 +2）',c:'remnant'},
      null, 123, {m:42,c:'echo'},
      {m:'格式异常但仍是纯文本。',c:'unknown-class'}
    ];
    migrate(); announceReturn(0);
  `);
  assert.equal(game.messages.length, 4);
  assert.equal(game.messages[0].c, 'echo');
  assert.equal(game.messages[1].c, 'remnant');
  assert.equal(game.messages[2].c, 'remnant');
  assert.equal(game.messages[3].c, 'echo');
  assert.equal(game.run('G.res.remnant.v'), 0, 'Replaying logs must not grant rewards');
});

test('非数组旧 pendingNarr 安全回退', () => {
  const game = createGame();
  game.run('G.pendingNarr = {bad:true}; migrate(); announceReturn(0)');
  assert.deepEqual(game.json('G.pendingNarr'), []);
});

test('没有遗光的远行奖励继续使用普通重要日志', () => {
  const game = createGame();
  game.prepareExpedition();
  game.run('resolveExpedition(0, false)');
  const rewards = game.messages.find(e => e.m.startsWith('带回了'));
  assert.equal(rewards.c, 'important');
  assert.ok(!rewards.m.includes('遗光 +'));
});
