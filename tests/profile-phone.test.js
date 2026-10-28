const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, formatPhone } = require('../src/renderer/profile-phone');

test('normaliza números brasileiros com e sem o código do país', () => {
  assert.equal(normalizePhone('(27) 99999-1111'), '5527999991111');
  assert.equal(normalizePhone('27988882222'), '5527988882222');
  assert.equal(normalizePhone('+55 27 99977-3333'), '5527999773333');
  assert.equal(normalizePhone('027 99999-1111'), '5527999991111');
});

test('descarta telefones vazios ou com quantidade inválida de dígitos', () => {
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone('   '), '');
  assert.equal(normalizePhone('1234'), '');
  assert.equal(normalizePhone('1234567890123456'), '');
});

test('formata o telefone para exibição abaixo do nome', () => {
  assert.equal(formatPhone('5527999991111'), '+55 (27) 99999-1111');
  assert.equal(formatPhone('5527988882222'), '+55 (27) 98888-2222');
  assert.equal(formatPhone('551133334444'), '+55 (11) 3333-4444');
  assert.equal(formatPhone(''), '');
});
