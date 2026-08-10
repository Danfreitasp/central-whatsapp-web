const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHeader, detectPhoneColumn } = require('../src/renderer/dispatch-columns');

test('reconhece variações comuns do título da coluna de telefone', () => {
  for (const header of ['Telefone', 'NÚMERO', 'Tel.', 'Celular cliente', 'WhatsApp', 'Nº telefone']) {
    const detected = detectPhoneColumn([{ [header]: '27999998888', Nome: 'Cliente' }]);
    assert.equal(detected.header, header);
    assert.equal(detected.detectedBy, 'header');
  }
  assert.equal(normalizeHeader('Nº Telefone'), 'n_telefone');
});

test('infere a coluna pelo conteúdo quando o título não explica o campo', () => {
  const rows = [
    { CampoA: 'Maria', CampoB: '(27) 99999-1111' },
    { CampoA: 'João', CampoB: '27988882222' },
    { CampoA: 'Ana', CampoB: '+55 27 99977-3333' }
  ];
  const detected = detectPhoneColumn(rows);
  assert.equal(detected.header, 'CampoB');
  assert.equal(detected.detectedBy, 'values');
});

test('não confunde uma coluna declarada como CPF com telefone', () => {
  const detected = detectPhoneColumn([
    { CPF: '12999998888', Cliente: 'Maria' },
    { CPF: '27912345678', Cliente: 'João' }
  ]);
  assert.equal(detected, null);
});
