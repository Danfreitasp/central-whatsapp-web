const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 850,
    title: 'Central WhatsApp Web — Prévia 0.9.0',
    webPreferences: {
      preload: path.join(__dirname, 'distribution-ui-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  window.setTitle('Central WhatsApp Web — Prévia 0.9.0');
  await new Promise((resolve) => setTimeout(resolve, 250));
  await window.webContents.executeJavaScript(`
    document.querySelector('#campaigns-file').click = () => {};
    document.querySelector('#campaigns-button').click();
    setTimeout(() => document.querySelector('#campaigns-new').click(), 100);
  `);
});

app.on('window-all-closed', () => app.quit());
