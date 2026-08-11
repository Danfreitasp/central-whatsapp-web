const test = require('node:test');
const assert = require('node:assert/strict');
const { syncWindowsStartup, createTrayMenuTemplate } = require('../src/windows-integration');

test('configura a versão instalada para iniciar oculta junto com o Windows', () => {
  let received;
  const changed = syncWindowsStartup({
    isPackaged: true,
    setLoginItemSettings: (settings) => { received = settings; }
  }, true, { platform: 'win32' });
  assert.equal(changed, true);
  assert.equal(received.openAtLogin, true);
  assert.equal(received.openAsHidden, true);
  assert.deepEqual(received.args, ['--hidden']);
});

test('não registra o Electron de desenvolvimento na inicialização', () => {
  let calls = 0;
  const changed = syncWindowsStartup({
    isPackaged: false,
    setLoginItemSettings: () => { calls += 1; }
  }, true, { platform: 'win32' });
  assert.equal(changed, false);
  assert.equal(calls, 0);
});

test('menu da bandeja abre, alterna inicialização e encerra explicitamente', () => {
  const calls = [];
  const menu = createTrayMenuTemplate({
    startupEnabled: true,
    onShow: () => calls.push('show'),
    onToggleStartup: (enabled) => calls.push(`startup:${enabled}`),
    onQuit: () => calls.push('quit')
  });
  menu[0].click();
  menu[2].click({ checked: false });
  menu[4].click();
  assert.deepEqual(calls, ['show', 'startup:false', 'quit']);
});
