const test = require('node:test');
const assert = require('node:assert/strict');
const { isLikelyBlankBitmap } = require('../src/browser-surface-health');

function bitmap(pixels) {
  return Buffer.from(pixels.flatMap(([red, green, blue]) => [blue, green, red, 255]));
}

test('reconhece superfícies uniformes pretas e cinzas', () => {
  assert.equal(isLikelyBlankBitmap(bitmap(Array(40).fill([4, 4, 4]))), true);
  assert.equal(isLikelyBlankBitmap(bitmap(Array(40).fill([128, 128, 128]))), true);
  assert.equal(isLikelyBlankBitmap(bitmap(Array(40).fill([55, 55, 55]))), true);
  assert.equal(isLikelyBlankBitmap(bitmap(Array(40).fill([17, 27, 33]))), true);
  assert.equal(isLikelyBlankBitmap(Buffer.alloc(160)), true);
});

test('não confunde uma interface com variação visual com tela vazia', () => {
  const pixels = Array.from({ length: 40 }, (_, index) => (
    index % 3 === 0 ? [0, 168, 132] : index % 2 === 0 ? [240, 242, 245] : [17, 27, 33]
  ));
  assert.equal(isLikelyBlankBitmap(bitmap(pixels)), false);
});
