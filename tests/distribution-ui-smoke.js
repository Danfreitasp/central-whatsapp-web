const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'distribution-ui-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#campaigns-button').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    document.querySelector('.campaign-batch-size input').value = '5';
    [...document.querySelectorAll('.campaign-actions button')].find((button) => button.textContent === 'Preparar distribuição').click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    document.querySelector('#dispatch-close').click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    document.querySelector('#dispatch-button').click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const reopenedAsSingle = document.querySelector('#dispatch-workflow-single').classList.contains('active')
      && !document.querySelector('#dispatch-dialog').classList.contains('campaign-loaded');
    document.querySelector('#dispatch-workflow-single').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const singleMode = {
      active: document.querySelector('#dispatch-workflow-single').classList.contains('active'),
      campaignLoaded: document.querySelector('#dispatch-dialog').classList.contains('campaign-loaded'),
      sourceTabsVisible: getComputedStyle(document.querySelector('.dispatch-source-tabs')).display !== 'none',
      sheetLabel: document.querySelector('.dispatch-file-picker strong').textContent,
      manualLabel: document.querySelector('#dispatch-source-manual').textContent
    };
    document.querySelector('#dispatch-workflow-campaign').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const campaignPickerVisible = !document.querySelector('#dispatch-campaign-picker').hidden;
    document.querySelector('#dispatch-campaign-target').value = '5';
    document.querySelector('#dispatch-campaign-load').click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const choices = [...document.querySelectorAll('#dispatch-distribution-profiles input[type="checkbox"]')];
    choices[1].checked = true;
    choices[1].dispatchEvent(new Event('change'));
    const mode = document.querySelector('#dispatch-distribution-mode');
    mode.value = 'custom';
    mode.dispatchEvent(new Event('change'));
    const quotas = [...document.querySelectorAll('.dispatch-distribution-profile input.dispatch-distribution-quota')];
    quotas[0].value = '2';
    quotas[0].dispatchEvent(new Event('input'));
    quotas[1].value = '3';
    quotas[1].dispatchEvent(new Event('input'));
    document.querySelector('#dispatch-start').click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const input = window.centralWhatsApp.getLastDistributionInput();
    if (!input) {
      return {
        error: 'distribution-not-started',
        startDisabled: document.querySelector('#dispatch-start').disabled,
        selected: [...document.querySelectorAll('#dispatch-distribution-profiles input[type="checkbox"]:checked')].map((item) => item.value),
        quotas: [...document.querySelectorAll('.dispatch-distribution-quota')].map((item) => item.value),
        summary: document.querySelector('#dispatch-distribution-summary').textContent,
        status: document.querySelector('#dispatch-status').textContent
      };
    }
    return {
      profileIds: input.profileIds,
      target: input.successTarget,
      campaignId: input.campaignId,
      distributionMode: input.distributionMode,
      targets: input.profileTargets,
      reopenedAsSingle,
      singleMode,
      campaignPickerVisible,
      dashboardVisible: !document.querySelector('#dispatch-distribution-dashboard').hidden,
      workers: document.querySelectorAll('.dispatch-distribution-worker').length,
      executionMode: document.querySelector('#dispatch-dialog').classList.contains('distribution-running'),
      overall: document.querySelector('#dispatch-distribution-overall').textContent
    };
  })()`);
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.deepEqual(result.profileIds, ['vermelho', 'azul']);
  assert.equal(result.target, 5);
  assert.equal(result.campaignId, 'campanha-1');
  assert.equal(result.distributionMode, 'custom');
  assert.deepEqual(result.targets, { vermelho: 2, azul: 3 });
  assert.equal(result.reopenedAsSingle, true);
  assert.deepEqual(result.singleMode, {
    active: true,
    campaignLoaded: false,
    sourceTabsVisible: true,
    sheetLabel: 'Selecionar Excel ou CSV',
    manualLabel: 'Colar lista'
  });
  assert.equal(result.campaignPickerVisible, true);
  assert.equal(result.dashboardVisible, true);
  assert.equal(result.workers, 2);
  assert.equal(result.executionMode, true);
  assert.match(result.overall, /0 de 5 efetivos/);
  const restricted = await window.webContents.executeJavaScript(`(async () => {
    window.centralWhatsApp.simulateRestrictedWorker();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const card = [...document.querySelectorAll('.dispatch-distribution-worker')]
      .find((item) => item.textContent.includes('Telefone Vermelho'));
    return { text: card.textContent, failures: document.querySelectorAll('#dispatch-failures-list li').length };
  })()`);
  assert.match(restricted.text, /restringiu ou bloqueou este número/i);
  assert.match(restricted.text, /0 falha\(s\).*0 tentativa\(s\)/i);
  assert.equal(restricted.failures, 0);
  const completed = await window.webContents.executeJavaScript(`(async () => {
    window.centralWhatsApp.simulateDistributionDone();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const card = [...document.querySelectorAll('.dispatch-distribution-worker')]
      .find((item) => item.textContent.includes('Telefone Vermelho'));
    return {
      text: card.textContent,
      errorClass: Boolean(card.querySelector('em.error'))
    };
  })()`);
  assert.doesNotMatch(completed.text, /restringiu ou bloqueou este número/i);
  assert.match(completed.text, /Concluído/i);
  assert.equal(completed.errorClass, false);
  console.log('campanha distribuída entre os números selecionados com meta global');
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
