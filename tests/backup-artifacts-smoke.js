const { app, BrowserWindow, BrowserView, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { captureWhatsAppConversation } = require('../src/whatsapp-conversation-capture');
const { withTemporarilyAttachedBrowserView } = require('../src/browser-view-lifecycle');

app.whenReady().then(async () => {
  const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'central-backup-smoke-'));
  if (process.env.KEEP_BACKUP_SMOKE === '1') console.log(`artefatos do teste: ${directory}`);
  const window = new BrowserWindow({ show: true, width: 1000, height: 800, webPreferences: { sandbox: true } });
  const view = new BrowserView({ webPreferences: { sandbox: true } });
  try {
    const messages = Array.from({ length: 34 }, (_, index) => `
      <div data-id="message-${index + 1}" class="message ${index % 2 ? 'received' : 'sent'}"
        style="${index === 0 ? 'background:rgb(250,10,10)' : index === 33 ? 'background:rgb(10,10,250)' : ''}">
        <strong>${index % 2 ? 'Cliente' : 'Você'}</strong><span>Mensagem real visível ${index + 1}</span>
      </div>`).join('');
    const html = `<!doctype html><style>
      *{box-sizing:border-box}body{margin:0;background:#111;color:#eee;font:15px Arial}aside{background:#202c33;bottom:0;left:0;position:fixed;top:0;width:260px}
      #main{background:#efeae2;bottom:0;left:260px;position:fixed;right:0;top:0}header,footer{align-items:center;background:#202c33;display:flex;height:62px;padding:14px;position:absolute;width:100%;z-index:2}
      header{top:0}footer{bottom:0}.scroll{bottom:62px;overflow-y:auto;padding:16px;position:absolute;top:62px;width:100%}.message{background:#fff;border-radius:8px;color:#18221f;display:grid;gap:4px;margin:7px 0;max-width:70%;padding:10px}.sent{background:#d9fdd3;margin-left:auto}
    </style><aside>Conversas</aside><main id="main"><header>Cliente de teste</header><div class="scroll">${messages}</div><footer>Digite uma mensagem</footer></main>`;
    await view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const printsDirectory = path.join(directory, '01-prints');
    const progress = [];
    let count;
    try {
      count = await withTemporarilyAttachedBrowserView(
        window,
        view,
        { x: 0, y: 0, width: 1000, height: 800 },
        () => captureWhatsAppConversation(view.webContents, printsDirectory, (item) => progress.push(item), {
          captureDelayMs: 20
        }),
        { settleMs: 100 }
      );
    } catch (error) {
      console.error('progresso antes da falha:', progress);
      throw error;
    }
    assert.equal(window.getBrowserViews().includes(view), false, 'a conversa deve voltar a ficar atrás do modal');
    assert.ok(count >= 2);
    const firstPrint = path.join(printsDirectory, '001.png');
    const firstImage = nativeImage.createFromBuffer(fs.readFileSync(firstPrint));
    const lastImage = nativeImage.createFromBuffer(fs.readFileSync(path.join(
      printsDirectory,
      `${String(count).padStart(3, '0')}.png`
    )));
    const containsColor = (image, red, green, blue) => {
      const pixels = image.toBitmap();
      for (let index = 0; index < pixels.length; index += 4) {
        const rgba = pixels[index] === red && pixels[index + 1] === green && pixels[index + 2] === blue;
        const bgra = pixels[index] === blue && pixels[index + 1] === green && pixels[index + 2] === red;
        if (rgba || bgra) return true;
      }
      return false;
    };
    assert.ok(firstImage.getSize().width < 1000, 'a captura deve recortar a lista lateral e manter somente a conversa');
    assert.ok(containsColor(firstImage, 250, 10, 10), 'o primeiro print deve incluir a primeira mensagem');
    assert.ok(containsColor(lastImage, 10, 10, 250), 'o último print deve incluir a última mensagem');
    assert.ok(progress.some((item) => item.phase === 'screenshots'));

    const audioDirectory = path.join(directory, '02-audios');
    fs.mkdirSync(audioDirectory);
    fs.writeFileSync(path.join(audioDirectory, '001-2026-08-05-18-30-45-recebido.ogg'), Buffer.from('audio-test'));
    const zipPath = path.join(directory, 'backup.zip');
    const zip = new AdmZip();
    zip.addLocalFolder(printsDirectory, '01-prints');
    zip.addLocalFolder(audioDirectory, '02-audios');
    zip.writeZip(zipPath);
    const entries = new AdmZip(zipPath).getEntries().map((entry) => entry.entryName);
    assert.ok(entries.includes('01-prints/001.png'));
    assert.ok(entries.includes('02-audios/001-2026-08-05-18-30-45-recebido.ogg'));
    console.log('área real da conversa capturada em ordem e compactada com os áudios');
  } finally {
    if (!view.webContents.isDestroyed()) view.webContents.close();
    if (!window.isDestroyed()) window.destroy();
    if (process.env.KEEP_BACKUP_SMOKE !== '1') fs.rmSync(directory, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
