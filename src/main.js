const { app, BrowserWindow, BrowserView, clipboard, dialog, ipcMain, Menu, Notification, session, shell, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');
const { createWppRecipientRuntimeSource } = require('./dispatch-recipient');
const { createAppUpdater } = require('./app-updater');
const {
  releasesProfileBetweenSends,
  shouldWaitAfterDispatchAttempt,
  isDispatchProfileLocked,
  canStartDispatchForProfile
} = require('./dispatch-control');
const {
  MAX_SCHEDULED_DISPATCHES,
  validateScheduledAt,
  nextScheduleDelay,
  scheduledProfileIds,
  scheduleHasBusyProfile,
  selectDueSchedule,
  startScheduledDispatch
} = require('./dispatch-scheduler');
const { normalizeDispatchFailures, createDispatchFailuresCsv } = require('./dispatch-failures');
const { MAX_DISPATCH_HISTORY, mergeDispatchHistory, filterDispatchHistory, createDispatchHistoryCsv } = require('./dispatch-history');
const { preloadProfiles } = require('./profile-preload');
const { applySemNomeVariantsMigration } = require('./template-migrations');
const { normalizeMessageVariants, createSuccessfulVariantRotation } = require('./message-variant-rotation');
const { createApplicationMenuTemplate } = require('./application-menu');
const { isLikelyBlankImage } = require('./browser-surface-health');
const { syncWindowsStartup, createTrayMenuTemplate } = require('./windows-integration');
const {
  isBrowserViewAttached,
  keepBrowserViewReady,
  withTemporarilyAttachedBrowserView,
  isolateActiveBrowserView
} = require('./browser-view-lifecycle');
const {
  resolveNotificationProfileId,
  profileIdFromActivatedViews,
  notificationTargetFromActivation,
  createProfileNotificationToast,
  createNotificationShortcutDetails
} = require('./notification-routing');
const { totalUnread, indicatorLabel, spriteCellForUnread, createOverlayBitmap, addUnreadBadge } = require('./notification-badge');
const { CampaignStore, MAX_CAMPAIGN_CONTACTS, MAX_DISPATCH_CONTACTS } = require('./campaign-store');
const { normalizeEffectiveTarget, effectiveTargetReached } = require('./dispatch-target');
const { createWhatsAppUserAgent } = require('./whatsapp-user-agent');
const { createDistributionQueue } = require('./distribution-queue');
const { isWhatsAppSendConfirmed } = require('./dispatch-delivery-confirmation');
const { captureWhatsAppConversation } = require('./whatsapp-conversation-capture');
const {
  audioBackupFilename,
  sanitizeBackupName
} = require('./conversation-backup');
const {
  WHATSAPP_RESTRICTION_PATTERN_SOURCE,
  classifyDispatchSessionFailure,
  createDispatchSessionError,
  isDispatchSessionError
} = require('./dispatch-session-error');

const WHATSAPP_URL = 'https://web.whatsapp.com/';
// O WhatsApp Web rejeita o identificador "Electron" mesmo quando o Chromium
// embarcado é atual. Usa a versão real do Chromium para evitar que o site
// carregue uma interface incompatível ao alternar entre Conversas e Ligações.
const WHATSAPP_USER_AGENT = createWhatsAppUserAgent(process.versions.chrome);
const SIDEBAR_WIDTH = 252;
const TOPBAR_HEIGHT = 56;
const WHATSAPP_ALLOWED_PERMISSIONS = new Set(['media']);
const APP_USER_MODEL_ID = 'com.codex.centralwhatsappweb';
const TOAST_ACTIVATOR_CLSID = '{7C52F4A5-C1B8-4A32-A901-3B3BFFDC5D30}';
const WPP_CONNECT_PATH = path.join(__dirname, 'vendor', 'wppconnect-wa.js');

// Mantém o mesmo local de perfis e sessões na prévia e na versão instalada.
// Sem isso, o Electron aberto por "npm start" cria uma pasta isolada chamada
// "Electron" e parece não ter nenhum número conectado.
app.setPath('userData', path.join(app.getPath('appData'), 'central-whatsapp-web'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  // Disponível apenas em versões mais recentes do Electron.
  if (typeof app.setToastActivatorCLSID === 'function') {
    app.setToastActivatorCLSID(TOAST_ACTIVATOR_CLSID);
  }
}

let window;
let profiles = [];
let templates = [];
let labelsData = { labels: [], assignments: {} };
let settings = {};
let scheduledDispatches = [];
let dispatchHistory = [];
let campaignStore = null;
let scheduledDispatchTimer = null;
const views = new Map();
let activeProfileId = null;
const unreadByProfile = new Map();
let pendingNotificationProfileId = null;
let pendingNotificationChatId = null;
const notificationReadyProfiles = new Set();
const notificationRevisions = new Map();
const activeNotifications = new Set();
let wppConnectSource = null;
const dispatchStates = new Map();
const distributions = new Map();
const conversationBackupCancellations = new Set();
let profileSwitchRevision = 0;
let browserViewsSuspended = false;
let appUpdaterController = null;
let tray = null;
let trayBaseIcon = null;
let notificationBadgeIcon = null;
let notificationCountsIcon = null;
let isQuitting = false;
let surfaceHealthTimer = null;
const blankSurfaceStrikes = new Map();
const startHidden = process.argv.includes('--hidden');

function hasActiveDispatches() {
  return [...dispatchStates.values()].some((state) => state?.running);
}

function createDispatchState(profileId) {
  return {
    running: false,
    stopRequested: false,
    paused: false,
    sending: false,
    releaseBetweenSends: false,
    delaySec: 0,
    restoreSenderView: false,
    profileId,
    done: 0,
    total: 0,
    sent: 0,
    errors: 0,
    failures: [],
    batchId: '',
    campaignId: '',
    distributionId: '',
    successTarget: 0,
    startedAt: '',
    profileName: '',
    workerError: '',
    historyEntries: [],
    historySaved: false
  };
}

function runningDispatchState(profileId) {
  const state = dispatchStates.get(profileId);
  return state?.running ? state : null;
}

function isProfileDispatchLocked(profileId) {
  const state = runningDispatchState(profileId);
  return Boolean(state && isDispatchProfileLocked(state, profileId));
}

function configPath() {
  return path.join(app.getPath('userData'), 'profiles.json');
}

function templatesPath() {
  return path.join(app.getPath('userData'), 'message-templates.json');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function labelsPath() {
  return path.join(app.getPath('userData'), 'chat-labels.json');
}

function scheduledDispatchesPath() {
  return path.join(app.getPath('userData'), 'scheduled-dispatches.json');
}

function dispatchHistoryPath() {
  return path.join(app.getPath('userData'), 'dispatch-history.json');
}

function loadDispatchHistory() {
  try {
    const saved = JSON.parse(fs.readFileSync(dispatchHistoryPath(), 'utf8'));
    return mergeDispatchHistory([], Array.isArray(saved) ? saved : []);
  } catch {
    return [];
  }
}

function saveDispatchHistory() {
  fs.writeFileSync(dispatchHistoryPath(), JSON.stringify(dispatchHistory, null, 2), 'utf8');
}

function loadScheduledDispatches() {
  try {
    const saved = JSON.parse(fs.readFileSync(scheduledDispatchesPath(), 'utf8'));
    return Array.isArray(saved)
      ? saved.filter((item) => item?.id && scheduledProfileIds(item).length && item?.scheduledAt && item?.input)
      : [];
  } catch {
    return [];
  }
}

function saveScheduledDispatches() {
  fs.writeFileSync(scheduledDispatchesPath(), JSON.stringify(scheduledDispatches, null, 2), 'utf8');
}

function loadProfiles() {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveProfiles() {
  fs.writeFileSync(configPath(), JSON.stringify(profiles, null, 2), 'utf8');
}

function loadTemplates() {
  try {
    const saved = JSON.parse(fs.readFileSync(templatesPath(), 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTemplates() {
  fs.writeFileSync(templatesPath(), JSON.stringify(templates, null, 2), 'utf8');
}

function backupTemplatesBeforeMigration() {
  const source = templatesPath();
  const backup = path.join(app.getPath('userData'), 'message-templates.before-0.6.1.json');
  if (fs.existsSync(source) && !fs.existsSync(backup)) fs.copyFileSync(source, backup);
}

function loadLabels() {
  try {
    const saved = JSON.parse(fs.readFileSync(labelsPath(), 'utf8'));
    return {
      labels: Array.isArray(saved?.labels) ? saved.labels : [],
      assignments: saved?.assignments && typeof saved.assignments === 'object' ? saved.assignments : {}
    };
  } catch {
    return { labels: [], assignments: {} };
  }
}

function saveLabels() {
  fs.writeFileSync(labelsPath(), JSON.stringify(labelsData, null, 2), 'utf8');
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (!saved || typeof saved !== 'object') return {};
    const { memoryMode: _removedMemoryMode, ...remainingSettings } = saved;
    return remainingSettings;
  } catch {
    return {};
  }
}

function saveSettings() {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function startupAvailable() {
  return process.platform === 'win32' && app.isPackaged;
}

function rebuildApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(app.getVersion(), {
    startupEnabled: settings.startWithWindows !== false,
    startupAvailable: startupAvailable(),
    onToggleStartup: setStartWithWindows,
    onCheckForUpdates: () => appUpdaterController?.checkForUpdates({ manual: true })
  })));
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate({
    startupEnabled: settings.startWithWindows !== false,
    startupAvailable: startupAvailable(),
    onShow: showMainWindow,
    onToggleStartup: setStartWithWindows,
    onQuit: () => {
      isQuitting = true;
      app.quit();
    }
  })));
}

function setStartWithWindows(enabled) {
  settings.startWithWindows = Boolean(enabled);
  saveSettings();
  syncWindowsStartup(app, settings.startWithWindows);
  rebuildApplicationMenu();
  rebuildTrayMenu();
}

function createTray() {
  if (tray) return tray;
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const badgePath = path.join(__dirname, '..', 'assets', 'notification-badge.png');
  const countsPath = path.join(__dirname, '..', 'assets', 'notification-counts.png');
  trayBaseIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16, quality: 'best' });
  notificationBadgeIcon = nativeImage.createFromPath(badgePath);
  notificationCountsIcon = nativeImage.createFromPath(countsPath);
  tray = new Tray(trayBaseIcon);
  tray.setToolTip('Central WhatsApp Web');
  tray.on('click', showMainWindow);
  rebuildTrayMenu();
  syncUnreadIndicators();
  return tray;
}

function showMainWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  browserViewsSuspended = false;
  showActiveView();
  window.focus();
}

function showFirstTrayNotice() {
  if (settings.trayCloseNoticeShown) return;
  settings.trayCloseNoticeShown = true;
  saveSettings();
  const title = 'Central WhatsApp Web continua aberta';
  const content = 'O botão fechar agora envia o programa para a bandeja. Para encerrar, use Bandeja > Sair.';
  if (process.platform === 'win32' && typeof tray?.displayBalloon === 'function') {
    tray.displayBalloon({ title, content, iconType: 'info' });
  } else if (Notification.isSupported()) {
    new Notification({ title, body: content }).show();
  }
}

function hideMainWindowToTray() {
  if (!window || window.isDestroyed()) return;
  hideActiveView();
  window.hide();
  showFirstTrayNotice();
}

function templateForPublic(template) {
  return { id: template.id, name: template.name, body: template.body };
}

function labelForPublic(label) {
  return { id: label.id, name: label.name, color: label.color };
}

function labelsForChat(profileId, chatKey) {
  const selectedIds = labelsData.assignments?.[profileId]?.[chatKey] || [];
  return labelsData.labels.map(labelForPublic).map((label) => ({ ...label, selected: selectedIds.includes(label.id) }));
}

