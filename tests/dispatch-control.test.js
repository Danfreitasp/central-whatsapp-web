const test = require('node:test');
const assert = require('node:assert/strict');
const {
  releasesProfileBetweenSends,
  shouldWaitAfterDispatchAttempt,
  isDispatchProfileLocked,
  canStartDispatchForProfile
} = require('../src/dispatch-control');

test('libera o perfil somente quando o intervalo passa de 30 segundos', () => {
  assert.equal(releasesProfileBetweenSends(30), false);
  assert.equal(releasesProfileBetweenSends(31), true);
});

test('aplica cooldown somente depois de um envio confirmado', () => {
  assert.equal(shouldWaitAfterDispatchAttempt('sent'), true);
  assert.equal(shouldWaitAfterDispatchAttempt('error'), false);
});

test('em intervalo longo, bloqueia o perfil apenas durante o envio', () => {
  const state = { running: true, profileId: 'vermelho', releaseBetweenSends: true, sending: false };
  assert.equal(isDispatchProfileLocked(state, 'vermelho'), false);
  state.sending = true;
  assert.equal(isDispatchProfileLocked(state, 'vermelho'), true);
});

test('em intervalo curto, mantém o perfil reservado durante o lote', () => {
  const state = { running: true, profileId: 'vermelho', releaseBetweenSends: false, sending: false };
  assert.equal(isDispatchProfileLocked(state, 'vermelho'), true);
  assert.equal(isDispatchProfileLocked(state, 'azul'), false);
});

test('permite lotes paralelos em perfis diferentes, mas apenas um por perfil', () => {
  const states = new Map([
    ['vermelho', { running: true, profileId: 'vermelho' }]
  ]);
  assert.equal(canStartDispatchForProfile(states, 'vermelho'), false);
  assert.equal(canStartDispatchForProfile(states, 'azul'), true);
});
