const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { serializeWhatsAppId } = require('../src/conversation-backup');

// Executa a função de produção que injeta a consulta, sem iniciar o Electron
// ou acessar qualquer sessão real do WhatsApp.
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const source = main.match(/async function extractActiveConversation\(view\) \{[\s\S]*?\n\}\n\nasync function downloadConversationAudio/)[0].split('\n\nasync function downloadConversationAudio')[0];
const extract = vm.runInNewContext(`(${source})`, { serializeWhatsAppId });

function page(messages, localCalls = []) {
  return { webContents: { executeJavaScript: code => vm.runInNewContext(code, {
    WPP: { chat: {
      getActiveChat: () => ({ id: { _serialized: '123@lid' }, name: 'Conversa de teste', msgs: { getModelsArray: () => localCalls } }),
      getMessages: async (_id, options) => { assert.equal(options.includeCallMessages, undefined); return messages; }
    } },
    // O timer de dois minutos não precisa manter este teste vivo.
    setTimeout: callback => { const timer = setTimeout(callback, 120000); timer.unref(); return timer; }
  }) } };
}

test('extrai IDs distintos de objetos copiados em vez de [object Object]', async () => {
  const result = await extract(page([
    { id: { _serialized: 'false_123@lid_OLD', fromMe: false }, t: 100, body: 'Primeira', type: 'chat' },
    { id: { id: 'NEW', remote: { user: '123', server: 'lid' }, fromMe: true }, t: 200, body: 'Segunda', type: 'chat' }
  ]));
  assert.equal(result.ok, true);
  assert.equal(result.chat.id, '123@lid');
  assert.deepEqual(Array.from(result.messages, message => message.id), ['false_123@lid_OLD', 'true_123@lid_NEW']);
});

test('não mistura chamadas de outras conversas nem infla a contagem de mensagens', async () => {
  const current = Array.from({ length: 23 }, (_, index) => ({ id: { _serialized: `false_123@lid_MSG${index}` }, type: index === 0 ? 'ptt' : 'chat', t: index + 100 }));
  const foreignCalls = Array.from({ length: 179 }, (_, index) => ({ id: { _serialized: `true_${999 + index}@lid_CALL${index}` }, type: 'call_log', t: index + 100 }));
  const ownCall = { id: { _serialized: 'true_123@lid_LOCALCALL' }, type: 'call_log', t: 100 };
  const result = await extract(page([...current, ...foreignCalls], [ownCall, foreignCalls[0]]));
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 24);
  assert.equal(result.messages.filter(message => message.type === 'call_log').length, 1);
  assert.equal(result.messages.filter(message => message.isAudio).length, 1);
});

test('recusa uma mensagem sem chave recuperável antes de aguardar a captura', async () => {
  const result = await extract(page([{ id: {}, t: 100, body: 'Mensagem', type: 'chat' }]));
  assert.equal(result.ok, false);
  assert.match(result.error, /identificador válido/);
  assert.equal(result.diagnostic.stage, 'history-id');
  assert.equal(result.diagnostic.invalidIdCount, 1);
});