function syncLabelsToView(profileId) {
  const view = views.get(profileId);
  if (!view || view.webContents.isDestroyed()) return;
  const selectedByChat = Object.fromEntries(
    Object.entries(labelsData.assignments?.[profileId] || {}).map(([chatKey, labelIds]) => [
      chatKey,
      labelsData.labels.filter((label) => labelIds.includes(label.id)).map(labelForPublic)
    ])
  );
  const payload = JSON.stringify(selectedByChat);
  view.webContents.executeJavaScript(`
    (() => {
      window.__centralWhatsAppLabels = ${payload};
      if (window.__centralWhatsAppLabelsRenderer) return;
      const textOf = (element) => {
        if (!element) return '';
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width < 2 || rect.height < 2 || style.visibility === 'hidden' || style.display === 'none') return '';
        return (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ');
      };
      const chatRowFor = (title) => {
        const element = [...document.querySelectorAll('span[dir="auto"], span[title], div[title]')]
          .find((candidate) => textOf(candidate) === title && candidate.getBoundingClientRect().left < innerWidth * .45);
        if (!element) return null;
        let row = element;
        for (let level = 0; level < 7 && row.parentElement; level += 1, row = row.parentElement) {
          const rect = row.getBoundingClientRect();
          if (rect.width > 220 && rect.width < innerWidth * .55 && rect.height >= 48 && rect.height <= 110) return row;
        }
        return element.parentElement;
      };
      const render = () => {
        document.querySelectorAll('[data-central-whatsapp-label-dots]').forEach((element) => element.remove());
        for (const [chatName, labels] of Object.entries(window.__centralWhatsAppLabels || {})) {
          if (!labels.length) continue;
          const row = chatRowFor(chatName);
          if (!row) continue;
          row.style.position = 'relative';
          const dots = document.createElement('span');
          dots.dataset.centralWhatsappLabelDots = 'true';
          dots.title = labels.map((label) => label.name).join(', ');
          Object.assign(dots.style, {
            alignItems: 'center', display: 'flex', gap: '3px', pointerEvents: 'none',
            position: 'absolute', right: '66px', top: '50%', transform: 'translateY(-50%)', zIndex: '20'
          });
          labels.forEach((label) => {
            const dot = document.createElement('i');
            Object.assign(dot.style, {
              background: label.color, border: '1px solid rgba(255,255,255,.32)', borderRadius: '50%',
              boxShadow: '0 1px 4px rgba(0,0,0,.5)', display: 'block', height: '11px', width: '11px'
            });
            dots.append(dot);
          });
          row.append(dots);
        }
      };
      window.__centralWhatsAppLabelsRenderer = render;
      render();
      window.setInterval(render, 700);
    })();
  `).catch(() => {});
}

function profileForPublic(profile) {
  return { id: profile.id, name: profile.name, color: profile.color, zoom: profile.zoom || 1, unread: unreadByProfile.get(profile.id) || 0, active: profile.id === activeProfileId };
}

function unreadFromTitle(title) {
  const match = /^\s*\((\d+)\)/.exec(title || '');
  return match ? Number(match[1]) : 0;
}

function syncUnreadIndicators() {
  const unread = totalUnread(unreadByProfile.values());
  const label = indicatorLabel(unread);
  if (window && !window.isDestroyed() && process.platform === 'win32') {
    let overlay = null;
    if (unread > 0) {
      if (notificationCountsIcon && !notificationCountsIcon.isEmpty()) {
        overlay = notificationCountsIcon.crop(spriteCellForUnread(unread)).resize({ width: 16, height: 16, quality: 'best' });
      } else {
        const sourceSize = 64;
        const badge = notificationBadgeIcon?.resize({ width: sourceSize, height: sourceSize, quality: 'best' });
        overlay = nativeImage.createFromBitmap(
          createOverlayBitmap(unread, sourceSize, badge?.toBitmap()),
          { width: sourceSize, height: sourceSize, scaleFactor: 1 }
        ).resize({ width: 16, height: 16, quality: 'best' });
      }
    }
    window.setOverlayIcon(overlay, unread > 0 ? `${label} conversas não lidas` : 'Sem conversas não lidas');
  }
  if (process.platform !== 'win32' && typeof app.setBadgeCount === 'function') app.setBadgeCount(unread);
  if (tray && trayBaseIcon && !trayBaseIcon.isEmpty()) {
    if (unread > 0) {
      const size = trayBaseIcon.getSize();
      const badgeSize = Math.max(7, Math.round(Math.min(size.width, size.height) * 0.5));
      const badge = notificationBadgeIcon?.resize({ width: badgeSize, height: badgeSize, quality: 'best' });
      const bitmap = addUnreadBadge(
        trayBaseIcon.toBitmap(),
        size.width,
        size.height,
        badge?.toBitmap(),
        badgeSize,
        badgeSize
      );
      tray.setImage(nativeImage.createFromBitmap(bitmap, { ...size, scaleFactor: 1 }));
      tray.setToolTip(`Central WhatsApp Web — ${label} não lidas`);
    } else {
      tray.setImage(trayBaseIcon);
      tray.setToolTip('Central WhatsApp Web');
    }
  }
}

function shouldShowUnreadNotification(profileId) {
  if (!window || window.isDestroyed()) return true;
  return !window.isVisible() || window.isMinimized() || !window.isFocused() || profileId !== activeProfileId;
}

async function newestUnreadChat(view) {
  await ensureWhatsAppBridge(view);
  return view.webContents.executeJavaScript(`
    (async () => {
      const chats = await globalThis.WPP.chat.list({ onlyWithUnreadMessage: true, ignoreGroupMetadata: true });
      return chats.map((chat) => ({
        id: String(chat?.id?._serialized || chat?.id || ''),
        name: String(chat?.formattedTitle || chat?.name || chat?.contact?.formattedName || chat?.contact?.name || ''),
        unread: Number(chat?.unreadCount) || 0,
        timestamp: Number(chat?.t || chat?.timestamp || chat?.lastReceivedKey?.t) || 0
      })).filter((chat) => chat.id).sort((a, b) => (b.timestamp - a.timestamp) || (b.unread - a.unread))[0] || null;
    })()
  `, true);
}

async function openNotificationChat(profileId, chatId) {
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile || !chatId) return false;
  const view = createView(profile);
  try {
    await ensureWhatsAppBridge(view);
    const opened = await view.webContents.executeJavaScript(`
      (async () => {
        const chatId = ${JSON.stringify(chatId)};
        try {
          if (await globalThis.WPP.chat.openChatFromUnread(chatId)) return true;
        } catch {}
        try { return Boolean(await globalThis.WPP.chat.openChatBottom(chatId, 'Chatlist')); } catch { return false; }
      })()
    `, true);
    view.webContents.focus();
    return Boolean(opened);
  } catch (error) {
    console.warn(`[Central WhatsApp] Não foi possível abrir a conversa da notificação no perfil ${profileId}:`, error);
    return false;
  }
}

function activateNotificationTarget(profileId, chatId = '') {
  if (!window || window.isDestroyed()) {
    pendingNotificationProfileId = profileId;
    pendingNotificationChatId = chatId;
    return true;
  }
  const activated = activateProfile(profileId);
  if (activated && chatId) void openNotificationChat(profileId, chatId);
  return activated;
}

async function showUnreadNotification(profileId, unread, revision) {
  const profile = profiles.find((item) => item.id === profileId);
  const view = views.get(profileId);
  if (!profile || !view || view.webContents.isDestroyed() || !Notification.isSupported()) return;
  let chat = null;
  try {
    chat = await newestUnreadChat(view);
  } catch (error) {
    console.warn(`[Central WhatsApp] Não foi possível identificar a conversa não lida do perfil ${profileId}:`, error);
  }
  if (notificationRevisions.get(profileId) !== revision || (unreadByProfile.get(profileId) || 0) <= 0) return;
  const title = `WhatsApp — ${profile.name || 'Número'}`;
  const body = chat?.name || (unread === 1 ? 'Você tem 1 conversa não lida.' : `Você tem ${unread} conversas não lidas.`);
  const options = process.platform === 'win32'
    ? { toastXml: createProfileNotificationToast(profile, unread, chat || {}) }
    : { title, body, icon: path.join(__dirname, '..', 'assets', 'icon.png') };
  const notification = new Notification(options);
  activeNotifications.add(notification);
  if (process.platform !== 'win32') {
    notification.once('click', () => {
      activeNotifications.delete(notification);
      activateNotificationTarget(profileId, chat?.id || '');
    });
  }
  notification.once('close', () => activeNotifications.delete(notification));
  notification.show();
}

function publishUnread(profileId, unread, { allowNotification = true } = {}) {
  const normalized = Math.max(0, Number(unread) || 0);
  const previous = unreadByProfile.get(profileId) || 0;
  unreadByProfile.set(profileId, normalized);
  syncUnreadIndicators();
  if (window && !window.isDestroyed()) window.webContents.send('profiles:unread-changed', { profileId, unread });
  if (allowNotification && notificationReadyProfiles.has(profileId) && normalized > previous && shouldShowUnreadNotification(profileId)) {
    const revision = (notificationRevisions.get(profileId) || 0) + 1;
    notificationRevisions.set(profileId, revision);
    void showUnreadNotification(profileId, normalized, revision);
  }
}

function activateProfile(profileId) {
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return false;
  if (!window || window.isDestroyed()) {
    pendingNotificationProfileId = profile.id;
    return true;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  browserViewsSuspended = false;
  createView(profile);
  setActiveProfile(profile.id);
  if (activeProfileId !== profile.id) return false;
  pendingNotificationProfileId = null;
  window.webContents.send('profiles:activated', { profileId: profile.id });
  return true;
}

function syncProfileFromActivatedBrowserView() {
  if (!window || window.isDestroyed()) return false;
  const topView = window.getBrowserViews().at(-1);
  const viewStates = [...views.entries()].map(([id, view]) => ({
    id,
    focused: !view.webContents.isDestroyed() && view.webContents.isFocused(),
    top: view === topView
  }));
  const profileId = profileIdFromActivatedViews(viewStates, activeProfileId);
  return profileId ? activateProfile(profileId) : false;
}

function scheduleNativeNotificationProfileSync() {
  // O WhatsApp resolve a conversa de forma assíncrona. Observamos qual sessão
  // recebeu foco, mas nunca reafirmamos o perfil atual: isso poderia desfazer o
  // direcionamento nativo antes que o WhatsApp termine de abrir o chat.
  for (const delay of [180, 500, 1000]) {
    setTimeout(syncProfileFromActivatedBrowserView, delay);
  }
}

function handleNotificationActivation(details) {
  const rawArguments = String(details?.arguments || '');
  const target = notificationTargetFromActivation(rawArguments);
  const profileId = resolveNotificationProfileId(rawArguments, profiles.map((profile) => profile.id));
  if (profileId) return activateNotificationTarget(profileId, target.profileId === profileId ? target.chatId : '');
  scheduleNativeNotificationProfileSync();
  return false;
}

function ensureWindowsNotificationShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return true;
  const shortcutPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Central WhatsApp Web.lnk');
  fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
  const operation = fs.existsSync(shortcutPath) ? 'replace' : 'create';
  const written = shell.writeShortcutLink(shortcutPath, operation, createNotificationShortcutDetails(
    process.execPath,
    APP_USER_MODEL_ID,
    TOAST_ACTIVATOR_CLSID
  ));
  if (!written) console.warn('[Central WhatsApp] Não foi possível atualizar o atalho de notificações do Windows.');
  return written;
}

function resizeActiveView() {
  if (!window || browserViewsSuspended) return;
  const activeView = views.get(activeProfileId);
  isolateActiveBrowserView(
    window,
    views.values(),
    activeView,
    activeViewBounds(),
    { attach: false, focus: false }
  );
}

function activeViewBounds() {
  const [width, height] = window.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: TOPBAR_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height: Math.max(0, height - TOPBAR_HEIGHT)
  };
}

