const test = require('node:test');
const assert = require('node:assert/strict');
const { audioBackupFilename, audioExtension, sanitizeBackupName } = require('../src/conversation-backup');

test('gera nome seguro e extensão compatível com o áudio', () => {
  assert.equal(sanitizeBackupName('João / Cliente: 27'), 'joao-cliente-27');
  assert.equal(audioExtension('audio/ogg; codecs=opus'), 'ogg');
  assert.equal(audioExtension('audio/mpeg'), 'mp3');
});

test('numera os áudios cronologicamente com data e direção no nome', () => {
  assert.equal(
    audioBackupFilename({ timestampMs: Date.UTC(2026, 7, 5, 21, 30, 45), fromMe: true }, 1, 'audio/ogg; codecs=opus'),
    '002-2026-08-05-18-30-45-enviado.ogg'
  );
  assert.match(
    audioBackupFilename({ timestampMs: Date.UTC(2026, 7, 5, 21, 31), fromMe: false }, 2, 'audio/mpeg'),
    /^003-.*-recebido\.mp3$/
  );
});
