const test = require('node:test');
const assert = require('node:assert/strict');
const {
  totalUnread,
  indicatorLabel,
  spriteCellForUnread,
  createOverlayBitmap,
  addUnreadBadge
} = require('../src/notification-badge');

test('soma as mensagens não lidas e limita apenas o texto visual', () => {
  assert.equal(totalUnread([2, '3', -4, undefined]), 5);
  assert.equal(indicatorLabel(5), '5');
  assert.equal(indicatorLabel(120), '99+');
});

test('gera bitmap BGRA do indicador numérico', () => {
  const bitmap = createOverlayBitmap(12);
  assert.equal(bitmap.length, 16 * 16 * 4);
  assert.ok(bitmap.some((value) => value !== 0));
});

test('localiza contadores de 1 a 99+ na folha personalizada', () => {
  assert.deepEqual(spriteCellForUnread(1), { x: 0, y: 0, width: 64, height: 64 });
  assert.deepEqual(spriteCellForUnread(12), { x: 64, y: 64, width: 64, height: 64 });
  assert.deepEqual(spriteCellForUnread(99), { x: 512, y: 576, width: 64, height: 64 });
  assert.deepEqual(spriteCellForUnread(120), { x: 576, y: 576, width: 64, height: 64 });
});

test('adiciona o selo personalizado sem alterar o bitmap original do ícone', () => {
  const source = Buffer.alloc(16 * 16 * 4, 20);
  const badge = Buffer.alloc(8 * 8 * 4, 255);
  const result = addUnreadBadge(source, 16, 16, badge, 8, 8);
  assert.notDeepEqual(result, source);
  assert.equal(source.every((value) => value === 20), true);
});

test('usa a arte personalizada como fundo do contador', () => {
  const badge = Buffer.alloc(16 * 16 * 4, 37);
  const result = createOverlayBitmap(1, 16, badge);
  assert.equal(result.length, badge.length);
  assert.ok(result.some((value, index) => value !== badge[index]));
});
