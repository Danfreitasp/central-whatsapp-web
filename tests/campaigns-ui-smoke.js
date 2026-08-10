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
  await new Promise((resolve) => setTimeout(resolve, 220));
  const result = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#campaigns-button').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const cardTitle = document.querySelector('.campaign-card h3')?.textContent;
    const counts = [...document.querySelectorAll('.campaign-count strong')].map((node) => node.textContent);
    const batch = document.querySelector('.campaign-batch-size input');
    batch.value = '1';
    batch.dispatchEvent(new Event('change'));
    [...document.querySelectorAll('.campaign-actions button')].find((button) => button.textContent === 'Preparar distribuição').click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      cardTitle,
      counts,
      campaignsClosed: !document.querySelector('#campaigns-dialog').open,
      dispatchOpen: document.querySelector('#dispatch-dialog').open,
      source: document.querySelector('#dispatch-file-name').textContent,
      preview: document.querySelector('#dispatch-preview').textContent,
      limit: document.querySelector('#dispatch-limit').value,
      limitLocked: document.querySelector('#dispatch-limit').disabled,
      distributionVisible: !document.querySelector('#dispatch-distribution').hidden,
      campaignMode: document.querySelector('#dispatch-dialog').classList.contains('campaign-loaded')
    };
  })()`);
  assert.deepEqual(result, {
    cardTitle: 'Clientes agosto',
    counts: ['2', '0', '0', '1'],
    campaignsClosed: true,
    dispatchOpen: true,
    source: 'Campanha “Clientes agosto” — meta de 1 envio(s) efetivo(s)',
    preview: 'Até 2 candidato(s) disponível(is). O lote continuará após falhas até atingir a meta; contatos não tentados permanecerão pendentes.',
    limit: '1',
    limitLocked: true,
    distributionVisible: true,
    campaignMode: true
  });
  console.log('campanha persistente abre a preparação da distribuição sem misturar a importação');
  window.destroy();
  app.quit();
});
