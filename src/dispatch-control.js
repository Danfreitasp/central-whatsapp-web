const LONG_DISPATCH_INTERVAL_SECONDS = 30;

function releasesProfileBetweenSends(delaySec) {
  return Number(delaySec) > LONG_DISPATCH_INTERVAL_SECONDS;
}

function shouldWaitAfterDispatchAttempt(outcome) {
  return outcome === 'sent';
}

function isDispatchProfileLocked(state, profileId) {
  if (!state?.running || !profileId || state.profileId !== profileId) return false;
  return !state.releaseBetweenSends || Boolean(state.sending);
}

function canStartDispatchForProfile(states, profileId) {
  const state = states instanceof Map
    ? states.get(profileId)
    : (Array.isArray(states) ? states.find((item) => item?.profileId === profileId) : null);
  return !state?.running;
}

module.exports = {
  LONG_DISPATCH_INTERVAL_SECONDS,
  releasesProfileBetweenSends,
  shouldWaitAfterDispatchAttempt,
  isDispatchProfileLocked,
  canStartDispatchForProfile
};
