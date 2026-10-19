const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { offscreen: true, preload: path.join(__dirname, 'distribution-ui-preload.js'), contextIsolation: true, sandbox: false } });
  window.webContents.setBackgroundThrottling(false);
  try {
    await window.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await new Promise(resolve => setTimeout(resolve, 250));
    const result = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('#dispatch-button').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const file = document.querySelector('#dispatch-file');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['Nome;Telefone\\nA;27999991111\\nB;27999992222\\nC;27999993333\\nD;27999994444'], 'avulsa.csv', {type:'text/csv'}));
      Object.defineProperty(file, 'files', {configurable:true,value:transfer.files});
      file.dispatchEvent(new Event('change'));
      await new Promise(resolve => setTimeout(resolve, 120));
      document.querySelector('#dispatch-limit').value = '3';
      document.querySelector('#dispatch-validate').click();
      const toggle = document.querySelector('#dispatch-single-distribution');
      toggle.checked = true; toggle.dispatchEvent(new Event('change'));
      const choices = [...document.querySelectorAll('#dispatch-distribution-profiles input[type="checkbox"]')];
      choices[1].checked = true; choices[1].dispatchEvent(new Event('change'));
      const balanced = document.querySelector('#dispatch-distribution-summary').textContent;
      document.querySelector('#dispatch-distribution-mode').value = 'custom';
      document.querySelector('#dispatch-distribution-mode').dispatchEvent(new Event('change'));
      const quotas = [...document.querySelectorAll('.dispatch-distribution-quota')];
      quotas[0].value = '1'; quotas[1].value = '2'; quotas[1].dispatchEvent(new Event('input'));
      const message = document.querySelector('#dispatch-message');
      message.value = 'Olá, {nome}'; message.dispatchEvent(new Event('input'));
      document.querySelector('#dispatch-scheduled-at').value = new Date(Date.now()+3600000).toISOString().slice(0,16);
      document.querySelector('#dispatch-scheduled-at').dispatchEvent(new Event('change'));
      document.querySelector('#dispatch-schedule').click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const scheduled = window.centralWhatsApp.getLastScheduledInput();
      return { balanced, scheduled, checked: toggle.checked, distributionHidden: document.querySelector('#dispatch-distribution').hidden, quotaWidth: quotas[0].getBoundingClientRect().width, quotaHeight: quotas[0].getBoundingClientRect().height, summary: document.querySelector('#dispatch-distribution-summary').textContent };
    })()`);
    assert.equal(result.checked, true);
    assert.equal(result.distributionHidden, false);
    assert.ok(result.quotaWidth >= 60 && result.quotaHeight >= 30, 'a cota deve ser legível e editável');
    await new Promise(resolve => setTimeout(resolve, 200));
    if (process.env.CENTRAL_DISTRIBUTION_SMOKE_SCREENSHOT) {
      fs.writeFileSync(process.env.CENTRAL_DISTRIBUTION_SMOKE_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
    }
    result.input = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('#dispatch-start').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      return window.centralWhatsApp.getLastDistributionInput();
    })()`);
    assert.ok(result.input, JSON.stringify(result));
    assert.equal(result.input.campaignId, '');
    assert.equal(result.input.leads.length, 3);
    assert.equal(result.input.successTarget, 3);
    assert.equal(result.input.profileIds.length, 2);
    assert.deepEqual(result.input.profileTargets, { vermelho: 1, azul: 2 });
    assert.match(result.balanced, /~2.*~1/);
    assert.equal(result.scheduled.type, 'distribution');
    assert.equal(result.scheduled.campaignId, '');
    assert.equal(result.scheduled.successTarget, 3);
    console.log('Planilha avulsa: limite global, dois números, cotas 1+2, início e agendamento sem campanha');
  } finally { window.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
