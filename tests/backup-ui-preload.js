const { contextBridge } = require('electron');

const profiles = [{ id: 'comercial', name: 'Comercial', color: '#22c55e', zoom: 1, unread: 0 }];
let progressCallback = null;

const empty = async () => [];
const noop = async () => ({ ok: true });
const listen = () => {};

contextBridge.exposeInMainWorld('centralWhatsApp', {
  listProfiles: async () => profiles,
  listTemplates: empty,
  listLabels: empty,
  listCampaigns: empty,
  listDispatchHistory: empty,
  listDistributions: empty,
  listScheduledDispatches: empty,
  getDispatchStates: empty,
  getDispatchState: async (profileId) => ({ profileId, running: false, done: 0, total: 0, sent: 0, errors: 0 }),
  getCurrentChatLabels: empty,
  beginAdd: noop,
  cancelAdd: noop,
  addLabel: noop,
  removeLabel: noop,
  addProfile: noop,
  selectProfile: async () => ({ activeProfileId: 'comercial', zoom: 1 }),
  setZoom: async () => ({ zoom: 1 }),
  renameProfile: async () => profiles,
  reorderProfiles: async () => profiles,
  removeProfile: async () => ({ profiles, activeProfileId: 'comercial' }),
  addTemplate: noop,
  updateTemplate: noop,
  removeTemplate: empty,
  toggleChatLabel: noop,
  copyText: noop,
  createCampaign: noop,
  getCampaignContacts: async () => ({ leads: [] }),
  releaseCampaignSkipped: noop,
  removeCampaign: empty,
  exportCampaign: noop,
  saveDispatchFailures: noop,
  saveDispatchHistory: noop,
  scheduleDispatch: noop,
  cancelScheduledDispatch: empty,
  startDispatch: noop,
  startDistribution: noop,
  stopDispatch: noop,
  stopDistribution: noop,
  toggleDispatchPause: noop,
  toggleDistributionPause: noop,
  onUnreadChanged: listen,
  onProfileActivated: listen,
  onDispatchProgress: listen,
  onDispatchStateChanged: listen,
  onScheduledDispatchesChanged: listen,
  onScheduledDispatchTriggered: listen,
  onDispatchDone: listen,
  onDistributionStateChanged: listen,
  onDistributionDone: listen,
  onDispatchHistoryChanged: listen,
  onCampaignsChanged: listen,
  onConversationBackupProgress: (callback) => { progressCallback = callback; },
  backupConversation: async () => {
    progressCallback?.({ phase: 'audio', current: 1, total: 2, message: 'Baixando áudio 1 de 2…' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    progressCallback?.({ phase: 'done', current: 1, total: 1, message: 'Backup concluído.' });
    return { ok: true, messageCount: 87, audioCount: 2, audioFailureCount: 1, screenshotCount: 4 };
  },
  cancelConversationBackup: noop
});