function setActiveProfile(id) {
  if (!profiles.some((profile) => profile.id === id)) return;
  if (isProfileDispatchLocked(id) && activeProfileId !== id) return;
  activeProfileId = id;
  profileSwitchRevision += 1;
  const revision = profileSwitchRevision;
  if (browserViewsSuspended) return;

  const bounds = activeViewBounds();
  const selectedView = views.get(id);
  isolateActiveBrowserView(window, views.values(), selectedView, bounds);
  syncSessionResourcePolicy();

  // Um carregamento paralelo pode terminar exatamente durante a troca. Reafirma
  // o isolamento para que somente a sessão escolhida possa receber cliques.
  setTimeout(() => {
    if (!window || window.isDestroyed() || browserViewsSuspended || activeProfileId !== id || profileSwitchRevision !== revision) return;
    const currentView = views.get(id);
    if (!currentView || currentView.webContents.isDestroyed()) return;
    isolateActiveBrowserView(window, views.values(), currentView, activeViewBounds());
  }, 80);
}

function keepSessionsActive() {
  syncSessionResourcePolicy();
}

function syncSessionResourcePolicy() {
  for (const [profileId, view] of views) {
    if (!view || view.webContents.isDestroyed()) continue;
    const dispatchRunning = Boolean(dispatchStates.get(profileId)?.running);
    const visible = !browserViewsSuspended && profileId === activeProfileId;
    view.webContents.setBackgroundThrottling(!(visible || dispatchRunning));
  }
}

function hideActiveView() {
  browserViewsSuspended = true;
  profileSwitchRevision += 1;
  for (const view of views.values()) {
    if (isBrowserViewAttached(window, view)) window.removeBrowserView(view);
  }
  syncSessionResourcePolicy();
}

function showActiveView() {
  const profile = profiles.find((item) => item.id === activeProfileId);
  if (!profile) return;
  if (isProfileDispatchLocked(profile.id)) return;
  browserViewsSuspended = false;
  createView(profile);
  setActiveProfile(profile.id);
}

function recoverActiveBrowserSurface(view) {
  if (!window || window.isDestroyed() || !view || view.webContents.isDestroyed()) return;
  const bounds = activeViewBounds();
  view.webContents.setBackgroundThrottling(false);
  view.webContents.invalidate?.();
  view.setBounds({ ...bounds, width: Math.max(1, bounds.width - 1) });
  setTimeout(() => {
    if (!window || window.isDestroyed() || browserViewsSuspended || views.get(activeProfileId) !== view) return;
    view.setBounds(activeViewBounds());
    view.webContents.invalidate?.();
  }, 80);
}

async function checkActiveBrowserSurface() {
  if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized() || browserViewsSuspended) return;
  const profileId = activeProfileId;
  const view = views.get(profileId);
  if (!profileId || !view || view.webContents.isDestroyed() || view.webContents.isLoadingMainFrame()) return;

  try {
    const image = await Promise.race([
      view.webContents.capturePage(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tempo esgotado ao verificar superfície')), 4000))
    ]);
    if (profileId !== activeProfileId || views.get(profileId) !== view) return;
    if (!isLikelyBlankImage(image)) {
      blankSurfaceStrikes.delete(profileId);
      return;
    }

    const strikes = (blankSurfaceStrikes.get(profileId) || 0) + 1;
    blankSurfaceStrikes.set(profileId, strikes);
    console.warn(`[Central WhatsApp] Superfície vazia detectada em ${profileId}; tentativa ${strikes} de recuperação.`);
    recoverActiveBrowserSurface(view);

    // Se o compositor não voltou em duas verificações e não há envio em curso,
    // faz automaticamente o mesmo refresh que antes precisava ser manual.
    if (strikes >= 2 && !runningDispatchState(profileId)) {
      blankSurfaceStrikes.delete(profileId);
      view.webContents.reload();
    }
  } catch (error) {
    console.warn('[Central WhatsApp] Não foi possível verificar a superfície ativa:', error.message || String(error));
  }
}

