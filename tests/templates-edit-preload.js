const { contextBridge } = require('electron');

let templates = [
  { id: 'sem-nome', name: 'Sem nome', body: 'Olá!\n\n1 - SIM\n2 - NÃO' },
  { id: 'outro', name: 'Outro modelo', body: 'Outra mensagem\n\n1 - SIM\n2 - NÃO' },
  { id: 'terceiro', name: 'Terceiro modelo', body: 'Terceira mensagem\n\n1 - SIM\n2 - NÃO' },
  { id: 'quarto', name: 'Quarto modelo', body: 'Quarta mensagem\n\n1 - SIM\n2 - NÃO' },
  { id: 'quinto', name: 'Quinto modelo', body: 'Quinta mensagem\n\n1 - SIM\n2 - NÃO' }
];

contextBridge.exposeInMainWorld('centralWhatsApp', {
  listProfiles: async () => [],
  listTemplates: async () => templates,
  addTemplate: async (input) => {
    templates = [{ id: 'novo', name: input.name, body: input.body }, ...templates];
    return templates;
  },
  updateTemplate: async (input) => {
    templates = templates.map((template) => template.id === input.id ? { ...template, name: input.name, body: input.body } : template);
    return templates;
  },
  removeTemplate: async (id) => {
    templates = templates.filter((template) => template.id !== id);
    return templates;
  },
  beginAdd: async () => {},
  cancelAdd: async () => {},
  copyText: async () => {},
  listScheduledDispatches: async () => [],
  getDispatchStates: async () => [],
  onUnreadChanged: () => {},
  onScheduledDispatchesChanged: () => {},
  onScheduledDispatchTriggered: () => {},
  onDispatchStateChanged: () => {},
  onDispatchProgress: () => {},
  onDispatchDone: () => {}
});
