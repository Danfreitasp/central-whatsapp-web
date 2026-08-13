const NOTIFICATION_ARGUMENT_PREFIX = 'central-whatsapp-profile=';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function notificationLaunchArgument(profileId, chatId = '') {
  const profile = encodeURIComponent(String(profileId || ''));
  const chat = String(chatId || '');
  return `${NOTIFICATION_ARGUMENT_PREFIX}${profile}${chat ? `&chat=${encodeURIComponent(chat)}` : ''}`;
}

function notificationTargetFromActivation(argumentsValue) {
  const raw = String(argumentsValue || '');
  if (!raw.startsWith(NOTIFICATION_ARGUMENT_PREFIX)) return { profileId: '', chatId: '' };
  const [encodedProfile, ...parameters] = raw.slice(NOTIFICATION_ARGUMENT_PREFIX.length).split('&');
  try {
    const chatParameter = parameters.find((parameter) => parameter.startsWith('chat='));
    return {
      profileId: decodeURIComponent(encodedProfile),
      chatId: chatParameter ? decodeURIComponent(chatParameter.slice(5)) : ''
    };
  } catch {
    return { profileId: '', chatId: '' };
  }
}

function profileIdFromNotificationActivation(argumentsValue) {
  return notificationTargetFromActivation(argumentsValue).profileId;
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

function createProfileNotificationToast(profile, unread, chat = {}) {
  const count = Math.max(1, Number(unread) || 1);
  const title = `WhatsApp — ${String(profile?.name || 'Número')}`;
  const chatName = String(chat?.name || '').trim();
  const body = chatName || (count === 1 ? 'Você tem 1 conversa não lida.' : `Você tem ${count} conversas não lidas.`);
  const launch = notificationLaunchArgument(profile?.id, chat?.id);
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
  notificationTargetFromActivation,
  profileIdFromNotificationActivation,
  resolveNotificationProfileId,
  profileIdFromActivatedViews,
  createProfileNotificationToast,
  createNotificationShortcutDetails
};
