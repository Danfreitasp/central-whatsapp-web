const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWhatsAppConversationHistory } = require('../src/whatsapp-conversation-capture');

const record = (id, timestampMs) => ({ id, timestampMs, sequence: 0, type: 'chat' });
const snapshot = messages => ({ ok: true, chat: { id: 'chat' }, messages });

function viewWithEdges(edges = []) {
  let reads = 0;
  return { get edgeReads() { return reads; }, executeJavaScript: async source => {
    if (source.includes('__centralCaptureMessage')) return { ok: true };
    if (source.includes('__centralCaptureEdge:top')) return edges[reads++] || { historyLoading: false, phoneHistoryNotice: false };
    if (source.includes("const main = document.querySelector('#main')")) return { ok: true };
    if (source.includes('__centralMessagePosition')) return undefined;
    throw new Error('Operação inesperada durante o carregamento');
  }, capturePage: () => assert.fail('Não deve capturar antes de estabilizar o histórico') };
}

test('reconsulta o histórico após rolar e inclui mensagens antigas que chegam em lotes', async () => {
  const m1 = record('m1', 1), m2 = record('m2', 2), m3 = record('m3', 3), m4 = record('m4', 4);
  const responses = [snapshot([m3, m4]), snapshot([m2, m3]), snapshot([m1, m2])];
  const view = viewWithEdges();
  let reads = 0;
  const result = await loadWhatsAppConversationHistory(view, snapshot([m3, m4]), async () => responses[Math.min(reads++, 2)], () => {}, { historyStableRounds: 2 });
  assert.deepEqual(result.conversation.messages.map(message => message.id), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(result.initialMessageCount, 2);
  assert.equal(reads, 5);
  assert.equal(view.edgeReads, 5);
});

test('não interpreta uma lista estável como pronta enquanto há indicador de carregamento', async () => {
  const initial = snapshot([record('m1', 1)]);
  const view = viewWithEdges([{ historyLoading: true }, { historyLoading: true }]);
  const result = await loadWhatsAppConversationHistory(view, initial, async () => initial, () => {}, { historyStableRounds: 2 });
  assert.equal(result.rounds, 4);
});

test('interrompe antes dos prints quando o WhatsApp ainda pede histórico do celular', async () => {
  const initial = snapshot([record('m1', 1)]);
  await assert.rejects(loadWhatsAppConversationHistory(viewWithEdges([{ phoneHistoryNotice: true }]), initial, () => assert.fail('Não deve declarar o histórico pronto')), /Nenhum ZIP foi gerado/);
});

test('cancelar o carregamento impede avançar para os prints', async () => {
  const initial = snapshot([record('m1', 1)]);
  await assert.rejects(loadWhatsAppConversationHistory(viewWithEdges(), initial, () => initial, () => {}, { isCancelled: () => true }), error => error.code === 'backup_cancelled');
});
