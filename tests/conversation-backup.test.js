const test = require('node:test');
const assert = require('node:assert/strict');
const { audioBackupFilename, audioExtension, sanitizeBackupName } = require('../src/conversation-backup');
const { downloadConversationAudios, conversationCapturePlan, serializeWhatsAppId } = require('../src/conversation-backup');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('prefere o ID serializado ao toString genérico ou desatualizado', () => {
  assert.equal(serializeWhatsAppId({ _serialized: 'false_123@lid_ABC' }), 'false_123@lid_ABC');
  assert.equal(serializeWhatsAppId({ _serialized: 'false_123@lid_ABC', toString: () => 'stale-id' }), 'false_123@lid_ABC');
  assert.equal(serializeWhatsAppId({}), '');
});

test('reconstrói IDs copiados sem métodos nativos a partir dos campos da MsgKey', () => {
  assert.equal(serializeWhatsAppId({ fromMe: false, remote: { user: '123', server: 'lid' }, id: 'ABC' }), 'false_123@lid_ABC');
  assert.equal(serializeWhatsAppId({ fromMe: true, remote: { _serialized: '123@g.us' }, id: 'XYZ', participant: { user: '456', server: 'c.us' } }), 'true_123@g.us_XYZ_456@c.us');
});

test('preserva registros de chamada no relatório sem usá-los como alvos individuais dos prints', () => {
  const messages = [
    { id: 'm1', type: 'chat' },
    { id: 'call1', type: 'call_log', timestampMs: 1234, fromMe: true },
    { id: 'audio1', type: 'ptt', isAudio: true }
  ];
  const plan = conversationCapturePlan(messages);
  assert.deepEqual(plan.screenshotMessages.map(message => message.id), ['m1', 'audio1']);
  assert.deepEqual(plan.callRecords, [messages[1]]);
  assert.equal(messages.length, 3);
});

test('preserva o aviso de criptografia no relatório sem exigir uma bolha de mensagem para ele', () => {
  const system = { id: 'false_123@lid_SYSTEM', type: 'e2e_notification', timestampMs: 100 };
  const message = { id: 'false_123@lid_FIRST', type: 'chat', timestampMs: 200 };
  const plan = conversationCapturePlan([system, message]);
  assert.deepEqual(plan.screenshotMessages, [message]);
  assert.deepEqual(plan.systemRecords, [system]);
});

test('gera nome seguro e extensão compatível com o áudio', () => {
  assert.equal(sanitizeBackupName('João / Cliente: 27'), 'joao-cliente-27');
  assert.equal(audioExtension('audio/ogg; codecs=opus'), 'ogg');
  assert.equal(audioExtension('audio/mpeg'), 'mp3');
});

test('baixa até três áudios juntos, mantém a ordem dos nomes e relata mídias indisponíveis', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-audio-parallel-'));
  let active = 0;
  let maxActive = 0;
  const progress = [];
  const messages = Array.from({ length: 7 }, (_, index) => ({ id: String(index), timestampMs: Date.UTC(2026, 8, 30, 12, index), mimetype: 'audio/ogg' }));
  try {
    const result = await downloadConversationAudios(messages, directory, async id => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, id === '0' ? 40 : 5));
      active -= 1;
      return id === '2' ? { ok: false, error: 'Tempo limite excedido' } : { ok: true, type: 'audio/ogg', base64: Buffer.from(`audio-${id}`).toString('base64') };
    }, { onProgress: item => progress.push(item) });
    assert.equal(maxActive, 3);
    assert.equal(result.audioFiles.length, 6);
    assert.deepEqual(result.audioFiles.map(item => item.messageId), ['0', '1', '3', '4', '5', '6']);
    assert.equal(result.audioFailures[0].messageId, '2');
    assert.equal(result.audioFailures[0].reason, 'Tempo limite excedido');
    for (const item of result.audioFiles) assert.equal(fs.readFileSync(path.join(directory, item.filename), 'utf8'), `audio-${item.messageId}`);
    assert.equal(progress.at(-1).current, 7);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('aguarda os downloads em andamento ao cancelar, sem iniciar novos áudios', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-audio-cancel-'));
  let cancelled = false;
  let active = 0;
  const started = [];
  try {
    await assert.rejects(downloadConversationAudios(Array.from({ length: 9 }, (_, index) => ({ id: index })), directory, async id => {
      started.push(id);
      active += 1;
      await new Promise(resolve => setTimeout(resolve, id === 0 ? 5 : 20));
      cancelled = true;
      active -= 1;
      return { ok: true, base64: 'YQ==' };
    }, { isCancelled: () => cancelled }), error => error.code === 'backup_cancelled');
    assert.equal(active, 0);
    assert.equal(started.length, 3);
    assert.equal(fs.readdirSync(directory).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
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
