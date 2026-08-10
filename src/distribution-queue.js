function normalizeTarget(target, leadCount) {
  const count = Math.max(0, Number(leadCount) || 0);
  return Math.max(1, Math.min(count, Number(target) || 1));
}

function createDistributionQueue(leads, target, profileIds, profileTargets = {}) {
  const items = Array.isArray(leads) ? [...leads] : [];
  if (!items.length) throw new Error('A distribuição precisa de pelo menos um contato.');
  const profiles = [...new Set((Array.isArray(profileIds) ? profileIds : []).map(String).filter(Boolean))];
  if (!profiles.length) throw new Error('Selecione pelo menos um número remetente.');

  const successTarget = normalizeTarget(target, items.length);
  const inFlight = new Map();
  const retryIndexes = [];
  const profileStats = new Map(profiles.map((profileId) => [profileId, {
    claimed: 0,
    sent: 0,
    errors: 0,
    inFlight: 0,
    target: Math.max(0, Number(profileTargets?.[profileId]) || 0)
  }]));
  let nextIndex = 0;
  let sent = 0;
  let errors = 0;
  let stopped = false;
  let tokenSequence = 0;

  function claim(profileId, eligibleProfileIds) {
    const id = String(profileId || '');
    if (!profileStats.has(id)) return { status: 'done' };
    if (stopped || sent >= successTarget) return { status: 'done' };
    const stats = profileStats.get(id);
    if (stats.target && stats.sent >= stats.target) return { status: 'done' };
    if (stats.target && stats.sent + stats.inFlight >= stats.target) return { status: 'wait' };
    if (sent + inFlight.size >= successTarget) return { status: 'wait' };
    if (!retryIndexes.length && nextIndex >= items.length) return { status: inFlight.size ? 'wait' : 'done' };

    const hasCustomTargets = profiles.some((profileId) => profileStats.get(profileId).target > 0);
    if (!hasCustomTargets) {
      const eligible = new Set((Array.isArray(eligibleProfileIds) ? eligibleProfileIds : profiles).map(String));
      eligible.add(id);
      const balancingScores = profiles
        .filter((profileId) => eligible.has(profileId))
        .map((profileId) => {
          const profile = profileStats.get(profileId);
          return profile.sent + profile.inFlight;
        });
      const lowestScore = Math.min(...balancingScores);
      if (stats.sent + stats.inFlight > lowestScore) return { status: 'wait' };
    }

    const index = retryIndexes.length ? retryIndexes.shift() : nextIndex++;
    const token = `${id}:${index}:${tokenSequence++}`;
    const assignment = { token, index, profileId: id, lead: items[index] };
    inFlight.set(token, assignment);
    stats.claimed += 1;
    stats.inFlight += 1;
    return { status: 'claimed', assignment };
  }

  function complete(token, outcome) {
    const assignment = inFlight.get(String(token || ''));
    if (!assignment) return false;
    inFlight.delete(assignment.token);
    const stats = profileStats.get(assignment.profileId);
    stats.inFlight = Math.max(0, stats.inFlight - 1);
    if (outcome === 'sent') {
      sent += 1;
      stats.sent += 1;
    } else {
      errors += 1;
      stats.errors += 1;
    }
    return true;
  }

  function release(token) {
    const assignment = inFlight.get(String(token || ''));
    if (!assignment) return false;
    inFlight.delete(assignment.token);
    const stats = profileStats.get(assignment.profileId);
    stats.inFlight = Math.max(0, stats.inFlight - 1);
    retryIndexes.push(assignment.index);
    return true;
  }

  function stop() {
    stopped = true;
  }

  function snapshot() {
    return {
      target: successTarget,
      sent,
      errors,
      attempted: sent + errors,
      claimed: nextIndex,
      candidateCount: items.length,
      remainingCandidates: retryIndexes.length + Math.max(0, items.length - nextIndex),
      inFlight: inFlight.size,
      stopped,
      finished: stopped || sent >= successTarget || (retryIndexes.length === 0 && nextIndex >= items.length && inFlight.size === 0),
      profiles: profiles.map((profileId) => ({ profileId, ...profileStats.get(profileId) }))
    };
  }

  return { claim, complete, release, stop, snapshot };
}

module.exports = { normalizeTarget, createDistributionQueue };
