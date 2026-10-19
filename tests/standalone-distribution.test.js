const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createDistributionQueue } = require('../src/distribution-queue');
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');
const startSource = source.slice(source.indexOf('function startDistributionInternal(input)'), source.indexOf("ipcMain.handle('dispatch:start'"));
function runtime(campaignStore = null) {
  const states = new Map();
  const context = {
    campaignStore, profiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], dispatchStates: states,
    MAX_DISPATCH_CONTACTS: 5000, crypto: { randomUUID: () => 'distribution' },
    canStartDispatchForProfile: (_states, id) => !states.get(id)?.running,
    normalizeMessageVariants: () => [], parseDispatchLead: lead => ({ ...lead }), formatDispatchPhone: phone => phone,
    createDistributionQueue, distributions: new Map(), createDispatchState: () => ({}),
    releasesProfileBetweenSends: () => true, createView: () => ({}), activeProfileId: 'a',
    publishDispatchState() {}, publishDistributionState() {}, runDistributedWorker: async () => {},
    distributionPublicState: distribution => ({ ...distribution.queue.snapshot(), campaignId: distribution.campaignId, campaignName: distribution.campaignName })
  };
  return { start: vm.runInNewContext(`(${startSource})`, context), states };
}
const input = { profileIds: ['a', 'b'], template: 'Olá', sourceName: 'clientes.csv', leads: [{ phone: '111' }, { phone: '222' }, { phone: '111' }] };
test('distribui uma planilha avulsa sem gerenciador de campanhas e sem duplicar contatos', () => {
  const state = runtime();
  const result = state.start(input);
  assert.equal(result.ok, true);
  assert.equal(result.distribution.campaignId, '');
  assert.equal(result.distribution.campaignName, 'clientes.csv');
  assert.equal(result.distribution.target, 2);
  assert.equal(state.states.size, 2);
});
test('valida cotas do lote avulso antes de iniciar os números', () => {
  const state = runtime();
  const result = state.start({ ...input, distributionMode: 'custom', profileTargets: { a: 2, b: 2 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /meta global de 2/);
  assert.equal(state.states.size, 0);
});
test('a distribuição de campanha continua usando os contatos salvos e a meta informada', () => {
  const state = runtime({ contactsForDispatch: () => ({ campaign: { name: 'Campanha' }, leads: [{ phone: '333' }, { phone: '444' }] }) });
  const result = state.start({ ...input, campaignId: 'campaign', successTarget: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.distribution.campaignId, 'campaign');
  assert.equal(result.distribution.target, 1);
});
