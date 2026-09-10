const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// No browser or third-party dependency: execute the real game with a fake clock.
function createGame() {
  let now = 1_000_000;
  const messages = [];
  const storage = new Map();
  const elements = new Map();
  const math = Object.create(Math);
  math.random = () => 0.99;
  const context = vm.createContext({
    console,
    Math: math,
    Date: class extends Date { static now() { return now; } },
    document: {
      hidden: false,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { style: {}, value: '', textContent: '', innerHTML: '' });
        return elements.get(id);
      },
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    log: (m, c = '') => messages.push({ m, c }),
    rAll() {}, rRes() {}, rTC() {}, showChoiceModal() {},
    confirm: () => false,
    location: { reload() {} },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
  });
  for (const file of ['data.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  }
  const run = script => vm.runInContext(script, context);
  run('initState()');
  return {
    run, context, messages, storage, elements,
    json: script => JSON.parse(run(`JSON.stringify(${script})`)),
    advance(ms) { now += ms; return run('tick()'); },
    setNow(value) { now = value; },
    prepareExpedition() {
      run(`
        G.upg.beyondValley.done = 1;
        G.bld.trailroad.c = 3; G.bld.market.c = 1;
        G.bld.hutch.c = 4; G.bld.berryPatch.c = 30;
        G.foxes = 6; G.freeFox = 6;
        calcMx();
        for (const s of Object.values(G.res)) { s.on = true; s.v = s.mx > 0 ? s.mx : 0; }
        sendExpedition('oldRuin', 1);
      `);
    },
  };
}

module.exports = { createGame };
