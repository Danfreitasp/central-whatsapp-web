const MAX_SCHEDULED_DISPATCHES = 25;
const MIN_SCHEDULE_AHEAD_MS = 15_000;

function validateScheduledAt(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return { ok: false, error: 'Informe uma data e hora válidas.' };
  if (timestamp < now + MIN_SCHEDULE_AHEAD_MS) {
    return { ok: false, error: 'Escolha um horário pelo menos 15 segundos no futuro.' };
  }
  return { ok: true, timestamp, iso: new Date(timestamp).toISOString() };
}

function nextScheduleDelay(schedules, now = Date.now()) {
  const timestamps = (Array.isArray(schedules) ? schedules : [])
    .filter((item) => item?.status === 'pending' || item?.status === 'waiting')
    .map((item) => Date.parse(item.scheduledAt))
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return Math.max(1_000, Math.min(2_147_000_000, Math.min(...timestamps) - now));
}

module.exports = {
  MAX_SCHEDULED_DISPATCHES,
  validateScheduledAt,
  nextScheduleDelay
};
