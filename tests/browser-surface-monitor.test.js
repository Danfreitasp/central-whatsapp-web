const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserSurfaceMonitor } = require('../src/browser-surface-monitor');

function fixture(options = {}) {
  const events = [];
  let captures = 0;
  let recoveries = 0;
  let current = true;
  let capture = async () => ({ isEmpty: () => true });
  const target = { view: { webContents: {
    capturePage: () => { captures++; return capture(); },
    reload: () => assert.fail('monitor não deve perder rascunhos com reload')
  } }, attached: true };
  const check = createBrowserSurfaceMonitor({
    getTarget: () => target, isCurrent: () => current,
    recover: () => { recoveries++; },
    report: event => events.push(event), timeoutMs: 20, ...options
  });
  return { target, check, events, captures: () => captures, recoveries: () => recoveries,
    setCurrent: value => { current = value; }, setCapture: value => { capture = value; } };
}

test('recupera tela vazia persistente sem recarregar conteúdo nem rascunhos', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) await f.check();
  assert.equal(f.recoveries(), 5);
  assert.equal(f.events.filter(e => e === 'persistent-blank').length, 1);
});

test('falha do compositor não vira recarga após várias verificações', async () => {
  const f = fixture();
  f.setCapture(async () => { throw new Error('UnknownVizError'); });
  for (let i = 0; i < 4; i++) await f.check();
  assert.equal(f.recoveries(), 4);
  assert.deepEqual(f.events, Array(4).fill('capture-failed'));
});

test('captura pendente tem prazo e não acumula outras capturas após timeout', async () => {
  const f = fixture();
  let finish;
  f.setCapture(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.check();
  await f.check();
  await pending;
  await f.check();
  assert.equal(f.captures(), 1);
  assert.equal(f.recoveries(), 1);
  finish({ isEmpty: () => true });
  await new Promise(resolve => setImmediate(resolve));
  f.setCapture(async () => ({ isEmpty: () => true }));
  await f.check();
  assert.equal(f.captures(), 2);
});

for (const fails of [false, true]) {
  test(`descarta captura obsoleta após troca, painel, minimização ou disparo (${fails ? 'erro' : 'imagem'})`, async () => {
    const f = fixture();
    let finish;
    f.setCapture(() => new Promise((resolve, reject) => { finish = fails ? reject : resolve; }));
    const pending = f.check();
    await new Promise(resolve => setImmediate(resolve));
    f.setCurrent(false);
    finish(fails ? new Error('capture') : { isEmpty: () => true });
    await pending;
    assert.equal(f.recoveries(), 0);
    assert.deepEqual(f.events, []);
  });
}

test('reanexa superfície removida sem tentar capturá-la primeiro', async () => {
  const f = fixture();
  f.target.attached = false;
  await f.check();
  assert.equal(f.captures(), 0);
  assert.equal(f.recoveries(), 1);
  assert.deepEqual(f.events, ['detached']);
});

test('não interfere no alvo quando o aplicativo não está apto a recuperar', async () => {
  const f = fixture();
  f.setCurrent(false);
  await f.check();
  assert.equal(f.captures(), 0);
  assert.equal(f.recoveries(), 0);
});

test('imagem normal encerra a sequência de telas vazias', async () => {
  const f = fixture();
  await f.check();
  f.setCapture(async () => ({ isEmpty: () => false, toBitmap: () => Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255
  ]) }));
  await f.check();
  assert.deepEqual(f.events, ['blank', 'healthy']);
  assert.equal(f.recoveries(), 1);
});
