const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWebUrl,
  isInternalNavigation,
  openWebUrlExternally,
  configureExternalNavigation
} = require('../src/external-navigation');

test('aceita somente links web seguros', () => {
  assert.equal(parseWebUrl('https://example.com/path').href, 'https://example.com/path');
  assert.equal(parseWebUrl('http://example.com').href, 'http://example.com/');
  assert.equal(parseWebUrl('javascript:alert(1)'), null);
  assert.equal(parseWebUrl('file:///C:/Windows/System32'), null);
  assert.equal(parseWebUrl('data:text/html,teste'), null);
});

test('distingue a navegação interna do WhatsApp de um link externo', () => {
  assert.equal(isInternalNavigation('https://web.whatsapp.com/app', 'https://web.whatsapp.com/'), true);
  assert.equal(isInternalNavigation('https://example.com', 'https://web.whatsapp.com/'), false);
});

test('abre link web no navegador padrão e rejeita protocolo inseguro', () => {
  const opened = [];
  assert.equal(openWebUrlExternally('https://example.com', (url) => opened.push(url)), true);
  assert.equal(openWebUrlExternally('javascript:alert(1)', (url) => opened.push(url)), false);
  assert.deepEqual(opened, ['https://example.com/']);
});

test('encaminha novas janelas e navegações externas sem tirar a Central do WhatsApp', () => {
  const listeners = {};
  let windowHandler;
  const opened = [];
  const webContents = {
    setWindowOpenHandler: (handler) => { windowHandler = handler; },
    on: (event, handler) => { listeners[event] = handler; }
  };
  configureExternalNavigation(webContents, {
    internalOrigin: 'https://web.whatsapp.com/',
    openExternal: (url) => opened.push(url)
  });

  assert.deepEqual(windowHandler({ url: 'https://example.com/documento' }), { action: 'deny' });
  const externalEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners['will-navigate'](externalEvent, 'https://openai.com/');
  const internalEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners['will-navigate'](internalEvent, 'https://web.whatsapp.com/app');

  assert.equal(externalEvent.prevented, true);
  assert.equal(internalEvent.prevented, false);
  assert.deepEqual(opened, ['https://example.com/documento', 'https://openai.com/']);
});
