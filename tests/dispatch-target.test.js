const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEffectiveTarget, effectiveTargetReached, initialFailureCount } = require('../src/dispatch-target');

test('usa a quantidade da campanha como meta de envios efetivos', () => {
  assert.equal(normalizeEffectiveTarget('campanha', 50, 1300), 50);
  assert.equal(normalizeEffectiveTarget('', 50, 1300), 0);
  assert.equal(normalizeEffectiveTarget('campanha', 2000, 1300), 1300);
});

test('continua após falhas até completar a meta de sucessos', () => {
  assert.equal(effectiveTargetReached(35, 50), false);
  assert.equal(effectiveTargetReached(50, 50), true);
  assert.equal(effectiveTargetReached(60, 0), false);
});

test('uma falha global não consome toda a reserva de candidatos', () => {
  assert.equal(initialFailureCount(1300, 50), 50);
  assert.equal(initialFailureCount(1300, 0), 1300);
});
