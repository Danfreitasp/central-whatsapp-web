const test = require('node:test');
const assert = require('node:assert/strict');
const { assignMessageVariants } = require('../src/renderer/message-variants');

test('distribui todos os modelos sem repetir o mesmo consecutivamente', () => {
  const templates = [
    { id: 'texto-1', body: 'Mensagem 1' },
    { id: 'texto-2', body: 'Mensagem 2' },
    { id: 'texto-3', body: 'Mensagem 3' },
    { id: 'texto-4', body: 'Mensagem 4' }
  ];
  const assignments = assignMessageVariants(25, templates, () => 0.37);
  assert.equal(assignments.length, 25);
  for (let index = 1; index < assignments.length; index += 1) {
    assert.notEqual(assignments[index].id, assignments[index - 1].id);
  }
  assert.deepEqual(new Set(assignments.map((item) => item.id)), new Set(templates.map((item) => item.id)));
});

test('ignora modelos vazios e identificadores duplicados', () => {
  const assignments = assignMessageVariants(3, [
    { id: 'a', body: 'Primeiro' },
    { id: 'a', body: 'Duplicado' },
    { id: 'b', body: '' }
  ]);
  assert.deepEqual(assignments.map((item) => item.body), ['Primeiro', 'Primeiro', 'Primeiro']);
});

test('considera textos idênticos como uma única variação', () => {
  const assignments = assignMessageVariants(4, [
    { id: 'a', body: 'Olá, tudo bem?' },
    { id: 'b', body: '  OLÁ,   TUDO BEM?  ' }
  ]);
  assert.deepEqual(assignments.map((item) => item.id), ['a', 'a', 'a', 'a']);
});
