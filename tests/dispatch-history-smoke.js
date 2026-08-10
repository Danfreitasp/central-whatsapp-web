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
    document.querySelector('#dispatch-history-button').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const dialog = document.querySelector('#dispatch-history-dialog');
    const initialRows = dialog.querySelectorAll('#dispatch-history-list tr').length;
    document.querySelector('#dispatch-history-status').value = 'error';
    document.querySelector('#dispatch-history-status').dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      open: dialog.open,
      initialRows,
      filteredRows: dialog.querySelectorAll('#dispatch-history-list tr').length,
      profileOptions: document.querySelector('#dispatch-history-profile').options.length,
      exportEnabled: !document.querySelector('#dispatch-history-export').disabled
    };
  })()`);
  assert.deepEqual(result, { open: true, initialRows: 2, filteredRows: 1, profileOptions: 3, exportEnabled: true });
  console.log('histórico persistente renderizado e filtrado na interface');
  window.destroy();
  app.quit();
});
