const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'dispatch-parallel-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#templates-button').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const wasOpen = document.querySelector('#templates-dialog').open;
    window.centralWhatsApp.simulateProfileActivation('azul');
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      wasOpen,
      dialogClosed: !document.querySelector('#templates-dialog').open,
      activeText: document.querySelector('.profile.active .profile-select span')?.textContent
    };
  })()`);
  assert.deepEqual(result, { wasOpen: true, dialogClosed: true, activeText: 'Telefone Azul' });
  console.log('clique de notificação sincronizou o número lateral e fechou o painel aberto');
  window.destroy();
  app.quit();
});
