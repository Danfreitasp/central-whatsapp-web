const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'backup-ui-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 180));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#backup-button').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const opened = document.querySelector('#backup-dialog').open;
    const profile = document.querySelector('#backup-profile').textContent;
    const initial = {
      progressHidden: document.querySelector('#backup-progress').hidden,
      resultHidden: document.querySelector('#backup-result').hidden,
      generateDisabled: document.querySelector('#backup-generate').disabled,
      generateText: document.querySelector('#backup-generate').textContent
    };
    document.querySelector('#backup-generate').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      opened,
      profile,
      initial,
      result: document.querySelector('#backup-result').textContent,
      progress: document.querySelector('#backup-progress-text').textContent,
      button: document.querySelector('#backup-button').textContent
    };
  })()`);
  assert.equal(result.opened, true);
  assert.match(result.profile, /Comercial/);
  assert.deepEqual(result.initial, {
    progressHidden: true,
    resultHidden: true,
    generateDisabled: false,
    generateText: 'Escolher local e gerar ZIP'
  });
  assert.match(result.result, /87 mensagem\(ns\), 2 áudio\(s\) e 4 captura\(s\)/);
  assert.match(result.result, /1 áudio\(s\) não estavam mais disponíveis/);
  assert.equal(result.progress, 'Backup concluído.');
  assert.equal(result.button, 'Backup');
  console.log('backup de conversa exibido com progresso, áudios e capturas');
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