function startSurfaceHealthMonitor() {
  clearInterval(surfaceHealthTimer);
  surfaceHealthTimer = setInterval(checkActiveBrowserSurface, 15000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dispatchPublicState(stateOrProfileId) {
  const state = typeof stateOrProfileId === 'string'
    ? dispatchStates.get(stateOrProfileId) || createDispatchState(stateOrProfileId)
    : stateOrProfileId;
  const lockedProfileId = isDispatchProfileLocked(state, state.profileId)
    ? state.profileId
    : null;
  return {
    running: state.running,
    paused: state.paused,
    sending: state.sending,
    releaseBetweenSends: state.releaseBetweenSends,
    delaySec: state.delaySec,
    lockedProfileId,
    profileId: state.profileId,
    profileName: state.profileName,
    campaignId: state.campaignId,
    distributionId: state.distributionId,
    workerError: state.workerError,
    successTarget: state.successTarget,
    done: state.done,
    total: state.total,
    sent: state.sent,
    errors: state.errors
  };
}

function dispatchStatesPublic() {
  return [...dispatchStates.values()].map(dispatchPublicState);
}

function distributionPublicState(distribution) {
  const snapshot = distribution.queue.snapshot();
  const workers = distribution.profileIds.map((profileId) => {
    const state = dispatchStates.get(profileId) || createDispatchState(profileId);
    const profile = profiles.find((item) => item.id === profileId);
    const queueStats = snapshot.profiles.find((item) => item.profileId === profileId);
    return {
      ...dispatchPublicState(state),
      profileName: profile?.name || state.profileName || 'Número removido',
      target: queueStats?.target || 0
    };
  });
  return {
    id: distribution.id,
    campaignId: distribution.campaignId,
    campaignName: distribution.campaignName,
    mode: distribution.mode,
    distributionMode: distribution.distributionMode,
    startedAt: distribution.startedAt,
    finishedAt: distribution.finishedAt || '',
    running: workers.some((worker) => worker.running),
    paused: workers.some((worker) => worker.running) && workers.filter((worker) => worker.running).every((worker) => worker.paused),
    stopRequested: Boolean(distribution.stopRequested),
    target: snapshot.target,
    sent: snapshot.sent,
    errors: snapshot.errors,
    attempted: snapshot.attempted,
    candidateCount: snapshot.candidateCount,
    remainingCandidates: snapshot.remainingCandidates,
    workers
  };
}

function distributionsPublic() {
  return [...distributions.values()]
    .map(distributionPublicState)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function publishDistributionState(distribution) {
  if (!distribution) return;
  publishDispatch('dispatch:distribution-state-changed', distributionPublicState(distribution));
}

function scheduledDispatchForPublic(item) {
  const profileIds = scheduledProfileIds(item);
  const profileNames = profileIds.map((profileId) => (
    profiles.find((candidate) => candidate.id === profileId)?.name
      || (profileId === item.profileId ? item.profileName : '')
      || 'Número removido'
  ));
  return {
    id: item.id,
    type: item.type === 'distribution' ? 'distribution' : 'single',
    profileId: item.profileId || profileIds[0] || '',
    profileIds,
    profileName: item.type === 'distribution' ? profileNames.join(', ') : profileNames[0],
    profileNames,
    scheduledAt: item.scheduledAt,
    createdAt: item.createdAt,
    leadCount: Array.isArray(item.input?.leads) ? item.input.leads.length : 0,
    status: item.status || 'pending',
    error: item.error || ''
  };
}

function scheduledDispatchesPublic() {
  return scheduledDispatches
    .map(scheduledDispatchForPublic)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

function publishScheduledDispatches() {
  publishDispatch('dispatch:schedules-changed', scheduledDispatchesPublic());
}

function scheduleNextDispatchCheck() {
  if (scheduledDispatchTimer) clearTimeout(scheduledDispatchTimer);
  scheduledDispatchTimer = null;
  const delay = nextScheduleDelay(scheduledDispatches);
  if (delay === null) return;
  scheduledDispatchTimer = setTimeout(checkScheduledDispatches, delay);
}

function checkScheduledDispatches() {
  scheduledDispatchTimer = null;
  const now = Date.now();
  const scheduleBlocked = (item) => {
    if (scheduleHasBusyProfile(item, (profileId) => Boolean(runningDispatchState(profileId)))) return true;
    const campaignId = String(item?.input?.campaignId || '');
    return Boolean(campaignId && [...dispatchStates.values()].some((state) => state.running && state.campaignId === campaignId));
  };
  const due = selectDueSchedule(scheduledDispatches, now, scheduleBlocked);

  if (!due) {
    scheduleNextDispatchCheck();
    return;
  }

  if (scheduleBlocked(due)) {
    due.status = 'waiting';
    due.error = due.type === 'distribution'
      ? 'Aguardando os números selecionados ficarem disponíveis.'
      : 'Aguardando o disparo atual terminar.';
    saveScheduledDispatches();
    publishScheduledDispatches();
    scheduledDispatchTimer = setTimeout(checkScheduledDispatches, 15_000);
    return;
  }

  const result = startScheduledDispatch(due, {
    startDistribution: startDistributionInternal,
    startSingle: startDispatchInternal
  });
  if (result.ok) {
    scheduledDispatches = scheduledDispatches.filter((item) => item.id !== due.id);
    saveScheduledDispatches();
    publishScheduledDispatches();
    publishDispatch('dispatch:schedule-triggered', {
      id: due.id,
      type: due.type === 'distribution' ? 'distribution' : 'single',
      profileName: due.type === 'distribution' ? scheduledDispatchForPublic(due).profileName : result.profileName,
      scheduledAt: due.scheduledAt,
      state: result.state || null,
      distribution: result.distribution || null
    });
  } else {
    due.status = 'failed';
    due.error = result.error || 'Não foi possível iniciar o agendamento.';
    saveScheduledDispatches();
    publishScheduledDispatches();
  }
  scheduleNextDispatchCheck();
}

function publishDispatchState(state) {
  publishDispatch('dispatch:state-changed', dispatchPublicState(state));
}

function setDispatchSending(state, sending) {
  const next = Boolean(sending);
  if (state.sending === next) return;
  const view = views.get(state.profileId);

  if (next && state.releaseBetweenSends && view && window && !window.isDestroyed()) {
    state.restoreSenderView = activeProfileId === state.profileId
      && window.getBrowserViews().includes(view);
    if (state.restoreSenderView) window.removeBrowserView(view);
  }

  state.sending = next;

  if (!next && state.releaseBetweenSends && state.restoreSenderView) {
    state.restoreSenderView = false;
    if (view && !view.webContents.isDestroyed() && activeProfileId === state.profileId) {
      if (!window.getBrowserViews().includes(view)) window.addBrowserView(view);
      resizeActiveView();
    }
  }
  publishDispatchState(state);
}

function publishDispatch(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function formatDispatchPhone(phone) {
  const areaCode = String(phone?.areaCode || '').replace(/\D/g, '');
  const number = String(phone?.number || '').replace(/\D/g, '');
  if (areaCode.length !== 2 || !/^\d{8,9}$/.test(number)) throw new Error('Telefone inválido na lista.');
  return `55${areaCode}${number}`;
}

function parseDispatchLead(lead, index) {
  const phone = formatDispatchPhone(lead?.phone);
  return {
    uuid: String(lead?.uuid || `central-dispatch-${index + 1}`),
    person: { name: String(lead?.person?.name || '').trim().slice(0, 160) },
    phone: { active: true, areaCode: phone.slice(2, 4), number: phone.slice(4) },
    messageTemplate: String(lead?.messageTemplate || '').trim().slice(0, 4096),
    messageTemplateName: String(lead?.messageTemplateName || '').trim().slice(0, 60),
    url: String(lead?.url || '').trim().slice(0, 2048),
    opportunities: {
      available: {
        count: Math.max(0, Number(lead?.opportunities?.available?.count) || 0),
        sumNetAmount: Number(lead?.opportunities?.available?.sumNetAmount) || 0,
        sumLoanAmount: Number(lead?.opportunities?.available?.sumLoanAmount) || 0,
        sumInstallmentAmount: Number(lead?.opportunities?.available?.sumInstallmentAmount) || 0
      },
      won: { count: Math.max(0, Number(lead?.opportunities?.won?.count) || 0) }
    }
  };
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function dispatchCurrency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? BRL.format(number) : 'R$ 0,00';
}

function dispatchCapitalize(value) {
  return String(value || '')
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word) => word.length > 2 ? word[0].toLocaleUpperCase('pt-BR') + word.slice(1) : word)
    .join(' ');
}

function renderDispatchTemplate(template, lead, senderName) {
  const name = lead.person?.name || '';
  const sender = String(senderName || '').trim();
  const available = lead.opportunities?.available || {};
  const won = lead.opportunities?.won || {};
  const values = {
    '{nome}': dispatchCapitalize(name),
    '{primeiroNome}': dispatchCapitalize(name.split(/\s+/)[0] || ''),
    '{url}': lead.url || '',
    '{meuNome}': sender,
    '{meuPrimeiroNome}': sender.split(/\s+/)[0] || '',
    '{vendedor}': sender.split(/\s+/)[0] || sender,
    '{qtdOportunidades}': String(available.count || 0),
    '{valorDisponivel}': dispatchCurrency(available.sumNetAmount),
    '{valorEmprestimo}': dispatchCurrency(available.sumLoanAmount),
    '{parcela}': dispatchCurrency(available.sumInstallmentAmount),
    '{qtdContratos}': String(won.count || 0)
  };
  let result = String(template || '');
  for (const [placeholder, value] of Object.entries(values)) result = result.split(placeholder).join(value);
  return result;
}

function getWppConnectSource() {
  if (wppConnectSource === null) wppConnectSource = fs.readFileSync(WPP_CONNECT_PATH, 'utf8');
  return wppConnectSource;
}

async function whatsappBridgeState(view) {
  return view.webContents.executeJavaScript(`(() => ({
    injected: Boolean(globalThis.WPP),
    ready: Boolean(globalThis.WPP?.isReady),
    authenticated: Boolean(globalThis.WPP?.conn?.isAuthenticated?.())
  }))()`);
}

async function ensureWhatsAppBridge(view, timeoutMs = 45000) {
  const startedAt = Date.now();
  let injected = false;
  while (Date.now() - startedAt < timeoutMs) {
    if (view.webContents.isDestroyed()) throw new Error('A sessão selecionada foi fechada.');
    try {
      if (!view.webContents.isLoading()) {
        const state = await whatsappBridgeState(view);
        if (state?.ready && state.authenticated) return true;
        if (!state?.injected && !injected) {
          await view.webContents.executeJavaScript(getWppConnectSource());
          injected = true;
          continue;
        }
      }
    } catch (error) {
      injected = false;
      console.warn('[Central WhatsApp] Integração de disparo ainda não disponível:', error.message);
    }
    await sleep(700);
  }
  throw new Error('WhatsApp não ficou pronto. Confirme se o perfil está conectado e tente novamente.');
}

function publishConversationBackupProgress(payload) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('conversation-backup:progress', payload);
}

function withConversationBackupCancellation(profileId, operation) {
  let timer = null;
  const cancellation = new Promise((_, reject) => {
    timer = setInterval(() => {
      if (!conversationBackupCancellations.has(profileId)) return;
      reject(Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' }));
    }, 150);
  });
  return Promise.race([operation, cancellation]).finally(() => clearInterval(timer));
}

async function extractActiveConversation(view) {
  return view.webContents.executeJavaScript(`(async () => {
    const serializeId = (value) => {
      try { return value?.toString?.() || value?._serialized || String(value || ''); } catch { return ''; }
    };
    const activeChat = globalThis.WPP?.chat?.getActiveChat?.();
    if (!activeChat) return { ok: false, error: 'Abra uma conversa no WhatsApp antes de gerar o backup.' };
    const chatId = serializeId(activeChat.id);
    const title = String(
      activeChat.formattedTitle || activeChat.name || activeChat.contact?.formattedName
      || activeChat.contact?.pushname || activeChat.contact?.name || chatId || 'Conversa'
    );
    const rawMessages = await Promise.race([
      globalThis.WPP.chat.getMessages(activeChat.id, {
        count: -1,
        includeCallMessages: true
      }),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('A leitura do histórico excedeu 2 minutos. Tente novamente com a conversa aberta e carregada.')),
        120000
      ))
    ]);
    const messages = (Array.isArray(rawMessages) ? rawMessages : []).map((message, index) => {
      const id = serializeId(message.id);
      const type = String(message.type || message.mediaData?.type || 'chat').toLowerCase();
      const fromMe = Boolean(message.id?.fromMe ?? message.fromMe);
      const rawTimestamp = Number(message.t || message.timestamp || 0);
      const timestampMs = rawTimestamp > 100000000000 ? rawTimestamp : rawTimestamp * 1000;
      const author = fromMe
        ? 'Você'
        : String(
          message.senderObj?.formattedName || message.senderObj?.pushname || message.senderObj?.name
          || message.authorObj?.formattedName || message.notifyName || title || 'Contato'
        );
      let text = String(message.body || message.caption || message.pollName || message.description || '');
      if (!text && (message.isRevoked || type === 'revoked')) text = 'Mensagem apagada';
      const mimetype = String(message.mimetype || message.mediaData?.mimetype || '');
      return {
        id,
        sequence: index,
        fromMe,
        author,
        timestampMs,
        type,
        text,
        mimetype,
        duration: Number(message.duration || message.mediaData?.duration || 0),
        isAudio: type === 'ptt' || type === 'audio' || mimetype.toLowerCase().startsWith('audio/')
      };
    }).sort((first, second) => (first.timestampMs - second.timestampMs) || (first.sequence - second.sequence));
    return { ok: true, chat: { id: chatId, title }, messages };
  })()`);
}

async function downloadConversationAudio(view, messageId) {
  return view.webContents.executeJavaScript(`(async () => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite excedido')), 60000));
      const blob = await Promise.race([
        globalThis.WPP.chat.downloadMedia(${JSON.stringify(messageId)}),
        timeout
      ]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const parts = [];
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
      }
      return { ok: true, type: blob.type || '', base64: btoa(parts.join('')) };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  })()`);
}

async function createConversationBackup(profileId) {
  const profile = profiles.find((item) => item.id === String(profileId || ''));
  if (!profile) return { ok: false, error: 'Selecione um número conectado.' };
  if (runningDispatchState(profile.id)) {
    return { ok: false, error: 'Aguarde o disparo deste número terminar antes de gerar o backup.' };
  }
  const view = views.get(profile.id);
  if (!view || view.webContents.isDestroyed()) return { ok: false, error: 'A sessão selecionada não está aberta.' };

  const date = new Date().toISOString().slice(0, 10);
  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Salvar backup da conversa',
    defaultPath: `backup-conversa-${sanitizeBackupName(profile.name)}-${date}.zip`,
    filters: [{ name: 'Arquivo compactado ZIP', extensions: ['zip'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };

  const tempRoot = fs.mkdtempSync(path.join(app.getPath('temp'), 'central-conversa-'));
  conversationBackupCancellations.delete(profile.id);
  try {
    publishConversationBackupProgress({ phase: 'loading', current: 0, total: 0, message: 'Lendo o histórico disponível no WhatsApp…' });
    await withConversationBackupCancellation(profile.id, ensureWhatsAppBridge(view));
    const extracted = await withConversationBackupCancellation(profile.id, extractActiveConversation(view));
    if (!extracted?.ok) return { ok: false, error: extracted?.error || 'Não foi possível ler a conversa ativa.' };
    if (!extracted.messages.length) return { ok: false, error: 'A conversa ativa não possui mensagens disponíveis para backup.' };

    publishConversationBackupProgress({
      phase: 'history', current: 0, total: 0,
      message: 'A conversa ficará visível por alguns segundos durante os prints…'
    });
    const screenshotCount = await withTemporarilyAttachedBrowserView(
      window,
      view,
      activeViewBounds(),
      () => captureWhatsAppConversation(
        view.webContents,
        path.join(tempRoot, '01-prints'),
        publishConversationBackupProgress,
        { isCancelled: () => conversationBackupCancellations.has(profile.id) }
      ),
      { settleMs: 700 }
    );

    const audioMessages = extracted.messages.filter((message) => message.isAudio && message.id);
    const audioDirectory = path.join(tempRoot, '02-audios');
    fs.mkdirSync(audioDirectory, { recursive: true });
    const audioFiles = [];
    const audioFailures = [];
    for (let index = 0; index < audioMessages.length; index += 1) {
      if (conversationBackupCancellations.has(profile.id)) {
        throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
      }
      const message = audioMessages[index];
      publishConversationBackupProgress({
        phase: 'audio', current: index + 1, total: audioMessages.length,
        message: `Baixando áudio ${index + 1} de ${audioMessages.length}…`
      });
      const downloaded = await withConversationBackupCancellation(profile.id, downloadConversationAudio(view, message.id));
      if (!downloaded?.ok || !downloaded.base64) {
        audioFailures.push({ messageId: message.id, reason: downloaded?.error || 'Mídia indisponível' });
        continue;
      }
      const mimetype = downloaded.type || message.mimetype;
      const filename = audioBackupFilename(message, audioFiles.length, mimetype);
      const data = Buffer.from(downloaded.base64, 'base64');
      fs.writeFileSync(path.join(audioDirectory, filename), data);
      audioFiles.push({ messageId: message.id, filename, mimetype, bytes: data.length });
    }

    publishConversationBackupProgress({ phase: 'compressing', current: 0, total: 0, message: 'Compactando o pacote final…' });
    const zip = new AdmZip();
    zip.addLocalFolder(tempRoot);
    zip.writeZip(saveResult.filePath);
    publishConversationBackupProgress({ phase: 'done', current: 1, total: 1, message: 'Backup concluído.' });
    return {
      ok: true,
      filePath: saveResult.filePath,
      chatTitle: extracted.chat.title,
      messageCount: extracted.messages.length,
      audioCount: audioFiles.length,
      audioFailureCount: audioFailures.length,
      screenshotCount
    };
  } catch (error) {
    if (error?.code === 'backup_cancelled') return { ok: false, canceled: true };
    console.error('[Central WhatsApp] Falha ao gerar backup da conversa:', error);
    return { ok: false, error: error?.message || String(error) };
  } finally {
    conversationBackupCancellations.delete(profile.id);
    if (tempRoot.startsWith(path.join(app.getPath('temp'), 'central-conversa-'))) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

async function sendDispatchMessage(view, phone, message) {
  try {
    await ensureWhatsAppBridge(view, 15000);
  } catch (error) {
    throw createDispatchSessionError(error);
  }
  const result = await view.webContents.executeJavaScript(`(async () => {
    try {
      if (!globalThis.WPP?.isReady || !globalThis.WPP?.conn?.isAuthenticated?.()) {
        return { ok: false, error: 'WhatsApp não está pronto ou conectado.' };
      }
      const restrictionPattern = new RegExp(${JSON.stringify(WHATSAPP_RESTRICTION_PATTERN_SOURCE)}, 'i');
      const messageWasConfirmed = ${isWhatsAppSendConfirmed.toString()};
      const pageText = () => {
        const chunks = [document.documentElement?.textContent || '', document.body?.innerText || ''];
        for (const element of document.querySelectorAll('[aria-label], [title]')) {
          chunks.push(element.getAttribute('aria-label') || '', element.getAttribute('title') || '');
          if (element.shadowRoot) chunks.push(element.shadowRoot.textContent || '');
        }
        return chunks.join(' ').replace(/\\s+/g, ' ');
      };
      const restrictionIsVisible = () => restrictionPattern.test(pageText());
      const restrictedResult = () => ({
        ok: false,
        code: 'sender_restricted',
        error: 'Sua conta está restringida nos dispositivos conectados. Não é possível iniciar novas conversas no momento.',
        authenticated: Boolean(globalThis.WPP?.conn?.isAuthenticated?.()),
        restrictionVisible: true
      });
      const sendAndConfirm = async (chatId) => {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            const error = new Error('O WhatsApp não confirmou o envio da mensagem.');
            error.code = 'sender_unconfirmed';
            reject(error);
          }, 20000);
        });
        let result;
        try {
          result = await Promise.race([
            globalThis.WPP.chat.sendTextMessage(chatId, ${JSON.stringify(message)}, { waitForAck: true }),
            timeout
          ]);
        } finally {
          clearTimeout(timeoutId);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (restrictionIsVisible()) return restrictedResult();
        if (!messageWasConfirmed(result)) {
          return {
            ok: false,
            code: 'sender_unconfirmed',
            error: 'O WhatsApp criou a mensagem localmente, mas não confirmou o envio.',
            authenticated: Boolean(globalThis.WPP?.conn?.isAuthenticated?.())
          };
        }
        return { ok: true, result };
      };
      if (restrictionIsVisible()) return restrictedResult();
      ${createWppRecipientRuntimeSource()}
      const recipient = await resolveWppDispatchRecipient(
        globalThis.WPP,
        ${JSON.stringify(phone)}
      );
      const chatIds = recipient.candidateChatIds?.length
        ? recipient.candidateChatIds
        : [recipient.chatId];
      let sentChatId = '';
      let lastError = null;
      for (const chatId of chatIds) {
        try {
          const confirmation = await sendAndConfirm(chatId);
          if (!confirmation.ok) return confirmation;
          sentChatId = chatId;
          break;
        } catch (error) {
          lastError = error;
          if (!/no lid|invalid|wid|phone|number|contact|exist|not found/i.test(error?.message || String(error))) throw error;
        }
      }
      if (!sentChatId) {
        const uiChatId = await openWppChatByPhoneSearch(globalThis.WPP, chatIds);
        const confirmation = await sendAndConfirm(uiChatId);
        if (!confirmation.ok) return confirmation;
        sentChatId = uiChatId;
      }
      if (!sentChatId) throw lastError || new Error('Não foi possível enviar para este número.');
      try { await globalThis.WPP.chat.openChatBottom(sentChatId); } catch {}
      return { ok: true, usedLid: recipient.usedLid, resolution: recipient.resolution };
    } catch (error) {
      let connectionState = '';
      try { connectionState = String(await globalThis.WPP?.conn?.getState?.() || ''); } catch {}
      const authenticated = Boolean(globalThis.WPP?.conn?.isAuthenticated?.());
      const failurePageText = (document.documentElement?.textContent || '') + ' ' + (document.body?.innerText || '');
      const restrictionVisible = new RegExp(${JSON.stringify(WHATSAPP_RESTRICTION_PATTERN_SOURCE)}, 'i').test(failurePageText)
        || /this account can no longer use whatsapp|esta conta n[aã]o (?:pode|tem permiss[aã]o para) (?:mais )?usar o whatsapp|conta.{0,40}(?:banid|bloquead|restrit|suspens)/i.test(failurePageText);
      return {
        ok: false,
        code: error?.code,
        error: error?.message || String(error),
        authenticated,
        connectionState,
        restrictionVisible
      };
    }
  })()`);
  if (result?.ok) return;
  const rawError = result?.error || 'Não foi possível enviar para este número.';
  if (classifyDispatchSessionFailure(result)) throw createDispatchSessionError(result);
  if (/no lid for user/i.test(rawError)) {
    throw new Error('O WhatsApp não conseguiu identificar este destinatário. Abra uma conversa com o número neste perfil e tente novamente.');
  }
  if (result?.code === 'number_not_found') throw new Error(rawError);
  if (/invalid|wid|phone|number|contact|exist/i.test(rawError)) throw new Error('Número inválido ou sem WhatsApp.');
  throw new Error(rawError);
}

async function dispatchWait(state, ms) {
  let remaining = ms;
  let previous = Date.now();
  while (remaining > 0 && !state.stopRequested) {
    if (state.paused) {
      await sleep(150);
      previous = Date.now();
      continue;
    }
    const step = Math.min(250, remaining);
    await sleep(step);
    const now = Date.now();
    remaining -= now - previous;
    previous = now;
  }
}

async function waitWhileDispatchPaused(state) {
  while (state.paused && !state.stopRequested) await sleep(150);
}

function recordDispatchHistory(state, lead, status, reason = '') {
  const occurredAt = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    batchId: state.batchId,
    occurredAt,
    profileId: state.profileId,
    profileName: state.profileName,
    name: lead?.person?.name || '',
    phone: formatDispatchPhone(lead?.phone),
    modelName: lead?.messageTemplateName || 'Mensagem única',
    status,
    reason
  };
  state.historyEntries.push(entry);
  try {
    campaignStore?.recordOutcome({
      campaignId: state.campaignId,
      phone: entry.phone,
      status,
      reason,
      occurredAt,
      profileId: state.profileId,
      modelName: entry.modelName
    });
    if (state.campaignId) publishDispatch('campaigns:changed', { campaignId: state.campaignId });
  } catch (error) {
    console.warn('[Central WhatsApp] Não foi possível atualizar a campanha:', error.message || String(error));
  }
}

function persistDispatchHistory(state) {
  if (state.historySaved || !state.historyEntries.length) return;
  dispatchHistory = mergeDispatchHistory(dispatchHistory, state.historyEntries.slice().reverse(), MAX_DISPATCH_HISTORY);
  saveDispatchHistory();
  state.historySaved = true;
  publishDispatch('dispatch:history-changed', { count: dispatchHistory.length });
}

function finishDispatchState(state) {
  persistDispatchHistory(state);
  const view = views.get(state.profileId);
  if (state.restoreSenderView && view && !view.webContents.isDestroyed() && activeProfileId === state.profileId) {
    if (!window.getBrowserViews().includes(view)) window.addBrowserView(view);
    resizeActiveView();
  }
  state.running = false;
  state.paused = false;
  state.sending = false;
  state.releaseBetweenSends = false;
  state.delaySec = 0;
  state.restoreSenderView = false;
  keepSessionsActive();
  publishDispatchState(state);
  scheduleNextDispatchCheck();
  appUpdaterController?.notifyDispatchStateChanged();
}

async function runDispatch({ leads, template, messageVariants, senderName, delaySec, jitter, profileId }, state) {
  const view = views.get(profileId);
  if (!view || view.webContents.isDestroyed()) throw new Error('A sessão selecionada não está aberta.');
  view.webContents.setBackgroundThrottling(false);
  const variantRotation = createSuccessfulVariantRotation(messageVariants);

  try {
    await ensureWhatsAppBridge(view);
  } catch (error) {
    state.workerError = createDispatchSessionError(error).message;
    finishDispatchState(state);
    publishDispatch('dispatch:done', {
      profileId,
      sent: 0,
      errors: 0,
      successTarget: state.successTarget,
      stopped: true,
      failures: [],
      workerError: state.workerError
    });
    return;
  }

  for (let index = 0; index < leads.length; index += 1) {
    if (effectiveTargetReached(state.sent, state.successTarget)) break;
    await waitWhileDispatchPaused(state);
    if (state.stopRequested) break;
    const lead = leads[index];
    const variant = variantRotation?.next();
    const attemptLead = variant
      ? { ...lead, messageTemplate: variant.body, messageTemplateName: variant.name }
      : lead;
    setDispatchSending(state, true);
    let sessionFailure = false;
    let status = 'error';
    try {
      const phone = formatDispatchPhone(attemptLead.phone);
      const message = renderDispatchTemplate(attemptLead.messageTemplate || template, attemptLead, senderName);
      await sendDispatchMessage(view, phone, message);
      status = 'sent';
      variantRotation?.complete(true);
      state.sent += 1;
      state.done += 1;
      recordDispatchHistory(state, attemptLead, 'sent');
      publishDispatch('dispatch:progress', {
        profileId,
        done: state.done,
        total: state.total,
        sent: state.sent,
        successTarget: state.successTarget,
        lead: attemptLead,
        status: 'sent'
      });
    } catch (error) {
      variantRotation?.complete(false);
      if (isDispatchSessionError(error)) {
        state.workerError = error.message || String(error);
        sessionFailure = true;
      } else {
        state.errors += 1;
        state.done += 1;
        state.failures.push({
          name: lead?.person?.name || '',
          phone: formatDispatchPhone(lead?.phone),
          reason: error.message || String(error)
        });
        recordDispatchHistory(state, attemptLead, 'error', error.message || String(error));
        publishDispatch('dispatch:progress', {
          profileId,
          done: state.done,
          total: state.total,
          sent: state.sent,
          successTarget: state.successTarget,
          lead: attemptLead,
          status: 'error',
          error: error.message || String(error)
        });
      }
    }
    setDispatchSending(state, false);
    if (sessionFailure) break;

    if (
      shouldWaitAfterDispatchAttempt(status)
      && index < leads.length - 1
      && !state.stopRequested
      && !effectiveTargetReached(state.sent, state.successTarget)
    ) {
      const base = Math.max(3, Number(delaySec) || 12) * 1000;
      await dispatchWait(state, jitter ? base + Math.random() * base * .5 : base);
    }
  }

  const stopped = state.stopRequested || Boolean(state.workerError);
  finishDispatchState(state);
  publishDispatch('dispatch:done', {
    profileId,
    sent: state.sent,
    errors: state.errors,
    successTarget: state.successTarget,
    stopped,
    failures: state.failures,
    workerError: state.workerError
  });
}

function finishDistributionIfIdle(distribution) {
  const workersRunning = distribution.profileIds.some((profileId) => dispatchStates.get(profileId)?.running);
  if (workersRunning) {
    publishDistributionState(distribution);
    return;
  }
  distribution.finishedAt ||= new Date().toISOString();
  publishDistributionState(distribution);
  publishDispatch('dispatch:distribution-done', distributionPublicState(distribution));

  const completed = [...distributions.values()]
    .filter((item) => item.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
  for (const old of completed.slice(10)) distributions.delete(old.id);
}

async function runDistributedWorker(distribution, profile, input, state) {
  const view = views.get(profile.id);
  if (!view || view.webContents.isDestroyed()) throw new Error('A sessão selecionada não está aberta.');
  view.webContents.setBackgroundThrottling(false);
  const variantRotation = createSuccessfulVariantRotation(input.messageVariants);

  try {
    await ensureWhatsAppBridge(view);
  } catch (error) {
    state.workerError = createDispatchSessionError(error).message;
    finishDispatchState(state);
    publishDispatch('dispatch:done', {
      profileId: profile.id,
      distributionId: distribution.id,
      sent: 0,
      errors: 0,
      successTarget: distribution.queue.snapshot().target,
      stopped: false,
      failures: [],
      workerError: state.workerError
    });
    finishDistributionIfIdle(distribution);
    return;
  }

  while (!state.stopRequested && !distribution.stopRequested) {
    await waitWhileDispatchPaused(state);
    if (state.stopRequested || distribution.stopRequested) break;

    const eligibleProfileIds = distribution.profileIds.filter((profileId) => {
      const worker = dispatchStates.get(profileId);
      return worker?.running && !worker.paused && !worker.stopRequested && !worker.workerError;
    });
    const claim = distribution.queue.claim(profile.id, eligibleProfileIds);
    if (claim.status === 'done') break;
    if (claim.status === 'wait') {
      await sleep(120);
      continue;
    }

    const { assignment } = claim;
    const lead = assignment.lead;
    const variant = variantRotation?.next();
    const attemptLead = variant
      ? { ...lead, messageTemplate: variant.body, messageTemplateName: variant.name }
      : lead;
    setDispatchSending(state, true);
    let status = 'sent';
    let reason = '';
    let sessionFailure = false;
    try {
      const phone = formatDispatchPhone(attemptLead.phone);
      const message = renderDispatchTemplate(attemptLead.messageTemplate || input.template, attemptLead, input.senderName);
      await sendDispatchMessage(view, phone, message);
      variantRotation?.complete(true);
      state.sent += 1;
      recordDispatchHistory(state, attemptLead, 'sent');
    } catch (error) {
      variantRotation?.complete(false);
      if (isDispatchSessionError(error)) {
        state.workerError = error.message || String(error);
        distribution.queue.release(assignment.token);
        sessionFailure = true;
      } else {
        status = 'error';
        reason = error.message || String(error);
        state.errors += 1;
        state.failures.push({
          name: lead?.person?.name || '',
          phone: formatDispatchPhone(lead?.phone),
          reason
        });
        recordDispatchHistory(state, attemptLead, 'error', reason);
      }
    }
    if (sessionFailure) {
      setDispatchSending(state, false);
      publishDistributionState(distribution);
      break;
    }
    state.done += 1;
    distribution.queue.complete(assignment.token, status);
    setDispatchSending(state, false);

    const aggregate = distribution.queue.snapshot();
    publishDispatch('dispatch:progress', {
      profileId: profile.id,
      distributionId: distribution.id,
      done: state.done,
      total: state.total,
      sent: state.sent,
      successTarget: aggregate.target,
      distributionSent: aggregate.sent,
      distributionErrors: aggregate.errors,
      lead: attemptLead,
      status,
      error: reason
    });
    publishDistributionState(distribution);

    if (aggregate.finished || state.stopRequested || distribution.stopRequested) break;
    if (shouldWaitAfterDispatchAttempt(status)) {
      const base = Math.max(3, Number(input.delaySec) || 12) * 1000;
      await dispatchWait(state, input.jitter ? base + Math.random() * base * .5 : base);
    }
  }

  const stopped = state.stopRequested || distribution.stopRequested || Boolean(state.workerError);
  finishDispatchState(state);
  publishDispatch('dispatch:done', {
    profileId: profile.id,
    distributionId: distribution.id,
    sent: state.sent,
    errors: state.errors,
    successTarget: distribution.queue.snapshot().target,
    stopped,
    failures: state.failures,
    workerError: state.workerError
  });
  finishDistributionIfIdle(distribution);
}

function createView(profile) {
  const existingView = views.get(profile.id);
  if (existingView && !existingView.webContents.isDestroyed()) return existingView;
  if (existingView) views.delete(profile.id);
  notificationReadyProfiles.delete(profile.id);

  const partition = `persist:whatsapp-profile-${profile.id}`;
  const profileSession = session.fromPartition(partition);
  // O aplicativo mantém mídia liberada. As notificações Web do WhatsApp ficam
  // recusadas porque geramos toasts próprios com perfil e conversa no clique.
  profileSession.setPermissionCheckHandler((_webContents, permission) => WHATSAPP_ALLOWED_PERMISSIONS.has(permission));
  profileSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(WHATSAPP_ALLOWED_PERMISSIONS.has(permission));
  });

  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  view.webContents.setUserAgent(WHATSAPP_USER_AGENT);
  view.webContents.setZoomFactor(profile.zoom || 1);
  view.webContents.setBackgroundThrottling(!(profile.id === activeProfileId || runningDispatchState(profile.id)));
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('page-title-updated', (_event, title) => {
    const unread = unreadFromTitle(title);
    publishUnread(profile.id, unread);
  });
  view.webContents.once('did-finish-load', () => {
    syncSessionResourcePolicy();
    publishUnread(profile.id, unreadFromTitle(view.webContents.getTitle()), { allowNotification: false });
    notificationReadyProfiles.add(profile.id);
    syncLabelsToView(profile.id);
  });
  view.webContents.on('unresponsive', () => {
    console.warn(`[Central WhatsApp] Sessão ${profile.id} deixou de responder; tentando recuperar a superfície.`);
    if (profile.id === activeProfileId) recoverActiveBrowserSurface(view);
  });
  view.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Central WhatsApp] Renderer da sessão ${profile.id} encerrou (${details?.reason || 'motivo desconhecido'}).`);
    blankSurfaceStrikes.delete(profile.id);
    if (details?.reason === 'clean-exit') return;
    setTimeout(() => {
      if (isQuitting || views.get(profile.id) !== view) return;
      if (isBrowserViewAttached(window, view)) window.removeBrowserView(view);
      views.delete(profile.id);
      const profileStillExists = profiles.some((item) => item.id === profile.id);
      if (!profileStillExists || (profile.id !== activeProfileId && !runningDispatchState(profile.id))) return;
      createView(profile);
      if (profile.id === activeProfileId && !browserViewsSuspended) setActiveProfile(profile.id);
    }, 250);
  });
  view.webContents.loadURL(WHATSAPP_URL);
  views.set(profile.id, view);
  // O WebContents das sessões inativas continua conectado com economia de
  // renderização; a sessão visível e as que estão disparando ficam sem throttling.
  if (window && !browserViewsSuspended && profile.id === activeProfileId) {
    keepBrowserViewReady(window, view, activeViewBounds());
    resizeActiveView();
  }
  return view;
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Central WhatsApp Web',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    transparent: false,
    hasShadow: true,
    backgroundColor: '#171719',
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.once('did-finish-load', () => {
    if (pendingNotificationProfileId) {
      const profileId = pendingNotificationProfileId;
      const chatId = pendingNotificationChatId;
      pendingNotificationProfileId = null;
      pendingNotificationChatId = null;
      activateNotificationTarget(profileId, chatId);
    }
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.on('resize', resizeActiveView);
  window.on('show', syncUnreadIndicators);
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindowToTray();
  });
}

ipcMain.handle('profiles:list', () => profiles.map(profileForPublic));
ipcMain.handle('conversation-backup:create', (_event, profileId) => createConversationBackup(profileId));
ipcMain.handle('conversation-backup:cancel', (_event, profileId) => {
  conversationBackupCancellations.add(String(profileId || ''));
  return { ok: true };
});
ipcMain.handle('templates:list', () => templates.map(templateForPublic));
ipcMain.handle('templates:add', (_event, input) => {
  const name = String(input?.name || '').trim();
  const body = String(input?.body || '').trim();
  if (!name || !body) throw new Error('Informe o nome e o texto do modelo.');
  if (name.length > 60 || body.length > 4096) throw new Error('O modelo excede o tamanho permitido.');
  const normalizedBody = body.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  if (templates.some((template) => template.body.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === normalizedBody)) {
    throw new Error('Já existe um modelo salvo com este mesmo texto.');
  }
  templates.unshift({ id: crypto.randomUUID(), name, body });
  saveTemplates();
  return templates.map(templateForPublic);
});
ipcMain.handle('templates:update', (_event, input) => {
  const id = String(input?.id || '');
  const template = templates.find((item) => item.id === id);
  const name = String(input?.name || '').trim();
  const body = String(input?.body || '').trim();
  if (!template) throw new Error('O modelo não foi encontrado.');
  if (!name || !body) throw new Error('Informe o título e o texto do modelo.');
  if (name.length > 60 || body.length > 4096) throw new Error('O modelo excede o tamanho permitido.');
  const normalizedBody = body.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  if (templates.some((item) => item.id !== id && item.body.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === normalizedBody)) {
    throw new Error('Já existe outro modelo salvo com este mesmo texto.');
  }
  template.name = name;
  template.body = body;
  saveTemplates();
  return templates.map(templateForPublic);
});
ipcMain.handle('templates:remove', (_event, id) => {
  templates = templates.filter((template) => template.id !== id);
  saveTemplates();
  return templates.map(templateForPublic);
});
ipcMain.handle('labels:list', () => labelsData.labels.map(labelForPublic));
ipcMain.handle('labels:add', (_event, input) => {
  const name = String(input?.name || '').trim();
  const color = /^#[0-9a-f]{6}$/i.test(input?.color || '') ? input.color : '#2dd4bf';
  if (!name) throw new Error('Informe um nome para a etiqueta.');
  if (name.length > 30) throw new Error('A etiqueta pode ter no máximo 30 caracteres.');
  if (labelsData.labels.some((label) => label.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    throw new Error('Já existe uma etiqueta com esse nome.');
  }
  labelsData.labels.push({ id: crypto.randomUUID(), name, color });
  saveLabels();
  for (const profile of profiles) syncLabelsToView(profile.id);
  return labelsData.labels.map(labelForPublic);
});
ipcMain.handle('labels:remove', (_event, id) => {
  labelsData.labels = labelsData.labels.filter((label) => label.id !== id);
  for (const profileAssignments of Object.values(labelsData.assignments)) {
    for (const chatKey of Object.keys(profileAssignments)) {
      profileAssignments[chatKey] = profileAssignments[chatKey].filter((labelId) => labelId !== id);
      if (!profileAssignments[chatKey].length) delete profileAssignments[chatKey];
    }
  }
  saveLabels();
  for (const profile of profiles) syncLabelsToView(profile.id);
  return labelsData.labels.map(labelForPublic);
});
ipcMain.handle('labels:current-chat', async () => {
  if (!activeProfileId) throw new Error('Selecione um número primeiro.');
  const view = views.get(activeProfileId);
  if (!view) throw new Error('A sessão selecionada não está aberta.');
  const chatName = await view.webContents.executeJavaScript(`
    (() => {
      const visibleText = (element) => {
        if (!element) return '';
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width < 2 || rect.height < 2 || style.visibility === 'hidden' || style.display === 'none') return '';
        return (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ');
      };
      const precise = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
      const preciseName = visibleText(precise);
      if (preciseName) return preciseName;
      const candidates = [...document.querySelectorAll('header span[dir="auto"], header [title]')]
        .filter((element) => element.getBoundingClientRect().left > window.innerWidth * .28)
        .map(visibleText)
        .filter((text) => text && text.length <= 120);
      return candidates[0] || '';
    })();
  `);
  if (!chatName) throw new Error('Abra uma conversa no WhatsApp antes de usar etiquetas.');
  return { profileId: activeProfileId, chatKey: chatName, chatName, labels: labelsForChat(activeProfileId, chatName) };
});
ipcMain.handle('labels:toggle-chat', (_event, input) => {
  const profileId = String(input?.profileId || '');
  const chatKey = String(input?.chatKey || '');
  const labelId = String(input?.labelId || '');
  if (!profiles.some((profile) => profile.id === profileId) || !chatKey || !labelsData.labels.some((label) => label.id === labelId)) {
    throw new Error('Não foi possível atualizar a etiqueta.');
  }
  labelsData.assignments[profileId] ||= {};
  const selected = new Set(labelsData.assignments[profileId][chatKey] || []);
  if (selected.has(labelId)) selected.delete(labelId);
  else selected.add(labelId);
  if (selected.size) labelsData.assignments[profileId][chatKey] = [...selected];
  else delete labelsData.assignments[profileId][chatKey];
  saveLabels();
  syncLabelsToView(profileId);
  return labelsForChat(profileId, chatKey);
});
ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text || ''));
});
ipcMain.handle('dispatch:state', (_event, profileId) => dispatchPublicState(String(profileId || activeProfileId || '')));
ipcMain.handle('dispatch:states', () => dispatchStatesPublic());
ipcMain.handle('dispatch:stop', (_event, profileId) => {
  const state = runningDispatchState(String(profileId || ''));
  if (!state) return { ok: false, error: 'Não existe um disparo em andamento neste número.' };
  state.stopRequested = true;
  state.paused = false;
  publishDispatchState(state);
  return { ok: true, state: dispatchPublicState(state) };
});
ipcMain.handle('dispatch:toggle-pause', (_event, profileId) => {
  const state = runningDispatchState(String(profileId || ''));
  if (!state) return { ok: false, error: 'Não existe um disparo em andamento neste número.' };
  state.paused = !state.paused;
  publishDispatchState(state);
  return { ok: true, state: dispatchPublicState(state) };
});
function startDispatchInternal(input, requestedProfileId) {
  if (!requestedProfileId) return { ok: false, error: 'Selecione um número do WhatsApp.' };
  const profile = profiles.find((item) => item.id === requestedProfileId);
  if (!profile) return { ok: false, error: 'O perfil selecionado não foi encontrado.' };
  if (!canStartDispatchForProfile(dispatchStates, profile.id)) {
    return { ok: false, error: 'Este número já possui um disparo em andamento.' };
  }
  const requestedCampaignId = String(input?.campaignId || '').trim().slice(0, 80);
  if (requestedCampaignId && [...dispatchStates.values()].some((state) => state.running && state.campaignId === requestedCampaignId)) {
    return { ok: false, error: 'Esta campanha já possui um disparo em andamento.' };
  }

  const rawLeads = Array.isArray(input?.leads) ? input.leads.slice(0, MAX_DISPATCH_CONTACTS) : [];
  if (!rawLeads.length) return { ok: false, error: 'A lista de telefones está vazia.' };
  const template = String(input?.template || '').trim();
  if (!template) return { ok: false, error: 'A mensagem não pode ficar vazia.' };
  if (template.length > 4096) return { ok: false, error: 'A mensagem excede 4096 caracteres.' };
  const messageVariants = normalizeMessageVariants(input?.messageVariants);

  let leads;
  try {
    leads = rawLeads.map(parseDispatchLead);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  const delaySec = Math.min(120, Math.max(3, Number(input?.delaySec) || 12));
  const state = createDispatchState(profile.id);
  state.running = true;
  state.batchId = crypto.randomUUID();
  state.campaignId = requestedCampaignId;
  state.successTarget = normalizeEffectiveTarget(state.campaignId, input?.successTarget, leads.length);
  state.startedAt = new Date().toISOString();
  state.profileName = profile.name;
  state.releaseBetweenSends = releasesProfileBetweenSends(delaySec);
  state.delaySec = delaySec;
  state.total = leads.length;
  dispatchStates.set(profile.id, state);

  const view = createView(profile);
  if (!state.releaseBetweenSends && activeProfileId === profile.id && window.getBrowserViews().includes(view)) {
    state.restoreSenderView = true;
    window.removeBrowserView(view);
  }

  runDispatch({
    leads,
    template,
    messageVariants,
    senderName: String(input?.senderName || '').trim().slice(0, 80),
    delaySec,
    jitter: input?.jitter !== false,
    profileId: profile.id
  }, state).catch((error) => {
    console.error('[Central WhatsApp] Falha no lote:', error);
    setDispatchSending(state, false);
    const remaining = state.successTarget ? 0 : Math.max(0, state.total - state.done);
    state.errors += remaining;
    if (!state.successTarget) state.done = state.total;
    if (remaining > 0) {
      for (let index = state.done - remaining; index < state.total; index += 1) {
        const lead = leads[index] || leads[0];
        state.failures.push({
          name: lead?.person?.name || '',
          phone: formatDispatchPhone(lead?.phone),
          reason: error.message || String(error)
        });
        recordDispatchHistory(state, lead, 'error', error.message || String(error));
      }
    }
    finishDispatchState(state);
    publishDispatch('dispatch:progress', {
      profileId: profile.id,
      done: state.done,
      total: state.total,
      sent: state.sent,
      successTarget: state.successTarget,
      lead: leads[state.done - remaining] || leads[0],
      status: 'error',
      error: error.message || String(error)
    });
    publishDispatch('dispatch:done', {
      profileId: profile.id,
      sent: state.sent,
      errors: state.errors,
      successTarget: state.successTarget,
      stopped: false,
      failures: state.failures
    });
  });

  publishDispatchState(state);
  return { ok: true, profileId: profile.id, profileName: profile.name, state: dispatchPublicState(state) };
}

function startDistributionInternal(input) {
  if (!campaignStore) return { ok: false, error: 'O gerenciador de campanhas ainda não está pronto.' };
  const campaignId = String(input?.campaignId || '').trim().slice(0, 80);
  if (!campaignId) return { ok: false, error: 'Selecione uma campanha para distribuir.' };
  if ([...dispatchStates.values()].some((state) => state.running && state.campaignId === campaignId)) {
    return { ok: false, error: 'Esta campanha já possui um disparo em andamento.' };
  }

  const profileIds = [...new Set((Array.isArray(input?.profileIds) ? input.profileIds : []).map(String).filter(Boolean))];
  if (!profileIds.length) return { ok: false, error: 'Selecione pelo menos um número remetente.' };
  const selectedProfiles = profileIds.map((id) => profiles.find((profile) => profile.id === id));
  if (selectedProfiles.some((profile) => !profile)) return { ok: false, error: 'Um dos números selecionados não foi encontrado.' };
  const busyProfile = selectedProfiles.find((profile) => !canStartDispatchForProfile(dispatchStates, profile.id));
  if (busyProfile) return { ok: false, error: `${busyProfile.name} já possui um disparo em andamento.` };

  const template = String(input?.template || '').trim();
  if (!template) return { ok: false, error: 'A mensagem não pode ficar vazia.' };
  if (template.length > 4096) return { ok: false, error: 'A mensagem excede 4096 caracteres.' };
  const messageVariants = normalizeMessageVariants(input?.messageVariants);

  const mode = input?.mode === 'errors' ? 'errors' : 'pending';
  let campaignSelection;
  try {
    campaignSelection = campaignStore.contactsForDispatch(campaignId, mode, MAX_DISPATCH_CONTACTS);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
  if (!campaignSelection.leads.length) {
    return { ok: false, error: mode === 'errors' ? 'A campanha não possui erros para tentar novamente.' : 'A campanha não possui contatos pendentes.' };
  }

  const messageAssignments = new Map();
  try {
    for (const rawLead of Array.isArray(input?.leads) ? input.leads : []) {
      const lead = parseDispatchLead(rawLead, messageAssignments.size);
      messageAssignments.set(formatDispatchPhone(lead.phone), lead);
    }
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  const leads = campaignSelection.leads.map((rawLead, index) => {
    const lead = parseDispatchLead(rawLead, index);
    const assigned = messageAssignments.get(formatDispatchPhone(lead.phone));
    if (!assigned) return lead;
    return {
      ...lead,
      messageTemplate: assigned.messageTemplate,
      messageTemplateName: assigned.messageTemplateName
    };
  });
  const target = Math.max(1, Math.min(leads.length, Number(input?.successTarget) || 50));
  const distributionMode = input?.distributionMode === 'custom' ? 'custom' : 'balanced';
  const profileTargets = {};
  if (distributionMode === 'custom') {
    for (const profileId of profileIds) {
      profileTargets[profileId] = Math.max(0, Number(input?.profileTargets?.[profileId]) || 0);
      if (!profileTargets[profileId]) return { ok: false, error: 'Informe uma cota maior que zero para cada número selecionado.' };
    }
    const targetSum = Object.values(profileTargets).reduce((sum, value) => sum + value, 0);
    if (targetSum !== target) return { ok: false, error: `A soma das cotas deve ser igual à meta global de ${target}.` };
  }
  const distribution = {
    id: crypto.randomUUID(),
    campaignId,
    campaignName: campaignSelection.campaign.name,
    mode,
    distributionMode,
    profileIds,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    stopRequested: false,
    queue: createDistributionQueue(leads, target, profileIds, profileTargets)
  };
  distributions.set(distribution.id, distribution);

  const delaySec = Math.min(120, Math.max(3, Number(input?.delaySec) || 12));
  const workerInput = {
    template,
    messageVariants,
    senderName: String(input?.senderName || '').trim().slice(0, 80),
    delaySec,
    jitter: input?.jitter !== false
  };
  for (const profile of selectedProfiles) {
    const state = createDispatchState(profile.id);
    state.running = true;
    state.batchId = distribution.id;
    state.campaignId = campaignId;
    state.distributionId = distribution.id;
    state.startedAt = distribution.startedAt;
    state.profileName = profile.name;
    state.releaseBetweenSends = releasesProfileBetweenSends(delaySec);
    state.delaySec = delaySec;
    state.total = target;
    dispatchStates.set(profile.id, state);

    const view = createView(profile);
    if (!state.releaseBetweenSends && activeProfileId === profile.id && window.getBrowserViews().includes(view)) {
      state.restoreSenderView = true;
      window.removeBrowserView(view);
    }
    publishDispatchState(state);
    runDistributedWorker(distribution, profile, workerInput, state).catch((error) => {
      console.error('[Central WhatsApp] Falha no trabalhador da distribuição:', error);
      state.workerError = error.message || String(error);
      setDispatchSending(state, false);
      finishDispatchState(state);
      publishDispatch('dispatch:done', {
        profileId: profile.id,
        distributionId: distribution.id,
        sent: state.sent,
        errors: state.errors,
        successTarget: target,
        stopped: false,
        failures: state.failures,
        workerError: state.workerError
      });
      finishDistributionIfIdle(distribution);
    });
  }
  publishDistributionState(distribution);
  return { ok: true, distribution: distributionPublicState(distribution) };
}

ipcMain.handle('dispatch:start', (_event, input) => startDispatchInternal(input, activeProfileId));
ipcMain.handle('dispatch:distributions:list', () => distributionsPublic());
ipcMain.handle('dispatch:distribution:start', (_event, input) => startDistributionInternal(input));
ipcMain.handle('dispatch:distribution:stop', (_event, distributionId) => {
  const distribution = distributions.get(String(distributionId || ''));
  if (!distribution || distribution.finishedAt) return { ok: false, error: 'Não existe uma distribuição em andamento.' };
  distribution.stopRequested = true;
  distribution.queue.stop();
  for (const profileId of distribution.profileIds) {
    const state = runningDispatchState(profileId);
    if (!state || state.distributionId !== distribution.id) continue;
    state.stopRequested = true;
    state.paused = false;
    publishDispatchState(state);
  }
  publishDistributionState(distribution);
  return { ok: true, distribution: distributionPublicState(distribution) };
});
ipcMain.handle('dispatch:distribution:toggle-pause', (_event, distributionId) => {
  const distribution = distributions.get(String(distributionId || ''));
  if (!distribution || distribution.finishedAt) return { ok: false, error: 'Não existe uma distribuição em andamento.' };
  const runningWorkers = distribution.profileIds
    .map((profileId) => runningDispatchState(profileId))
    .filter((state) => state?.distributionId === distribution.id);
  const pause = !runningWorkers.length || !runningWorkers.every((state) => state.paused);
  for (const state of runningWorkers) {
    state.paused = pause;
    publishDispatchState(state);
  }
  publishDistributionState(distribution);
  return { ok: true, distribution: distributionPublicState(distribution) };
});
ipcMain.handle('dispatch:schedules:list', () => scheduledDispatchesPublic());
ipcMain.handle('dispatch:schedule', (_event, input) => {
  if (scheduledDispatches.filter((item) => item.status !== 'failed').length >= MAX_SCHEDULED_DISPATCHES) {
    return { ok: false, error: `Limite de ${MAX_SCHEDULED_DISPATCHES} agendamentos pendentes atingido.` };
  }
  const scheduleType = input?.type === 'distribution' ? 'distribution' : 'single';
  const requestedProfileIds = scheduleType === 'distribution'
    ? [...new Set((Array.isArray(input?.profileIds) ? input.profileIds : []).map(String).filter(Boolean))]
    : [String(input?.profileId || '')].filter(Boolean);
  if (!requestedProfileIds.length) return { ok: false, error: 'Selecione pelo menos um número do WhatsApp.' };
  const selectedProfiles = requestedProfileIds.map((profileId) => profiles.find((item) => item.id === profileId));
  if (selectedProfiles.some((profile) => !profile)) return { ok: false, error: 'Um dos números selecionados não foi encontrado.' };
  const date = validateScheduledAt(input?.scheduledAt);
  if (!date.ok) return date;

  const rawLeads = Array.isArray(input?.leads) ? input.leads.slice(0, MAX_DISPATCH_CONTACTS) : [];
  if (!rawLeads.length) return { ok: false, error: 'A lista de telefones está vazia.' };
  const template = String(input?.template || '').trim();
  if (!template) return { ok: false, error: 'A mensagem não pode ficar vazia.' };
  if (template.length > 4096) return { ok: false, error: 'A mensagem excede 4096 caracteres.' };
  const messageVariants = normalizeMessageVariants(input?.messageVariants);

  let leads;
  try {
    leads = rawLeads.map(parseDispatchLead);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  const campaignId = String(input?.campaignId || '').trim().slice(0, 80);
  const successTarget = Math.max(0, Math.min(MAX_DISPATCH_CONTACTS, Number(input?.successTarget) || 0));
  let scheduledSuccessTarget = successTarget;
  const distributionMode = input?.distributionMode === 'custom' ? 'custom' : 'balanced';
  const profileTargets = {};
  if (scheduleType === 'distribution') {
    if (!campaignId) return { ok: false, error: 'Selecione uma campanha para agendar a distribuição.' };
    scheduledSuccessTarget = Math.max(1, Math.min(leads.length, successTarget || 50));
    if (distributionMode === 'custom') {
      for (const profileId of requestedProfileIds) {
        profileTargets[profileId] = Math.max(0, Number(input?.profileTargets?.[profileId]) || 0);
        if (!profileTargets[profileId]) return { ok: false, error: 'Informe uma cota maior que zero para cada número selecionado.' };
      }
      const targetSum = Object.values(profileTargets).reduce((sum, value) => sum + value, 0);
      if (targetSum !== scheduledSuccessTarget) return { ok: false, error: `A soma das cotas deve ser igual à meta global de ${scheduledSuccessTarget}.` };
    }
  }

  const item = {
    id: crypto.randomUUID(),
    type: scheduleType,
    profileId: selectedProfiles[0].id,
    profileIds: requestedProfileIds,
    profileName: selectedProfiles[0].name,
    scheduledAt: date.iso,
    createdAt: new Date().toISOString(),
    status: 'pending',
    error: '',
    input: {
      leads,
      template,
      messageVariants,
      senderName: String(input?.senderName || '').trim().slice(0, 80),
      delaySec: Math.min(120, Math.max(3, Number(input?.delaySec) || 12)),
      jitter: input?.jitter !== false,
      campaignId,
      successTarget: scheduledSuccessTarget,
      ...(scheduleType === 'distribution' ? {
        mode: input?.mode === 'errors' ? 'errors' : 'pending',
        profileIds: requestedProfileIds,
        distributionMode,
        profileTargets
      } : {})
    }
  };
  scheduledDispatches.push(item);
  saveScheduledDispatches();
  publishScheduledDispatches();
  scheduleNextDispatchCheck();
  return { ok: true, schedule: scheduledDispatchForPublic(item), schedules: scheduledDispatchesPublic() };
});
ipcMain.handle('dispatch:schedule:cancel', (_event, id) => {
  scheduledDispatches = scheduledDispatches.filter((item) => item.id !== id);
  saveScheduledDispatches();
  publishScheduledDispatches();
  scheduleNextDispatchCheck();
  return scheduledDispatchesPublic();
});
ipcMain.handle('dispatch:failures:save', async (_event, failures) => {
  const rows = normalizeDispatchFailures(failures);
  if (!rows.length) return { ok: false, error: 'Não há falhas para salvar.' };
  const result = await dialog.showSaveDialog(window, {
    title: 'Salvar relatório de falhas',
    defaultPath: `falhas-disparo-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, createDispatchFailuresCsv(rows), 'utf8');
  return { ok: true, filePath: result.filePath };
});
ipcMain.handle('dispatch:history:list', (_event, filters) => filterDispatchHistory(dispatchHistory, filters));
ipcMain.handle('dispatch:history:save', async (_event, filters) => {
  const rows = filterDispatchHistory(dispatchHistory, { ...filters, limit: MAX_DISPATCH_HISTORY });
  if (!rows.length) return { ok: false, error: 'Não há registros no histórico para salvar.' };
  const result = await dialog.showSaveDialog(window, {
    title: 'Salvar histórico de disparos',
    defaultPath: `historico-disparos-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, createDispatchHistoryCsv(rows), 'utf8');
  return { ok: true, filePath: result.filePath };
});
ipcMain.handle('campaigns:list', () => campaignStore?.listCampaigns() || []);
ipcMain.handle('campaigns:create', (_event, input) => {
  if (!campaignStore) return { ok: false, error: 'O gerenciador de campanhas ainda não está pronto.' };
  const rawLeads = Array.isArray(input?.leads) ? input.leads.slice(0, MAX_CAMPAIGN_CONTACTS) : [];
  if (!rawLeads.length) return { ok: false, error: 'A planilha não possui contatos válidos.' };
  let leads;
  try {
    leads = rawLeads.map(parseDispatchLead);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
  const result = campaignStore.createCampaign({
    id: crypto.randomUUID(),
    name: String(input?.name || '').trim().slice(0, 100),
    sourceName: String(input?.sourceName || '').trim().slice(0, 180),
    sourceHash: String(input?.sourceHash || '').trim().slice(0, 128),
    repeatDays: input?.repeatDays,
    originalCount: input?.originalCount,
    invalidCount: input?.invalidCount,
    duplicateCount: input?.duplicateCount,
    leads
  });
  if (result.ok) publishDispatch('campaigns:changed', { campaignId: result.campaign.id });
  return { ...result, campaigns: campaignStore.listCampaigns() };
});
ipcMain.handle('campaigns:contacts', (_event, input) => {
  if (!campaignStore) throw new Error('O gerenciador de campanhas ainda não está pronto.');
  const limit = Math.max(1, Math.min(MAX_DISPATCH_CONTACTS, Number(input?.limit) || 50));
  return campaignStore.contactsForDispatch(String(input?.campaignId || ''), input?.mode, limit);
});
ipcMain.handle('campaigns:release-skipped', (_event, campaignId) => {
  if (!campaignStore) throw new Error('O gerenciador de campanhas ainda não está pronto.');
  const campaign = campaignStore.releaseSkipped(String(campaignId || ''));
  publishDispatch('campaigns:changed', { campaignId: campaign?.id || '' });
  return { campaign, campaigns: campaignStore.listCampaigns() };
});
ipcMain.handle('campaigns:remove', (_event, campaignId) => {
  if (!campaignStore) throw new Error('O gerenciador de campanhas ainda não está pronto.');
  const campaigns = campaignStore.removeCampaign(String(campaignId || ''));
  publishDispatch('campaigns:changed', { campaignId: String(campaignId || '') });
  return campaigns;
});
ipcMain.handle('campaigns:export', async (_event, campaignId) => {
  if (!campaignStore) return { ok: false, error: 'O gerenciador de campanhas ainda não está pronto.' };
  const campaign = campaignStore.listCampaigns().find((item) => item.id === String(campaignId || ''));
  if (!campaign) return { ok: false, error: 'A campanha não foi encontrada.' };
  const result = await dialog.showSaveDialog(window, {
    title: 'Exportar resultados da campanha',
    defaultPath: `campanha-${campaign.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'contatos'}.csv`,
    filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, campaignStore.createCampaignCsv(campaign.id), 'utf8');
  return { ok: true, filePath: result.filePath };
});
ipcMain.handle('profiles:begin-add', () => hideActiveView());
ipcMain.handle('profiles:cancel-add', () => showActiveView());
ipcMain.handle('profiles:insert-text', (_event, text) => {
  const message = String(text || '');
  if (!message) return;
  showActiveView();
  const view = views.get(activeProfileId);
  if (!view) return;
  view.webContents.focus();
  // Insere apenas no campo que já está ativo na conversa; não aciona envio.
  view.webContents.insertText(message);
});
ipcMain.handle('profiles:add', (_event, input) => {
  const name = String(input?.name || '').trim();
  const color = /^#[0-9a-f]{6}$/i.test(input?.color || '') ? input.color : '#00a884';
  if (!name) throw new Error('Informe um nome para o número.');

  const profile = { id: crypto.randomUUID(), name, color, zoom: 1 };
  profiles.push(profile);
  saveProfiles();
  browserViewsSuspended = false;
  createView(profile);
  setActiveProfile(profile.id);
  return { profiles: profiles.map(profileForPublic), activeProfileId };
});
ipcMain.handle('profiles:select', (_event, id) => {
  const profile = profiles.find((item) => item.id === id);
  if (!profile) throw new Error('Perfil não encontrado.');
  if (isProfileDispatchLocked(id)) {
    throw new Error('Este número está enviando uma mensagem agora. Aguarde alguns segundos.');
  }
  browserViewsSuspended = false;
  createView(profile);
  setActiveProfile(id);
  return { activeProfileId, zoom: profile.zoom || 1 };
});
ipcMain.handle('profiles:set-zoom', (_event, input) => {
  const profile = profiles.find((item) => item.id === input?.id);
  if (!profile) throw new Error('Perfil não encontrado.');
  const zoom = Math.min(1.5, Math.max(0.75, Number(input?.zoom) || 1));
  profile.zoom = Math.round(zoom * 100) / 100;
  createView(profile).webContents.setZoomFactor(profile.zoom);
  saveProfiles();
  return { zoom: profile.zoom };
});
ipcMain.handle('profiles:rename', (_event, input) => {
  const profile = profiles.find((item) => item.id === input?.id);
  const name = String(input?.name || '').trim();
  if (!profile) throw new Error('Perfil não encontrado.');
  if (runningDispatchState(profile.id)) throw new Error('Não é possível editar o número durante o disparo.');
  if (!name) throw new Error('Informe um nome para o número.');
  if (name.length > 40) throw new Error('O nome pode ter no máximo 40 caracteres.');
  profile.name = name;
  saveProfiles();
  return profiles.map(profileForPublic);
});
ipcMain.handle('profiles:reorder', (_event, input) => {
  const sourceIndex = profiles.findIndex((item) => item.id === input?.id);
  const targetIndex = profiles.findIndex((item) => item.id === input?.targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return profiles.map(profileForPublic);

  const [profile] = profiles.splice(sourceIndex, 1);
  const adjustedTargetIndex = profiles.findIndex((item) => item.id === input.targetId);
  const insertAt = input.position === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  profiles.splice(insertAt, 0, profile);
  saveProfiles();
  return profiles.map(profileForPublic);
});
ipcMain.handle('profiles:remove', (_event, id) => {
  if (runningDispatchState(id)) throw new Error('Não é possível remover o número durante o disparo.');
  const index = profiles.findIndex((item) => item.id === id);
  if (index < 0) return { profiles: profiles.map(profileForPublic), activeProfileId };
  const [profile] = profiles.splice(index, 1);
  const view = views.get(profile.id);
  if (view) {
    window.removeBrowserView(view);
    view.webContents.close();
    views.delete(profile.id);
  }
  unreadByProfile.delete(profile.id);
  notificationReadyProfiles.delete(profile.id);
  notificationRevisions.delete(profile.id);
  syncUnreadIndicators();
  if (activeProfileId === id) {
    activeProfileId = profiles[0]?.id ?? null;
    if (activeProfileId) {
      createView(profiles[0]);
      setActiveProfile(activeProfileId);
    }
  }
  saveProfiles();
  return { profiles: profiles.map(profileForPublic), activeProfileId };
});

if (hasSingleInstanceLock) app.whenReady().then(() => {
  profiles = loadProfiles();
  templates = loadTemplates();
  labelsData = loadLabels();
  settings = loadSettings();
  dispatchHistory = loadDispatchHistory();
  campaignStore = new CampaignStore(path.join(app.getPath('userData'), 'campaigns.db'));
  campaignStore.seedSentRegistry(dispatchHistory);
  if (typeof settings.startWithWindows !== 'boolean') settings.startWithWindows = true;
  saveSettings();
  syncWindowsStartup(app, settings.startWithWindows);
  rebuildApplicationMenu();
  const templateMigration = applySemNomeVariantsMigration(templates, settings, () => crypto.randomUUID());
  templates = templateMigration.templates;
  settings = templateMigration.settings;
  if (templateMigration.added) {
    backupTemplatesBeforeMigration();
    saveTemplates();
  }
  if (templateMigration.migrated) saveSettings();
  scheduledDispatches = loadScheduledDispatches();
  try {
    ensureWindowsNotificationShortcut();
  } catch (error) {
    console.warn('[Central WhatsApp] Não foi possível preparar o atalho de notificações:', error);
  }
  // Cobre cliques em toasts que o Windows preservou na Central de Ações,
  // inclusive quando o objeto Notification original não está mais em memória.
  if (process.platform === 'win32' && typeof Notification.handleActivation === 'function') {
    Notification.handleActivation((details) => {
      handleNotificationActivation(details);
    });
  }
  createTray();
  createWindow();
  appUpdaterController = createAppUpdater({
    autoUpdater,
    app,
    dialog,
    getWindow: () => window,
    hasActiveDispatches
  });
  appUpdaterController.start();
  preloadProfiles(profiles, { createView, setActiveProfile });
  if (startHidden) {
    hideActiveView();
    window.hide();
  }
  startSurfaceHealthMonitor();
  scheduleNextDispatchCheck();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => showMainWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  clearInterval(surfaceHealthTimer);
  surfaceHealthTimer = null;
  appUpdaterController?.stop();
  campaignStore?.close();
  campaignStore = null;
});
