function normalizeEffectiveTarget(campaignId, value, candidateCount) {
  if (!String(campaignId || '').trim()) return 0;
  const total = Math.max(0, Number(candidateCount) || 0);
  if (!total) return 0;
  return Math.max(1, Math.min(total, Number(value) || 50));
}

function effectiveTargetReached(sent, target) {
  return Number(target) > 0 && Number(sent) >= Number(target);
}

function initialFailureCount(candidateCount, target) {
  const total = Math.max(0, Number(candidateCount) || 0);
  return Number(target) > 0 ? Math.min(total, Number(target)) : total;
}

module.exports = { normalizeEffectiveTarget, effectiveTargetReached, initialFailureCount };
