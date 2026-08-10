const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CampaignStore } = require('../src/campaign-store');

app.whenReady().then(() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-campaign-electron-'));
  const store = new CampaignStore(path.join(directory, 'campaigns.db'));
  try {
    const result = store.createCampaign({
      id: 'electron', name: 'Teste Electron',
      leads: [{ person: { name: 'Maria' }, phone: { areaCode: '27', number: '999990001' } }]
    });
    assert.equal(result.campaign.pendingCount, 1);
    console.log('SQLite de campanhas disponível no Electron empacotado');
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
    app.quit();
  }
});
