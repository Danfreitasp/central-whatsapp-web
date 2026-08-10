const { contextBridge } = require('electron');

const profiles = [
  { id: 'vermelho', name: 'Telefone Vermelho', color: '#ef4444', zoom: 1, unread: 0 },
  { id: 'azul', name: 'Telefone Azul', color: '#3b82f6', zoom: 1, unread: 0 }
];
let profileActivatedCallback = null;
let campaignsChangedCallback = null;

const campaign = {
  id: 'campanha-1', name: 'Clientes agosto', sourceName: 'agosto.xlsx', repeatDays: 90,
  createdAt: '2026-08-03T12:00:00.000Z', updatedAt: '2026-08-03T12:00:00.000Z',
  originalCount: 5, invalidCount: 1, duplicateCount: 1, contactCount: 3,
  pendingCount: 2, sentCount: 0, errorCount: 0, skippedCount: 1
};

contextBridge.exposeInMainWorld('centralWhatsApp', {
  listProfiles: async () => profiles,
  listTemplates: async () => [],
  beginAdd: async () => {},
  cancelAdd: async () => {},
  listDispatchHistory: async (filters = {}) => [
    { id: 'h1', occurredAt: '2026-08-03T12:00:00.000Z', profileId: 'vermelho', profileName: 'Telefone Vermelho', name: 'Maria', phone: '5527999991111', modelName: 'Modelo 1', status: 'sent', reason: '' },
    { id: 'h2', occurredAt: '2026-08-03T12:01:00.000Z', profileId: 'azul', profileName: 'Telefone Azul', name: 'João', phone: '5527999992222', modelName: 'Modelo 2', status: 'error', reason: 'Não encontrado' }
  ].filter((item) => !filters.profileId || item.profileId === filters.profileId).filter((item) => !filters.status || item.status === filters.status),
  saveDispatchHistory: async () => ({ ok: true }),
  listCampaigns: async () => [campaign],
  getCampaignContacts: async (input = {}) => ({
    campaign,
    mode: 'pending',
    leads: [
      { person: { name: 'Maria' }, phone: { areaCode: '27', number: '999990001' }, opportunities: { available: {}, won: {} } },
      { person: { name: 'João' }, phone: { areaCode: '27', number: '999990002' }, opportunities: { available: {}, won: {} } }
    ].slice(0, Number(input.limit) || 2)
  }),
  createCampaign: async () => ({ ok: true, campaign, campaigns: [campaign] }),
  releaseCampaignSkipped: async () => ({ campaign: { ...campaign, pendingCount: 3, skippedCount: 0 }, campaigns: [] }),
  removeCampaign: async () => [],
  exportCampaign: async () => ({ ok: true }),
  simulateProfileActivation: (profileId) => profileActivatedCallback?.({ profileId }),
  listScheduledDispatches: async () => [],
  getDispatchState: async (profileId) => ({ profileId, running: false, paused: false, sending: false, releaseBetweenSends: false, lockedProfileId: null, done: 0, total: 0, sent: 0, errors: 0 }),
  getDispatchStates: async () => [
    { profileId: 'vermelho', running: true, paused: false, sending: false, releaseBetweenSends: false, lockedProfileId: 'vermelho', done: 2, total: 10, sent: 2, errors: 0 },
    { profileId: 'azul', running: true, paused: false, sending: false, releaseBetweenSends: true, lockedProfileId: null, done: 4, total: 20, sent: 4, errors: 0 }
  ],
  listDistributions: async () => [],
  startDistribution: async () => ({ ok: false }),
  stopDistribution: async () => ({ ok: false }),
  toggleDistributionPause: async () => ({ ok: false }),
  stopDispatch: async () => ({ ok: true }),
  toggleDispatchPause: async () => ({ ok: true }),
  onUnreadChanged: () => {},
  onProfileActivated: (callback) => { profileActivatedCallback = callback; },
  onScheduledDispatchesChanged: () => {},
  onScheduledDispatchTriggered: () => {},
  onDispatchStateChanged: () => {},
  onDispatchProgress: () => {},
  onDispatchDone: () => {},
  onDistributionStateChanged: () => {},
  onDistributionDone: () => {},
  onDispatchHistoryChanged: () => {},
  onCampaignsChanged: (callback) => { campaignsChangedCallback = callback; }
});
