const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessageVariants, createSuccessfulVariantRotation } = require('../src/message-variant-rotation');

const variants = [
  { id: 'a', name: 'Modelo A', body: 'Mensagem A' },
  { id: 'b', name: 'Modelo B', body: 'Mensagem B' },
  { id: 'c', name: 'Modelo C', body: 'Mensagem C' }
];

test('não repete o último modelo enviado quando tentativas intermediárias falham', () => {
  const rotation = createSuccessfulVariantRotation(variants, () => 0);
  const successful = [];

  successful.push(rotation.next().id);
  rotation.complete(true);

  rotation.next();
  rotation.complete(false);
  rotation.next();
  rotation.complete(false);

  successful.push(rotation.next().id);
  rotation.complete(true);
  successful.push(rotation.next().id);
  rotation.complete(true);

  assert.notEqual(successful[0], successful[1]);
  assert.notEqual(successful[1], successful[2]);
});

test('mantém a rotação independente por número remetente', () => {
  const first = createSuccessfulVariantRotation(variants, () => 0.4);
  const second = createSuccessfulVariantRotation(variants, () => 0.4);

  const firstSent = first.next().id;
  first.complete(true);
  const secondSent = second.next().id;
  second.complete(true);

  assert.notEqual(first.next().id, firstSent);
  assert.notEqual(second.next().id, secondSent);
});

test('descarta variantes duplicadas ou vazias antes do rodízio', () => {
  assert.deepEqual(normalizeMessageVariants([
    { id: 'a', name: 'A', body: 'Mensagem' },
    { id: 'b', name: 'B', body: '  MENSAGEM  ' },
    { id: '', name: 'C', body: 'Outra' }
  ]), [{ id: 'a', name: 'A', body: 'Mensagem' }]);
});
