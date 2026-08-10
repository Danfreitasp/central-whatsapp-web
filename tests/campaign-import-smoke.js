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
    const input = document.querySelector('#campaigns-file');
    input.click = () => {};
    document.querySelector('#campaigns-new').click();
    const csv = new File(['telefone,nome\\n27999990001,Maria\\n27999990002,João'], 'nova-campanha.csv', { type: 'text/csv' });
    const transfer = new DataTransfer();
    transfer.items.add(csv);
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const summaryBeforeSave = document.querySelector('#campaigns-import-summary').textContent;
    document.querySelector('#campaigns-import-save').click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      summaryBeforeSave,
      campaignsOpen: document.querySelector('#campaigns-dialog').open,
      dispatchOpen: document.querySelector('#dispatch-dialog').open,
      importHidden: document.querySelector('#campaigns-import').hidden,
      highlightedOpen: document.querySelector('.campaign-card[open] h3')?.textContent
    };
  })()`);
  assert.match(result.summaryBeforeSave, /2 válido\(s\)/);
  assert.equal(result.campaignsOpen, true);
  assert.equal(result.dispatchOpen, false);
  assert.equal(result.importHidden, true);
  assert.equal(result.highlightedOpen, 'Clientes agosto');
  console.log('nova planilha salva dentro de Campanhas sem abrir Disparos automaticamente');
  window.destroy();
  app.quit();
});
