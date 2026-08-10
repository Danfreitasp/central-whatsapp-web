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
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = await window.webContents.executeJavaScript(`(() => ({
    header: document.querySelector('#dispatch-button')?.textContent.trim(),
    runningProfiles: document.querySelectorAll('.profile.sending').length,
    lockedProfiles: window.centralWhatsAppDispatchLockedProfileIds,
    emptyStateHidden: getComputedStyle(document.querySelector('#empty-state')).display === 'none',
    hasPerformanceControl: Boolean(document.querySelector('#performance-button, #performance-dialog'))
  }))()`);
  assert.equal(result.header, 'Disparos · 2 ativo(s)');
  assert.equal(result.runningProfiles, 1);
  assert.deepEqual(result.lockedProfiles, ['vermelho']);
  assert.equal(result.emptyStateHidden, true);
  assert.equal(result.hasPerformanceControl, false);
  console.log('dois lotes independentes renderizados; somente o perfil reservado foi bloqueado');
  window.destroy();
  app.quit();
});
