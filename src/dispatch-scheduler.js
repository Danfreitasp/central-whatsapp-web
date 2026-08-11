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

function scheduledProfileIds(schedule) {
  const ids = schedule?.type === 'distribution'
    ? schedule?.profileIds
    : [schedule?.profileId];
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
}

function scheduleHasBusyProfile(schedule, isProfileBusy) {
  if (typeof isProfileBusy !== 'function') return false;
  return scheduledProfileIds(schedule).some((profileId) => isProfileBusy(profileId));
}

function selectDueSchedule(schedules, now = Date.now(), isBlocked = () => false) {
  const dueItems = (Array.isArray(schedules) ? schedules : [])
    .filter((item) => ['pending', 'waiting'].includes(item?.status || 'pending') && Date.parse(item?.scheduledAt) <= now)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return dueItems.find((item) => !isBlocked(item)) || dueItems[0] || null;
}

function startScheduledDispatch(schedule, handlers = {}) {
  if (schedule?.type === 'distribution') {
    if (typeof handlers.startDistribution !== 'function') throw new TypeError('startDistribution é obrigatório.');
    return handlers.startDistribution(schedule.input);
  }
  if (typeof handlers.startSingle !== 'function') throw new TypeError('startSingle é obrigatório.');
  return handlers.startSingle(schedule?.input, schedule?.profileId);
}

module.exports = {
  MAX_SCHEDULED_DISPATCHES,
  validateScheduledAt,
  nextScheduleDelay,
  scheduledProfileIds,
  scheduleHasBusyProfile,
  selectDueSchedule,
  startScheduledDispatch
};
