const { contextBridge } = require('electron');

const profiles = [
  { id: 'vermelho', name: 'Telefone Vermelho', color: '#ef4444', zoom: 1, unread: 0 },
  { id: 'azul', name: 'Telefone Azul', color: '#3b82f6', zoom: 1, unread: 0 },
  { id: 'verde', name: 'Telefone Verde', color: '#22c55e', zoom: 1, unread: 0 }
];
const campaign = {
  id: 'campanha-1', name: 'Clientes agosto', sourceName: 'agosto.xlsx', repeatDays: 90,
  createdAt: '2026-08-03T12:00:00.000Z', updatedAt: '2026-08-03T12:00:00.000Z',
  originalCount: 100, invalidCount: 2, duplicateCount: 3, contactCount: 95,
  pendingCount: 90, sentCount: 0, errorCount: 0, skippedCount: 5
};
const leads = Array.from({ length: 8 }, (_, index) => ({
  person: { name: `Cliente ${index + 1}` },
  phone: { areaCode: '27', number: `9999900${String(index + 1).padStart(2, '0')}` },
  opportunities: { available: {}, won: {} }
}));
let lastDistributionInput = null;
let lastScheduledInput = null;
let dispatchDoneCallback = null;
let distributionDoneCallback = null;

function worker(profileId, target = 0) {
  const profile = profiles.find((item) => item.id === profileId);
  return {
    profileId, profileName: profile.name, running: true, paused: false, sending: false,
    releaseBetweenSends: false, lockedProfileId: profileId, distributionId: 'dist-1',
    done: 0, total: 5, sent: 0, errors: 0, workerError: '', target
  };
}

contextBridge.exposeInMainWorld('centralWhatsApp', {
  listProfiles: async () => profiles,
  listTemplates: async () => [],
  beginAdd: async () => {},
  cancelAdd: async () => {},
  listCampaigns: async () => [campaign],
  getCampaignContacts: async () => ({ campaign, mode: 'pending', leads }),
  createCampaign: async () => ({ ok: true, campaign, campaigns: [campaign] }),
  releaseCampaignSkipped: async () => ({ campaign, campaigns: [campaign] }),
  removeCampaign: async () => [],
  exportCampaign: async () => ({ ok: true }),
  listScheduledDispatches: async () => [],
  scheduleDispatch: async (input) => {
    lastScheduledInput = input;
    return {
      ok: true,
      schedule: {
        id: 'schedule-1', type: input.type, profileIds: input.profileIds,
        profileName: input.profileIds.map((id) => profiles.find((profile) => profile.id === id)?.name).join(', '),
        scheduledAt: input.scheduledAt, leadCount: input.leads.length, status: 'pending'
      },
      schedules: []
    };
  },
  cancelScheduledDispatch: async () => [],
  getDispatchState: async (profileId) => ({ profileId, running: false, paused: false, sending: false, done: 0, total: 0, sent: 0, errors: 0 }),
  getDispatchStates: async () => [],
  listDistributions: async () => [],
  startDistribution: async (input) => {
    lastDistributionInput = input;
    return {
      ok: true,
      distribution: {
        id: 'dist-1', campaignId: campaign.id, campaignName: campaign.name, mode: 'pending',
        distributionMode: input.distributionMode,
        startedAt: new Date().toISOString(), finishedAt: '', running: true, paused: false,
        target: input.successTarget, sent: 0, errors: 0, attempted: 0,
        candidateCount: leads.length, remainingCandidates: leads.length,
        workers: input.profileIds.map((profileId) => worker(profileId, input.profileTargets?.[profileId] || 0))
      }
    };
  },
  stopDistribution: async () => ({ ok: true }),
  toggleDistributionPause: async () => ({ ok: true }),
  stopDispatch: async () => ({ ok: true }),
  toggleDispatchPause: async () => ({ ok: true }),
  listDispatchHistory: async () => [],
  saveDispatchHistory: async () => ({ ok: true }),
  onUnreadChanged: () => {}, onProfileActivated: () => {}, onScheduledDispatchesChanged: () => {},
  onScheduledDispatchTriggered: () => {}, onDispatchStateChanged: () => {}, onDispatchProgress: () => {},
  onDispatchDone: (callback) => { dispatchDoneCallback = callback; },
  onDistributionStateChanged: () => {}, onDistributionDone: (callback) => { distributionDoneCallback = callback; },
  onDispatchHistoryChanged: () => {}, onCampaignsChanged: () => {},
  getLastDistributionInput: () => lastDistributionInput,
  getLastScheduledInput: () => lastScheduledInput,
  simulateRestrictedWorker: () => dispatchDoneCallback?.({
    profileId: 'vermelho',
    distributionId: 'dist-1',
    sent: 0,
    errors: 0,
    successTarget: 5,
    stopped: true,
    failures: [],
    workerError: 'O WhatsApp restringiu ou bloqueou este número. Os envios deste perfil foram interrompidos e os contatos restantes continuam pendentes.'
  }),
  simulateDistributionDone: () => distributionDoneCallback?.({
    id: 'dist-1', campaignId: campaign.id, campaignName: campaign.name, mode: 'pending',
    distributionMode: 'custom', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    running: false, paused: false, target: 5, sent: 0, errors: 0, attempted: 0,
    candidateCount: leads.length, remainingCandidates: leads.length,
    workers: [
      { ...worker('vermelho', 2), running: false, workerError: 'O WhatsApp restringiu ou bloqueou este número. Os envios deste perfil foram interrompidos e os contatos restantes continuam pendentes.' },
      { ...worker('azul', 3), running: false }
    ]
  })
});
