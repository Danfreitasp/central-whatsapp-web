const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'message-variants-preload.js'),
      contextIsolation: true,
      sandbox: false,
      partition: `message-variants-smoke-${Date.now()}`
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#dispatch-button').click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const mode = document.querySelector('#dispatch-message-mode');
    mode.value = 'variants';
    mode.dispatchEvent(new Event('change'));
    document.querySelector('#dispatch-source-manual').click();
    const phones = document.querySelector('#dispatch-manual-phones');
    phones.value = '27999990001\\n27999990002';
    phones.dispatchEvent(new Event('input'));
    document.querySelector('#dispatch-validate').click();
    const preview = document.querySelector('#dispatch-preview-recipient');
    preview.value = '0';
    preview.dispatchEvent(new Event('change'));
    const first = document.querySelector('#dispatch-preview-identity').textContent;
    preview.value = '1';
    preview.dispatchEvent(new Event('change'));
    const second = document.querySelector('#dispatch-preview-identity').textContent;
    return {
      selectedModels: document.querySelectorAll('#dispatch-variant-list input:checked').length,
      startEnabled: !document.querySelector('#dispatch-start').disabled,
      first,
      second
    };
  })()`);
  assert.equal(result.selectedModels, 2);
  assert.equal(result.startEnabled, true);
  assert.match(result.first, /Modelo atribuído: Texto [12]/);
  assert.match(result.second, /Modelo atribuído: Texto [12]/);
  assert.notEqual(result.first.match(/Texto [12]/)[0], result.second.match(/Texto [12]/)[0]);
  console.log('rodízio de modelos validado na interface e na prévia por cliente');
  window.destroy();
  app.quit();
});
