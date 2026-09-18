const { app, WebContentsView, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { getAttachedBrowserViews, isolateActiveBrowserView, rebindBrowserViewSurface, repaintBrowserViewSurface } = require('../src/browser-view-lifecycle');
const { createBrowserSurfaceMonitor } = require('../src/browser-surface-monitor');
const { createWhatsAppUserAgent } = require('../src/whatsapp-user-agent');
const fs = require('node:fs');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'central-surface-smoke-')));
if (process.argv.includes('--software-rendering')) app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('surface smoke timeout'); app.exit(1); }, 60000);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 700 });
  window.setAlwaysOnTop(true);
  const first = new WebContentsView();
  const second = new WebContentsView();
  const third = new WebContentsView();
  const fourth = new WebContentsView();
  const initialClosedListeners = window.listenerCount('closed');
  const navigationCounts = new Map();
  for (const view of [first, second, third, fourth]) {
    navigationCounts.set(view, 0);
    view.webContents.on('did-finish-load', () => navigationCounts.set(view, navigationCounts.get(view) + 1));
  }
  try {
    const runtimeUserAgent = createWhatsAppUserAgent(process.versions.chrome);
    first.webContents.setUserAgent(runtimeUserAgent);
    for (const view of [first, second, third, fourth]) view.webContents.setBackgroundThrottling(false);
    await Promise.all([
      first.webContents.loadURL('data:text/html,<body style="background:rgb(20,80,160)"><script>globalThis.loads=(globalThis.loads||0)+1;globalThis.ticks=0;setInterval(()=>globalThis.ticks++,50)</script>Primeiro</body>'),
      second.webContents.loadURL('data:text/html,<body style="background:rgb(30,150,70)"><script>globalThis.loads=(globalThis.loads||0)+1;globalThis.ticks=0;setInterval(()=>globalThis.ticks++,50)</script>Segundo</body>'),
      third.webContents.loadURL('data:text/html,<body style="background:rgb(170,60,120)"><script>globalThis.loads=(globalThis.loads||0)+1;globalThis.ticks=0;setInterval(()=>globalThis.ticks++,50)</script>Terceiro</body>'),
      fourth.webContents.loadURL('data:text/html,<body style="background:rgb(180,70,30)"><script>globalThis.loads=(globalThis.loads||0)+1;globalThis.ticks=0;setInterval(()=>globalThis.ticks++,50)</script>Quarto</body>')
    ]);

    const bounds = { x: 0, y: 0, width: 600, height: 500 };
    const allViews = [first, second, third, fourth];
    for (const view of allViews) await view.webContents.executeJavaScript(`
      document.body.insertAdjacentHTML('beforeend', '<textarea id="draft"></textarea>');
      document.querySelector('#draft').value = 'rascunho preservado';
    `);
    // Regressão do Electron: alterar throttling ainda com a janela oculta.
    isolateActiveBrowserView(window, allViews, first, bounds);
    window.show();
    const expectedColors = new Map([
      [first, [20, 80, 160]],
      [second, [30, 150, 70]],
      [third, [170, 60, 120]],
      [fourth, [180, 70, 30]]
    ]);
    const containsColor = (image, [red, green, blue]) => {
      const pixels = image.toBitmap();
      for (let index = 0; index < pixels.length; index += 4) {
        const rgba = pixels[index] === red && pixels[index + 1] === green && pixels[index + 2] === blue;
        const bgra = pixels[index] === blue && pixels[index + 1] === green && pixels[index + 2] === red;
        if (rgba || bgra) return true;
      }
      return false;
    };
    let switchNumber = 0;
    for (const view of [...Array.from({ length: 8 }, () => allViews).flat(), first]) {
      switchNumber += 1;
      if (switchNumber % 4 === 0) {
        window.hide();
        for (const item of allViews) item.webContents.setBackgroundThrottling(false);
        window.show();
      }
      isolateActiveBrowserView(window, allViews, view, bounds);
      assert.equal(rebindBrowserViewSurface(window, view, bounds), true);
      repaintBrowserViewSurface(view, () => bounds);
      await new Promise((resolve) => setTimeout(resolve, 220));
      let image;
      try {
        image = await view.webContents.capturePage();
      } catch (error) {
        throw new Error(`falha ao capturar a superfície após o reanexo ${switchNumber}: ${error.message || error}`, { cause: error });
      }
      assert.ok(containsColor(image, expectedColors.get(view)), 'a sessão selecionada precisa recompor sua superfície visual');
      assert.equal(getAttachedBrowserViews(window).length, 1);
      assert.deepEqual(view.getBounds(), bounds);
    }

    assert.equal(getAttachedBrowserViews(window).length, 1);
    assert.equal(getAttachedBrowserViews(window).at(-1), first);
    assert.equal(window.listenerCount('closed'), initialClosedListeners, 'trocas não devem acumular listeners na janela');
    assert.deepEqual(first.getBounds(), bounds);
    assert.equal(await first.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await second.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await third.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await fourth.webContents.executeJavaScript('globalThis.loads'), 1);
    for (const view of allViews) assert.ok(await view.webContents.executeJavaScript('globalThis.ticks > 0'));
    for (const view of allViews) {
      assert.equal(navigationCounts.get(view), 1, 'recuperação não deve navegar');
      assert.equal(await view.webContents.executeJavaScript('document.querySelector("#draft").value'), 'rascunho preservado');
    }
    const reports = [];
    const target = { view: first, attached: true };
    const monitor = createBrowserSurfaceMonitor({
      getTarget: () => target, isCurrent: () => true,
      report: event => reports.push(event),
      recover: () => {
        rebindBrowserViewSurface(window, first, bounds);
        repaintBrowserViewSurface(first, () => bounds);
      }
    });
    await first.webContents.executeJavaScript('document.body.style.background="rgb(128,128,128)"; document.body.style.visibility="hidden"');
    await new Promise(resolve => setTimeout(resolve, 200));
    await monitor();
    assert.ok(reports.includes('blank'), 'monitor deve identificar uma superfície realmente cinza');
    await first.webContents.executeJavaScript('document.body.style.background="rgb(20,80,160)"; document.body.style.visibility="visible"');
    await new Promise(resolve => setTimeout(resolve, 200));
    await monitor();
    assert.ok(reports.includes('healthy'));
    assert.equal(navigationCounts.get(first), 1);
    assert.equal(await first.webContents.executeJavaScript('navigator.userAgent'), runtimeUserAgent);
    console.log(`${switchNumber} trocas, ocultar/restaurar, monitor cinza e rascunhos preservados; Electron ${process.versions.electron}; GPU ${app.isHardwareAccelerationEnabled()}`);
  } finally {
    if (!first.webContents.isDestroyed()) first.webContents.close();
    if (!second.webContents.isDestroyed()) second.webContents.close();
    if (!third.webContents.isDestroyed()) third.webContents.close();
    if (!fourth.webContents.isDestroyed()) fourth.webContents.close();
    if (!window.isDestroyed()) window.destroy();
    clearTimeout(deadline);
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
