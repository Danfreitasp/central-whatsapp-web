const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'assets', 'readme');
const mode = process.argv[2] || 'campaigns';

async function capture() {
  const search = mode === 'search';
  const campaigns = mode === 'campaigns';
  const window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      offscreen: true,
      preload: path.join(root, 'tests', search ? 'backup-ui-preload.js' : campaigns ? 'distribution-ui-preload.js' : 'dispatch-parallel-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  try {
    await window.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (search) {
      await window.webContents.executeJavaScript(`(async () => {
        document.querySelector('#global-search-button').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        document.querySelector('#global-search-query').value = 'proposta aprovada';
        document.querySelector('#global-search-submit').click();
      })()`);
    } else if (campaigns) {
      await window.webContents.executeJavaScript(`document.querySelector('#campaigns-button').click()`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const filename = search ? 'pesquisa-global.png' : campaigns ? 'campanhas.png' : 'multiplas-sessoes.png';
    fs.writeFileSync(path.join(output, filename), (await window.webContents.capturePage()).toPNG());
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  await capture();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
