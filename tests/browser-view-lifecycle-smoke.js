const { app, BrowserView, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { isolateActiveBrowserView } = require('../src/browser-view-lifecycle');
const { createWhatsAppUserAgent } = require('../src/whatsapp-user-agent');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: true, width: 900, height: 700 });
  window.setAlwaysOnTop(true);
  const first = new BrowserView();
  const second = new BrowserView();
  const third = new BrowserView();
  const fourth = new BrowserView();
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
    for (const view of [first, second, third, fourth, second, fourth, first]) {
      isolateActiveBrowserView(window, allViews, view, bounds);
      view.setBounds({ ...bounds, width: bounds.width - 1 });
      view.webContents.invalidate?.();
      await new Promise((resolve) => setTimeout(resolve, 35));
      isolateActiveBrowserView(window, allViews, view, bounds);
      await new Promise((resolve) => setTimeout(resolve, 220));
      const image = await view.webContents.capturePage();
      assert.ok(containsColor(image, expectedColors.get(view)), 'a sessão selecionada precisa recompor sua superfície visual');
    }

    assert.equal(window.getBrowserViews().length, 1);
    assert.equal(window.getBrowserViews().at(-1), first);
    assert.deepEqual(first.getBounds(), bounds);
    assert.equal(await first.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await second.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await third.webContents.executeJavaScript('globalThis.loads'), 1);
    assert.equal(await fourth.webContents.executeJavaScript('globalThis.loads'), 1);
    for (const view of allViews) assert.ok(await view.webContents.executeJavaScript('globalThis.ticks > 0'));
    assert.equal(await first.webContents.executeJavaScript('navigator.userAgent'), runtimeUserAgent);
    console.log(`troca repetida entre quatro BrowserViews com somente uma superfície anexada e sem recarga; Chromium ${process.versions.chrome}`);
  } finally {
    if (!first.webContents.isDestroyed()) first.webContents.close();
    if (!second.webContents.isDestroyed()) second.webContents.close();
    if (!third.webContents.isDestroyed()) third.webContents.close();
    if (!fourth.webContents.isDestroyed()) fourth.webContents.close();
    if (!window.isDestroyed()) window.destroy();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
