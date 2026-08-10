const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChromeVersion, createWhatsAppUserAgent } = require('../src/whatsapp-user-agent');

test('usa a versão real do Chromium no identificador enviado ao WhatsApp', () => {
  const userAgent = createWhatsAppUserAgent('150.0.7339.12');

  assert.match(userAgent, /Chrome\/150\.0\.7339\.12/);
  assert.doesNotMatch(userAgent, /Electron/);
});

test('completa versões curtas do Chromium com quatro partes', () => {
  assert.equal(normalizeChromeVersion('150'), '150.0.0.0');
  assert.equal(normalizeChromeVersion('150.1'), '150.1.0.0');
});

test('recusa uma versão inválida em vez de anunciar um navegador antigo', () => {
  assert.throws(() => createWhatsAppUserAgent('versão desconhecida'), /Chromium indisponível/);
});
