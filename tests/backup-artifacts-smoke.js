const { app, BrowserWindow, WebContentsView, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { captureWhatsAppConversation } = require('../src/whatsapp-conversation-capture');
const { getAttachedBrowserViews, withTemporarilyAttachedBrowserView } = require('../src/browser-view-lifecycle');

app.whenReady().then(async () => {
  const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'central-backup-smoke-'));
  if (process.env.KEEP_BACKUP_SMOKE === '1') console.log(`artefatos do teste: ${directory}`);
  const window = new BrowserWindow({ show: true, width: 1000, height: 800, webPreferences: { sandbox: true } });
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
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
    assert.equal(getAttachedBrowserViews(window).includes(view), false, 'a conversa deve voltar a ficar atrás do modal');
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

    // Simula a janela virtualizada do WhatsApp: somente oito mensagens estão
    // no DOM, embora o histórico tenha 34. A altura não revela o total.
    await view.webContents.executeJavaScript(`(() => {
      for (const el of document.querySelectorAll('[data-id]')) {
        el.setAttribute('data-id', 'MSG' + el.getAttribute('data-id').split('-')[1]);
      }
      document.querySelector('[data-id="MSG21"]').setAttribute('data-id', '00112233445566778899AABBCCDDEEFF');
      const allMessages = [...document.querySelectorAll('[data-id]')].map((el, index) =>
        (index === 3 ? '<div style="height:850px;background:rgb(181,13,209)">Registro de ligação sem data-id</div>' : '') + el.outerHTML);
      globalThis.__openedBackupMessages = [];
      globalThis.WPP = { chat: { getActiveChat: () => ({ id: { _serialized: 'test-chat' } }), openChatAt: async (_chat, id) => {
        globalThis.__openedBackupMessages.push(id);
        const index = id.includes('ABEiM0RVZneImaq7zN3u_w') ? 20 : Number(id.split('_MSG')[1]) - 1;
        // Reproduz o aviso do celular com openChatAt ainda pendente. A tela
        // recebe as mensagens antes de a promessa de navegação terminar.
        if (globalThis.__openedBackupMessages.length === 1) {
          const scroller = document.querySelector('.scroll');
          scroller.innerHTML = '<button id="phone-history">Clique neste aviso para carregar mensagens mais antigas do seu celular.</button>';
          globalThis.__phoneHistoryRequests = 0;
          document.querySelector('#phone-history').onclick = () => { globalThis.__phoneHistoryRequests++; };
          setTimeout(() => { scroller.innerHTML = allMessages.slice(index, index + 8).join(''); scroller.scrollTop = 0; }, 600);
          return new Promise(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, 350));
        const scroller = document.querySelector('.scroll');
        scroller.innerHTML = allMessages.slice(index, index + 8).join('');
        scroller.scrollTop = 0;
        return true;
      } } };
      document.querySelector('.scroll').innerHTML = allMessages.slice(-8).join('');
    })()`);
    const anchoredDirectory = path.join(directory, 'prints-historico-virtualizado');
    const anchoredProgress = [];
    const anchoredCount = await withTemporarilyAttachedBrowserView(window, view,
      { x: 0, y: 0, width: 1000, height: 800 },
      () => captureWhatsAppConversation(view.webContents, anchoredDirectory, item => anchoredProgress.push(item), {
        chatId: 'test-chat', messageIds: Array.from({ length: 34 }, (_, index) => index === 20 ? 'false_123456789@lid_ABEiM0RVZneImaq7zN3u_w' : `false_123456789@lid_MSG${index + 1}`), captureDelayMs: 300
      }), { settleMs: 100 });
    const anchoredFirst = nativeImage.createFromPath(path.join(anchoredDirectory, '001.png'));
    const anchoredLast = nativeImage.createFromPath(path.join(anchoredDirectory, `${String(anchoredCount).padStart(3, '0')}.png`));
    assert.ok(containsColor(anchoredFirst, 250, 10, 10), 'o backup deve buscar a primeira mensagem fora da janela atual do DOM');
    assert.ok(containsColor(anchoredLast, 10, 10, 250), 'o backup deve alcançar a última mensagem sem pular as intermediárias');
    assert.equal(anchoredProgress.at(-1).current, 34, 'todas as mensagens do histórico devem estar cobertas');
    assert.ok(anchoredCount > 2, 'a janela inicial sozinha não pode definir o número de prints');
    assert.ok(fs.readdirSync(anchoredDirectory).some(file => containsColor(nativeImage.createFromPath(path.join(anchoredDirectory, file)), 181, 13, 209)), 'deve capturar o cartão de chamada entre as mensagens');
    assert.equal(await view.webContents.executeJavaScript('globalThis.__phoneHistoryRequests'), 0, 'não deve clicar no aviso do celular');

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
