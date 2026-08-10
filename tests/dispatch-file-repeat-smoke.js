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
    document.querySelector('#dispatch-button').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const dialog = document.querySelector('#dispatch-dialog');
    const input = document.querySelector('#dispatch-file');
    const csv = 'Nome;Tel.\\nMaria;(27) 99999-1111\\nJoão;27988882222';
    const selectSameFile = async () => {
      input.onclick();
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], 'clientes.csv', { type: 'text/csv' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve, 70));
    };
    await selectSameFile();
    const first = document.querySelector('#dispatch-file-name').textContent;
    await selectSameFile();
    return {
      open: dialog.open,
      first,
      second: document.querySelector('#dispatch-file-name').textContent,
      validateEnabled: !document.querySelector('#dispatch-validate').disabled
    };
  })()`);
  assert.equal(result.open, true);
  assert.match(result.first, /telefone: “Tel\.”/);
  assert.equal(result.second, result.first);
  assert.equal(result.validateEnabled, true);
  console.log('mesma planilha selecionada duas vezes sem fechar o painel; coluna Tel. reconhecida');
  window.destroy();
  app.quit();
});
