const { app, BrowserWindow, Menu, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { getAttachedBrowserViews } = require('../src/browser-view-lifecycle');

// O próprio main escolhe userData abaixo de appData: redirecionar a raiz antes
// de importá-lo impede qualquer acesso às sessões/configurações operacionais.
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'central-app-smoke-'));
app.setPath('appData', directory);
const userData = path.join(directory, 'central-whatsapp-web');
fs.mkdirSync(userData);
const compatibility = process.argv.includes('--software-rendering');
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  startWithWindows: false, graphicsCompatibilityMode: compatibility
}));
fs.writeFileSync(path.join(userData, 'profiles.json'), JSON.stringify([
  { id: 'smoke-a', name: 'Sessão A', color: '#00aa88', zoom: 1 },
  { id: 'smoke-b', name: 'Sessão B', color: '#2288cc', zoom: 1 }
]));
app.whenReady().then(() => {
  for (const id of ['smoke-a', 'smoke-b']) {
    session.fromPartition(`persist:whatsapp-profile-${id}`).protocol.handle('https', () => new Response(
      '<html><title>Teste local</title><body style="background:#1460ac;color:white"><h1>Sessão de teste</h1><textarea id="draft">rascunho local</textarea></body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    ));
  }
});
const deadline = setTimeout(() => { console.error('app smoke timeout'); app.exit(1); }, 30000);
require('../src/main');

app.whenReady().then(async () => {
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window);
  if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  const menu = Menu.getApplicationMenu();
  const help = menu.items.find(item => item.label === 'Help');
  const recover = help.submenu.items.find(item => item.label === 'Recuperar tela do WhatsApp');
  assert.ok(recover);
  recover.click();
  const initialClosedListeners = window.listenerCount('closed');
  for (const id of ['smoke-b', 'smoke-a', 'smoke-b', 'smoke-a']) {
    await window.webContents.executeJavaScript(`window.centralWhatsApp.selectProfile(${JSON.stringify(id)})`);
    const attached = getAttachedBrowserViews(window);
    assert.equal(attached.length, 1);
    const contents = attached[0].webContents;
    if (contents.isLoading()) await new Promise(resolve => contents.once('did-finish-load', resolve));
    assert.equal(await contents.executeJavaScript('document.querySelector("#draft").value'), 'rascunho local');
    recover.click();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  window.minimize();
  await new Promise(resolve => setTimeout(resolve, 100));
  window.restore();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(getAttachedBrowserViews(window).length, 1);
  assert.equal(window.listenerCount('closed'), initialClosedListeners);
  const crashedContents = getAttachedBrowserViews(window)[0].webContents;
  assert.equal(BrowserWindow.fromWebContents(crashedContents), window);
  crashedContents.forcefullyCrashRenderer();
  await new Promise(resolve => setTimeout(resolve, 1200));
  const replacement = getAttachedBrowserViews(window)[0];
  assert.ok(replacement);
  assert.notEqual(replacement.webContents.id, crashedContents.id);
  assert.equal(crashedContents.isDestroyed(), true);
  assert.equal(await replacement.webContents.executeJavaScript('document.querySelector("#draft").value'), 'rascunho local');
  const settingsMenu = menu.items.find(item => item.label === 'Configurações');
  const graphics = settingsMenu.submenu.items.find(item => item.label.startsWith('Compatibilidade gráfica'));
  assert.equal(graphics.checked, compatibility);
  if (compatibility) assert.equal(app.isHardwareAccelerationEnabled(), false);
  graphics.click({ checked: !compatibility });
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'))).graphicsCompatibilityMode, !compatibility);
  const log = fs.readFileSync(path.join(userData, 'diagnostics', 'surface-health.jsonl'), 'utf8');
  assert.ok(log.includes('startup'));
  assert.ok(log.includes('manual-recovery'));
  assert.ok(log.includes('renderer-gone'));
  assert.equal(app.getPath('userData'), userData);
  console.log(`main real iniciado em dados isolados; menu, diagnóstico e configuração persistida; compatibilidade ${compatibility}`);
  clearTimeout(deadline);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
