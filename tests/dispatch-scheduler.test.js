const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateScheduledAt,
  nextScheduleDelay,
  scheduledProfileIds,
  scheduleHasBusyProfile,
  selectDueSchedule,
  startScheduledDispatch
} = require('../src/dispatch-scheduler');

test('aceita somente agendamentos futuros', () => {
  const now = Date.parse('2026-07-31T12:00:00.000Z');
  assert.equal(validateScheduledAt('2026-07-31T12:00:10.000Z', now).ok, false);
  assert.equal(validateScheduledAt('2026-07-31T12:01:00.000Z', now).ok, true);
});

test('calcula a espera para o agendamento pendente mais próximo', () => {
  const now = Date.parse('2026-07-31T12:00:00.000Z');
  const schedules = [
    { status: 'failed', scheduledAt: '2026-07-31T12:00:05.000Z' },
    { status: 'pending', scheduledAt: '2026-07-31T12:02:00.000Z' },
    { status: 'pending', scheduledAt: '2026-07-31T12:01:00.000Z' }
  ];
  assert.equal(nextScheduleDelay(schedules, now), 60_000);
});

test('reconhece todos os números de uma distribuição agendada', () => {
  assert.deepEqual(scheduledProfileIds({ type: 'distribution', profileIds: ['azul', 'verde', 'azul'] }), ['azul', 'verde']);
  assert.deepEqual(scheduledProfileIds({ profileId: 'vermelho' }), ['vermelho']);
  assert.equal(scheduleHasBusyProfile(
    { type: 'distribution', profileIds: ['azul', 'verde'] },
    (profileId) => profileId === 'verde'
  ), true);
});

test('prioriza um agendamento vencido cujos números estejam livres', () => {
  const now = Date.parse('2026-07-31T12:05:00.000Z');
  const schedules = [
    { id: 'ocupado', type: 'distribution', profileIds: ['azul', 'verde'], status: 'pending', scheduledAt: '2026-07-31T12:01:00.000Z' },
    { id: 'livre', profileId: 'vermelho', status: 'waiting', scheduledAt: '2026-07-31T12:02:00.000Z' }
  ];
  const selected = selectDueSchedule(schedules, now, (item) => scheduleHasBusyProfile(item, (id) => id === 'verde'));
  assert.equal(selected.id, 'livre');
});

test('inicia uma distribuição agendada uma única vez com a configuração preservada', () => {
  const calls = [];
  const input = { campaignId: 'campanha-1', profileIds: ['azul', 'verde'], distributionMode: 'balanced' };
  const result = startScheduledDispatch({ type: 'distribution', input }, {
    startDistribution: (received) => { calls.push(received); return { ok: true, distribution: { id: 'dist-1' } }; },
    startSingle: () => { throw new Error('não deveria iniciar disparo individual'); }
  });
  assert.deepEqual(calls, [input]);
  assert.equal(result.distribution.id, 'dist-1');
});
