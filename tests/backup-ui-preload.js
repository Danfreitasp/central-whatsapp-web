const { contextBridge } = require('electron');

const profiles = [{ id: 'comercial', name: 'Comercial', color: '#22c55e', zoom: 1, unread: 0 }];
let progressCallback = null;
let searchProgressCallback = null;

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
  onGlobalSearchProgress: (callback) => { searchProgressCallback = callback; },
  getGlobalSearchIndexStatus: async () => ({ indexedProfiles: 1, profileCount: 1, chatCount: 2, messageCount: 345, lastIndexedAt: '2026-09-02T12:00:00.000Z' }),
  searchAllConversations: async ({ query, mode }) => {
    searchProgressCallback?.({ message: mode === 'complete' ? 'Atualizando o índice…' : 'Busca rápida…' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      cancelled: false,
      mode,
      searchedProfiles: 1,
      failures: [],
      phoneOnlyProfiles: [],
      indexStatus: { indexedProfiles: 1, profileCount: 1, chatCount: 2, messageCount: 345, lastIndexedAt: '2026-09-02T12:00:00.000Z' },
      results: [{
        profileId: 'comercial', profileName: 'Comercial', profileColor: '#22c55e',
        chatId: '5527999991234@c.us', chatName: 'João', phone: '5527999991234',
        messageId: 'm1', snippet: `Resultado para ${query}`, timestamp: 1788364800
      }]
    };
  },
  rebuildGlobalSearchIndex: async () => ({ cancelled: false, failures: [], searchedProfiles: 1, indexStatus: { indexedProfiles: 1, profileCount: 1, chatCount: 2, messageCount: 345, lastIndexedAt: '2026-09-02T12:00:00.000Z' } }),
  clearGlobalSearchIndex: async () => ({ indexedProfiles: 0, profileCount: 1, chatCount: 0, messageCount: 0, lastIndexedAt: '' }),
  cancelGlobalSearch: noop,
  openGlobalSearchResult: noop,
  backupConversation: async () => {
    progressCallback?.({ phase: 'audio', current: 1, total: 2, message: 'Baixando áudio 1 de 2…' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    progressCallback?.({ phase: 'done', current: 1, total: 1, message: 'Backup concluído.' });
    return { ok: true, messageCount: 87, audioCount: 2, audioFailureCount: 1, screenshotCount: 4 };
  },
  cancelConversationBackup: noop
});
