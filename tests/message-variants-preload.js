const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('centralWhatsApp', {
  listProfiles: async () => [{ id: 'principal', name: 'Principal', color: '#3b82f6', zoom: 1, unread: 0 }],
  getDispatchState: async () => ({ profileId: 'principal', running: false, done: 0, total: 0, sent: 0, errors: 0 }),
  getDispatchStates: async () => [],
  beginAdd: async () => {},
  cancelAdd: async () => {},
  listTemplates: async () => [
    { id: 't1', name: 'Texto 1', body: 'Olá {nome}, esta é a primeira opção.' },
    { id: 't2', name: 'Texto 2', body: 'Oi {primeiroNome}, esta é a segunda opção.' },
    { id: 't3', name: 'Texto 3', body: 'Bom dia {nome}, terceira opção.' },
    { id: 't4', name: 'Texto 4', body: 'Tudo bem, {primeiroNome}? Quarta opção.' }
  ],
  listScheduledDispatches: async () => [],
  onUnreadChanged: () => {},
  onScheduledDispatchesChanged: () => {},
  onScheduledDispatchTriggered: () => {},
  onDispatchStateChanged: () => {},
  onDispatchProgress: () => {},
  onDispatchDone: () => {}
});
