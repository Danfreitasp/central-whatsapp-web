const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeGlobalSearchQuery,
  normalizeGlobalSearchMode,
  queryMatches,
  sortGlobalSearchResults
} = require('../src/global-search');

test('global search matches names without accents and formatted telephone numbers', () => {
  const nameQuery = normalizeGlobalSearchQuery('João');
  const phoneQuery = normalizeGlobalSearchQuery('(27) 99999-1234');

  assert.equal(queryMatches('JOAO DA SILVA', nameQuery), true);
  assert.equal(queryMatches('+55 27 99999-1234', phoneQuery), true);
  assert.equal(queryMatches('Maria', nameQuery), false);
});

test('global search accepts only the explicit quick and complete modes', () => {
  assert.equal(normalizeGlobalSearchMode('quick'), 'quick');
  assert.equal(normalizeGlobalSearchMode('complete'), 'complete');
  assert.equal(normalizeGlobalSearchMode('unexpected'), 'quick');
});

test('global search rejects queries that are too short', () => {
  assert.throws(() => normalizeGlobalSearchQuery('a'), /pelo menos 2 letras/);
  assert.throws(() => normalizeGlobalSearchQuery('12'), /pelo menos 2 letras/);
});

test('global results are ordered by newest match and then by conversation', () => {
  const sorted = sortGlobalSearchResults([
    { chatName: 'Zeta', timestamp: 10 },
    { chatName: 'Ana', timestamp: 20 },
    { chatName: 'Bia', timestamp: 20 }
  ]);
  assert.deepEqual(sorted.map((item) => item.chatName), ['Ana', 'Bia', 'Zeta']);
});
