const test = require('node:test');
const assert = require('node:assert/strict');
const { applySemNomeVariantsMigration } = require('../src/template-migrations');

test('adiciona quatro variações de Sem nome com as opções 1 e 2', () => {
  let sequence = 0;
  const result = applySemNomeVariantsMigration(
    [{ id: 'base', name: 'Sem nome', body: 'Texto original' }],
    { memoryMode: 'fast' },
    () => `novo-${sequence += 1}`
  );
  assert.equal(result.added, 4);
  const generated = result.templates.slice(0, 4);
  generated.forEach((template) => {
    assert.match(template.body, /\n1\s*-/);
    assert.match(template.body, /\n2\s*-/);
  });
});

test('a migração é executada uma única vez, mesmo que um modelo seja apagado depois', () => {
  const first = applySemNomeVariantsMigration(
    [{ id: 'base', name: 'Sem nome', body: 'Texto original' }],
    {},
    () => crypto.randomUUID()
  );
  const afterDeletion = first.templates.slice(1);
  const second = applySemNomeVariantsMigration(afterDeletion, first.settings, () => crypto.randomUUID());
  assert.equal(second.added, 0);
  assert.equal(second.templates.length, afterDeletion.length);
});
