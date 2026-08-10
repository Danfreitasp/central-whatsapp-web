const test = require('node:test');
const assert = require('node:assert/strict');
const { validateScheduledAt, nextScheduleDelay } = require('../src/dispatch-scheduler');

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
