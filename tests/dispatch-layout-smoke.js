const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  const result = await window.webContents.executeJavaScript(`(() => ({
    scheduleInput: Boolean(document.querySelector('#dispatch-scheduled-at')),
    scheduleButton: document.querySelector('#dispatch-schedule')?.textContent.trim(),
    schedulesCard: Boolean(document.querySelector('#dispatch-schedules-card')),
    failuresCard: Boolean(document.querySelector('#dispatch-failures')),
    saveFailuresButton: document.querySelector('#dispatch-save-failures')?.textContent.trim(),
    pauseButton: document.querySelector('#dispatch-pause')?.textContent.trim(),
    messageMode: Boolean(document.querySelector('#dispatch-message-mode')),
    variantCount: Boolean(document.querySelector('#dispatch-variant-count')),
    variantList: Boolean(document.querySelector('#dispatch-variant-list')),
    historyButton: document.querySelector('#dispatch-history-button')?.textContent.trim(),
    historyDialog: Boolean(document.querySelector('#dispatch-history-dialog'))
  }))()`);
  assert.deepEqual(result, {
    scheduleInput: true,
    scheduleButton: 'Agendar',
    schedulesCard: true,
    failuresCard: true,
    saveFailuresButton: 'Salvar CSV',
    pauseButton: 'Pausar',
    messageMode: true,
    variantCount: true,
    variantList: true,
    historyButton: 'Histórico',
    historyDialog: true
  });
  console.log('interface de agendamento e relatório de falhas carregada');
  window.destroy();
  app.quit();
});
