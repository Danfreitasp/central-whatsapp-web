const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDispatchHistory, filterDispatchHistory, createDispatchHistoryCsv } = require('../src/dispatch-history');

function entry(id, status = 'sent', overrides = {}) {
  return {
    id,
    batchId: 'lote-1',
    occurredAt: `2026-08-03T12:00:0${id}.000Z`,
    profileId: 'vermelho',
    profileName: 'Telefone Vermelho',
    name: `Cliente ${id}`,
    phone: `552799999000${id}`,
    modelName: 'Simulação disponível',
    status,
    reason: status === 'error' ? 'Destinatário não encontrado' : '',
    ...overrides
  };
}

test('mantém os registros mais recentes e respeita o limite', () => {
  const history = mergeDispatchHistory([entry('1')], [entry('3'), entry('2')], 2);
  assert.deepEqual(history.map((item) => item.id), ['3', '2']);
});

test('filtra histórico por perfil, resultado e pesquisa', () => {
  const history = [
    entry('1'),
    entry('2', 'error', { profileId: 'azul', profileName: 'iPhone', name: 'Genaro' })
  ];
  assert.deepEqual(filterDispatchHistory(history, { status: 'error' }).map((item) => item.id), ['2']);
  assert.deepEqual(filterDispatchHistory(history, { profileId: 'azul', query: 'genaro' }).map((item) => item.id), ['2']);
});

test('exporta CSV compatível com Excel contendo modelo, status e motivo', () => {
  const csv = createDispatchHistoryCsv([entry('2', 'error')]);
  assert.ok(csv.startsWith('\uFEFFsep=;'));
  assert.match(csv, /"Modelo"/);
  assert.match(csv, /"Erro"/);
  assert.match(csv, /"Destinatário não encontrado"/);
});
