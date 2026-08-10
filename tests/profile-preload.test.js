const test = require('node:test');
const assert = require('node:assert/strict');
const { preloadProfiles } = require('../src/profile-preload');

test('inicia todos os perfis sem aguardar o carregamento do anterior', () => {
  const calls = [];
  const profiles = [{ id: 'vermelho' }, { id: 'azul' }, { id: 'verde' }];
  const count = preloadProfiles(profiles, {
    createView: (profile) => calls.push(`carregar:${profile.id}`),
    setActiveProfile: (id) => calls.push(`mostrar:${id}`)
  });

  assert.equal(count, 3);
  assert.deepEqual(calls, [
    'carregar:vermelho',
    'mostrar:vermelho',
    'carregar:azul',
    'carregar:verde'
  ]);
});
