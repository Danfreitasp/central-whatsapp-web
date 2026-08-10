const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDispatchFailures, createDispatchFailuresCsv } = require('../src/dispatch-failures');

test('mantém nome, telefone e motivo no relatório de falhas', () => {
  assert.deepEqual(normalizeDispatchFailures([{
    name: 'Maria',
    phone: '+55 (27) 99999-0000',
    reason: 'Número não localizado\nTente novamente.'
  }]), [{
    name: 'Maria',
    phone: '5527999990000',
    reason: 'Número não localizado Tente novamente.'
  }]);
});

test('gera CSV compatível com Excel em português', () => {
  const csv = createDispatchFailuresCsv([{ name: 'João', phone: '5527999990000', reason: 'Erro; "teste"' }]);
  assert.ok(csv.startsWith('\uFEFFNome;Telefone;Motivo\r\n'));
  assert.ok(csv.includes('"João";"5527999990000";"Erro; ""teste"""'));
});
