const test = require('node:test');
const assert = require('node:assert/strict');
const { createApplicationMenuTemplate } = require('../src/application-menu');

test('exibe a versão no menu nativo Help e preserva os menus padrões', () => {
  const template = createApplicationMenuTemplate('0.8.2');
  assert.deepEqual(template.slice(0, 4).map((item) => item.role), [
    'fileMenu',
    'editMenu',
    'viewMenu',
    'windowMenu'
  ]);
  assert.equal(template[4].label, 'Configurações');
  assert.equal(template[5].label, 'Help');
  assert.equal(template[5].submenu[0].label, 'Central WhatsApp Web — versão 0.8.2');
  assert.equal(template[5].submenu[0].enabled, false);
  assert.equal(template[5].submenu[2].label, 'Verificar atualizações…');
});

test('aciona a verificação manual pelo menu', () => {
  let checks = 0;
  const template = createApplicationMenuTemplate('0.8.2', { onCheckForUpdates: () => { checks += 1; } });
  template[5].submenu[2].click();
  assert.equal(checks, 1);
});

test('permite alternar a inicialização com o Windows pelo menu', () => {
  let enabled;
  const template = createApplicationMenuTemplate('0.8.2', {
    startupEnabled: true,
    onToggleStartup: (value) => { enabled = value; }
  });
  assert.equal(template[4].submenu[0].checked, true);
  template[4].submenu[0].click({ checked: false });
  assert.equal(enabled, false);
});
