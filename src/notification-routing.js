const NOTIFICATION_ARGUMENT_PREFIX = 'central-whatsapp-profile=';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function notificationLaunchArgument(profileId) {
  return `${NOTIFICATION_ARGUMENT_PREFIX}${encodeURIComponent(String(profileId || ''))}`;
}

function profileIdFromNotificationActivation(argumentsValue) {
  const raw = String(argumentsValue || '');
  if (!raw.startsWith(NOTIFICATION_ARGUMENT_PREFIX)) return '';
  try {
    return decodeURIComponent(raw.slice(NOTIFICATION_ARGUMENT_PREFIX.length));
  } catch {
    return '';
  }
}

function resolveNotificationProfileId(argumentsValue, profileIds) {
  const ids = Array.isArray(profileIds) ? profileIds.map(String) : [];
  const raw = String(argumentsValue || '');
  const encoded = profileIdFromNotificationActivation(raw);
  if (ids.includes(encoded)) return encoded;
  if (ids.includes(raw)) return raw;
  return ids.length === 1 ? ids[0] : '';
}

function profileIdFromActivatedViews(viewStates, activeProfileId) {
  const states = Array.isArray(viewStates) ? viewStates : [];
  const activeId = String(activeProfileId || '');
  const focused = states.find((state) => state?.focused && String(state.id || '') !== activeId);
  if (focused) return String(focused.id || '');
  const top = states.find((state) => state?.top && String(state.id || '') !== activeId);
  return top ? String(top.id || '') : '';
}

function createProfileNotificationToast(profile, unread) {
  const count = Math.max(1, Number(unread) || 1);
  const title = `WhatsApp — ${String(profile?.name || 'Número')}`;
  const body = count === 1 ? 'Você tem 1 mensagem não lida.' : `Você tem ${count} mensagens não lidas.`;
  const launch = notificationLaunchArgument(profile?.id);
  return `<toast launch="${escapeXml(launch)}"><visual><binding template="ToastGeneric"><text>${escapeXml(title)}</text><text>${escapeXml(body)}</text></binding></visual></toast>`;
}

function createNotificationShortcutDetails(executablePath, appUserModelId, toastActivatorClsid) {
  return {
    target: executablePath,
    cwd: require('node:path').dirname(executablePath),
    description: 'Central WhatsApp Web',
    icon: executablePath,
    iconIndex: 0,
    appUserModelId,
    toastActivatorClsid
  };
}

module.exports = {
  NOTIFICATION_ARGUMENT_PREFIX,
  notificationLaunchArgument,
  profileIdFromNotificationActivation,
  resolveNotificationProfileId,
  profileIdFromActivatedViews,
  createProfileNotificationToast,
  createNotificationShortcutDetails
};
