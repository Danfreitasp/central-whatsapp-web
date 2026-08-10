const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CampaignStore, shouldSkipSent } = require('../src/campaign-store');

function lead(phone, name = '') {
  return {
    person: { name },
    phone: { areaCode: phone.slice(2, 4), number: phone.slice(4) },
    opportunities: { available: {}, won: {} }
  };
}

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-campaigns-'));
  const file = path.join(directory, 'campaigns.db');
  const store = new CampaignStore(file);
  try { run(store); } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('aplica janela de bloqueio sem impedir contatos antigos', () => {
  const now = Date.parse('2026-08-03T12:00:00.000Z');
  assert.equal(shouldSkipSent('2026-08-01T12:00:00.000Z', 90, now), true);
  assert.equal(shouldSkipSent('2025-08-01T12:00:00.000Z', 90, now), false);
  assert.equal(shouldSkipSent('2025-08-01T12:00:00.000Z', 0, now), true);
  assert.equal(shouldSkipSent('2026-08-01T12:00:00.000Z', -1, now), false);
});

test('importa campanha, remove duplicados e bloqueia telefone já enviado', () => withStore((store) => {
  store.seedSentRegistry([{ phone: '5527999990001', occurredAt: new Date().toISOString(), profileId: 'azul', status: 'sent' }]);
  const result = store.createCampaign({
    id: 'campanha-1', name: 'Agosto', sourceName: 'agosto.xlsx', sourceHash: 'hash-1', repeatDays: 90,
    originalCount: 4, invalidCount: 1, duplicateCount: 1,
    leads: [lead('5527999990001', 'Maria'), lead('5527999990002', 'João'), lead('5527999990002', 'João')]
  });
  assert.equal(result.ok, true);
  assert.equal(result.campaign.pendingCount, 1);
  assert.equal(result.campaign.skippedCount, 1);
  assert.equal(result.campaign.duplicateCount, 2);
  assert.deepEqual(store.contactsForDispatch('campanha-1').leads.map((item) => item.person.name), ['João']);
}));

test('salva progresso por contato e permite retomar somente erros', () => withStore((store) => {
  store.createCampaign({ id: 'campanha-2', name: 'Retomada', leads: [lead('5527999990011'), lead('5527999990012')] });
  store.recordOutcome({ campaignId: 'campanha-2', phone: '5527999990011', status: 'sent', profileId: 'azul' });
  store.recordOutcome({ campaignId: 'campanha-2', phone: '5527999990012', status: 'error', reason: 'Sem WhatsApp', profileId: 'azul' });
  const summary = store.listCampaigns()[0];
  assert.equal(summary.sentCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.pendingCount, 0);
  assert.equal(store.contactsForDispatch('campanha-2', 'errors').leads.length, 1);
  assert.match(store.createCampaignCsv('campanha-2'), /Sem WhatsApp/);
}));

test('impede salvar a mesma planilha duas vezes', () => withStore((store) => {
  store.createCampaign({ id: 'campanha-a', name: 'Primeira', sourceHash: 'igual', leads: [lead('5527999990021')] });
  const duplicate = store.createCampaign({ id: 'campanha-b', name: 'Segunda', sourceHash: 'igual', leads: [lead('5527999990022')] });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.duplicateCampaignId, 'campanha-a');
}));

test('mantém mais de mil contatos disponíveis para o mesmo lote', () => withStore((store) => {
  const leads = Array.from({ length: 1200 }, (_item, index) => lead(`5527${String(990000000 + index)}`));
  const result = store.createCampaign({ id: 'campanha-grande', name: 'Lista grande', leads });
  assert.equal(result.campaign.pendingCount, 1200);
  assert.equal(store.contactsForDispatch('campanha-grande').leads.length, 1200);
  assert.equal(store.contactsForDispatch('campanha-grande', 'pending', 125).leads.length, 125);
}));
