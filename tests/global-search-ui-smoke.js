const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.setPath('userData', path.join(app.getPath('temp'), 'central-global-search-ui-smoke'));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'backup-ui-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 180));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#global-search-button').click();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const dialog = document.querySelector('#global-search-dialog');
    const header = document.querySelector('header');
    const modes = [...document.querySelectorAll('input[name="global-search-mode"]')].map((input) => ({ value: input.value, checked: input.checked }));
    document.querySelector('input[name="global-search-mode"][value="complete"]').click();
    document.querySelector('#global-search-query').value = 'proposta aprovada';
    document.querySelector('#global-search-submit').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      open: dialog.open,
      modes,
      status: document.querySelector('#global-search-status').textContent,
      indexStatus: document.querySelector('#global-search-index-status').textContent,
      resultTitle: document.querySelector('.global-search-result strong')?.textContent,
      resultSnippet: document.querySelector('.global-search-result p')?.textContent,
      hasLabelsButton: Boolean(document.querySelector('#labels-button')),
      headerText: header.textContent,
      overflow: dialog.scrollWidth > dialog.clientWidth
    };
  })()`);
  assert.equal(result.open, true);
  assert.deepEqual(result.modes, [{ value: 'quick', checked: true }, { value: 'complete', checked: false }]);
  assert.match(result.status, /busca completa/);
  assert.match(result.indexStatus, /345 mensagem/);
  assert.equal(result.resultTitle, 'João');
  assert.match(result.resultSnippet, /proposta aprovada/);
  assert.equal(result.hasLabelsButton, false);
  assert.doesNotMatch(result.headerText, /Etiquetas/);
  assert.match(result.headerText, /Modelos/);
  assert.equal(result.overflow, false);
  console.log('busca global exibe modos rápido/completo, índice e resultados sem overflow');
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
