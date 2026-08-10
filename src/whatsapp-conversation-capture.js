const fs = require('node:fs');
const path = require('node:path');

async function prepareWhatsAppConversationCapture(webContents) {
  return webContents.executeJavaScript(`(() => {
    const main = document.querySelector('#main') || document.querySelector('[role="main"]');
    if (!main) return { ok: false, error: 'Abra uma conversa antes de gerar as capturas.' };
    const candidates = [main, ...main.querySelectorAll('div')].filter((element) => {
      const style = getComputedStyle(element);
      const scrollableStyle = /auto|scroll/.test(style.overflowY || '');
      return element.clientHeight > 220 && element.scrollHeight > element.clientHeight + 40
        && (scrollableStyle || element.querySelector('[data-id]'));
    });
    const scroller = candidates.sort((first, second) => {
      const firstScore = (first.querySelector('[data-id]') ? 10000000 : 0) + first.scrollHeight;
      const secondScore = (second.querySelector('[data-id]') ? 10000000 : 0) + second.scrollHeight;
      return secondScore - firstScore;
    })[0];
    if (!scroller) return { ok: false, error: 'Não foi possível localizar a área rolável da conversa.' };
    scroller.style.scrollBehavior = 'auto';
    globalThis.__centralConversationBackupCapture = { main, scroller };
    return {
      ok: true,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      messageCount: main.querySelectorAll('[data-id]').length
    };
  })()`);
}

function withOperationTimeout(operation, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

async function settleWhatsAppConversationEdge(webContents, edge, options = {}) {
  const maxWaitMs = Math.max(500, Number(options.maxWaitMs) || 6000);
  const stableMs = Math.max(200, Number(options.stableMs) || 900);
  return webContents.executeJavaScript(`(async () => {
    // __centralCaptureEdge:${edge}
    const state = globalThis.__centralConversationBackupCapture;
    const scroller = state?.scroller;
    if (!scroller?.isConnected) throw new Error('A conversa mudou durante o backup.');
    const edge = ${JSON.stringify(edge)};
    const startedAt = Date.now();
    let stableSince = Date.now();
    let previousSignature = '';
    while (Date.now() - startedAt < ${maxWaitMs}) {
      scroller.scrollTop = edge === 'top' ? 0 : scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      // requestAnimationFrame pode ser suspenso pelo Chromium em BrowserViews
      // temporariamente cobertos pelo modal. O timer continua ativo nesse caso.
      await new Promise((resolve) => setTimeout(resolve, 40));
      const messageCount = state.main?.querySelectorAll?.('[data-id]')?.length || 0;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const atEdge = edge === 'top'
        ? Math.abs(scroller.scrollTop) <= 2
        : Math.abs(maxScroll - scroller.scrollTop) <= 3;
      const signature = [scroller.scrollHeight, scroller.clientHeight, messageCount, Math.round(scroller.scrollTop)].join(':');
      if (signature !== previousSignature || !atEdge) {
        previousSignature = signature;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= ${stableMs}) {
        break;
      }
    }
    return {
      ok: true,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      messageCount: state.main?.querySelectorAll?.('[data-id]')?.length || 0
    };
  })()`);
}

async function positionWhatsAppConversation(webContents, position, waitMs) {
  return webContents.executeJavaScript(`(async () => {
    // __centralCapturePosition
    const scroller = globalThis.__centralConversationBackupCapture?.scroller;
    if (!scroller?.isConnected) throw new Error('A conversa mudou durante o backup.');
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.max(0, Math.min(maxScroll, ${Math.max(0, Number(position) || 0)}));
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, ${Math.max(300, Number(waitMs) || 900)}));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      ok: true,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight
    };
  })()`);
}

async function capturePageThroughChromium(webContents) {
  const devtools = webContents?.debugger;
  if (!devtools?.sendCommand || !devtools?.attach) {
    throw new Error('O Chromium não disponibilizou uma rota alternativa para o print.');
  }
  const wasAttached = devtools.isAttached();
  if (!wasAttached) devtools.attach('1.3');
  try {
    await devtools.sendCommand('Page.enable');
    const result = await withOperationTimeout(
      devtools.sendCommand('Page.captureScreenshot', {
        format: 'png',
        // A superfície gráfica pode estar congelada quando outra janela cobre
        // a Central. Capturar da visualização força o quadro corrente do DOM.
        fromSurface: false,
        captureBeyondViewport: false
      }),
      20000,
      'O Chromium demorou para produzir a captura alternativa.'
    );
    const { nativeImage } = require('electron');
    const image = nativeImage.createFromBuffer(Buffer.from(result?.data || '', 'base64'));
    if (!image || image.isEmpty()) throw new Error('O Chromium devolveu uma captura vazia.');
    return image;
  } finally {
    if (!wasAttached && devtools.isAttached()) devtools.detach();
  }
}

async function captureRenderedPage(webContents) {
  try {
    return await withOperationTimeout(
      webContents.capturePage(),
      30000,
      'O WhatsApp demorou para produzir um dos prints.'
    );
  } catch (primaryError) {
    try {
      return await capturePageThroughChromium(webContents);
    } catch (fallbackError) {
      const error = new Error(`${primaryError.message || primaryError} A captura alternativa também falhou: ${fallbackError.message || fallbackError}`);
      error.cause = fallbackError;
      throw error;
    }
  }
}

async function captureWhatsAppConversation(webContents, screenshotsDirectory, onProgress = () => {}, options = {}) {
  const captureDelayMs = Math.max(300, Number(options.captureDelayMs) || 900);
  const initialLoadMaxMs = Math.max(500, Number(options.initialLoadMaxMs) || 12000);
  const edgeStableMs = Math.max(200, Number(options.edgeStableMs) || 1200);
  const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
  const prepared = await withOperationTimeout(
    prepareWhatsAppConversationCapture(webContents),
    5000,
    'O WhatsApp demorou para preparar a área da conversa.'
  );
  if (!prepared?.ok) throw new Error(prepared?.error || 'Não foi possível preparar as capturas.');
  if (isCancelled()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
  onProgress({
    phase: 'screenshots', current: 0, total: 0,
    message: 'Aguardando o início da conversa terminar de carregar…'
  });
  await withOperationTimeout(
    settleWhatsAppConversationEdge(webContents, 'top', {
      maxWaitMs: initialLoadMaxMs,
      stableMs: edgeStableMs
    }),
    initialLoadMaxMs + 2500,
    'O WhatsApp demorou para estabilizar o início da conversa.'
  );

  const layout = await withOperationTimeout(webContents.executeJavaScript(`(() => {
    const state = globalThis.__centralConversationBackupCapture;
    if (!state?.main?.isConnected || !state?.scroller?.isConnected) return { ok: false };
    const rect = state.main.getBoundingClientRect();
    return {
      ok: true,
      rect: {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height))
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollHeight: state.scroller.scrollHeight,
      clientHeight: state.scroller.clientHeight
    };
  })()`), 5000, 'O WhatsApp demorou para medir a conversa.');
  if (!layout?.ok) throw new Error('Não foi possível medir a conversa para as capturas.');
  const maxScroll = Math.max(0, layout.scrollHeight - layout.clientHeight);
  // Mantém cerca de 35% de sobreposição para evitar que uma mensagem seja
  // dividida sem aparecer inteira em pelo menos um dos prints vizinhos.
  const step = Math.max(220, Math.floor(layout.clientHeight * 0.65));
  const positions = [0];
  for (let position = step; position < maxScroll; position += step) positions.push(position);
  if (maxScroll > 0 && positions.at(-1) !== maxScroll) positions.push(maxScroll);

  fs.mkdirSync(screenshotsDirectory, { recursive: true });
  for (let index = 0; index < positions.length; index += 1) {
    if (isCancelled()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
    const isLast = index === positions.length - 1;
    if (isLast) {
      onProgress({
        phase: 'screenshots', current: index, total: positions.length,
        message: 'Aguardando o final da conversa terminar de carregar…'
      });
      await withOperationTimeout(
        settleWhatsAppConversationEdge(webContents, 'bottom', {
          maxWaitMs: 6000,
          stableMs: Math.min(edgeStableMs, 1000)
        }),
        8500,
        'O WhatsApp demorou para estabilizar o final da conversa.'
      );
    } else {
      await withOperationTimeout(
        positionWhatsAppConversation(webContents, positions[index], captureDelayMs),
        captureDelayMs + 3000,
        'O WhatsApp demorou para posicionar um dos prints.'
      );
    }
    const fullImage = await captureRenderedPage(webContents);
    const imageSize = fullImage.getSize();
    const scaleX = imageSize.width / Math.max(1, layout.viewport.width);
    const scaleY = imageSize.height / Math.max(1, layout.viewport.height);
    const cropX = Math.max(0, Math.min(imageSize.width - 1, Math.round(layout.rect.x * scaleX)));
    const cropY = Math.max(0, Math.min(imageSize.height - 1, Math.round(layout.rect.y * scaleY)));
    const cropWidth = Math.max(1, Math.min(imageSize.width - cropX, Math.round(layout.rect.width * scaleX)));
    const cropHeight = Math.max(1, Math.min(imageSize.height - cropY, Math.round(layout.rect.height * scaleY)));
    const data = fullImage.crop({ x: cropX, y: cropY, width: cropWidth, height: cropHeight }).toPNG();
    if (data.length < 1000) throw new Error('O WhatsApp não produziu uma captura válida da conversa.');
    fs.writeFileSync(path.join(screenshotsDirectory, `${String(index + 1).padStart(3, '0')}.png`), data);
    onProgress({
      phase: 'screenshots', current: index + 1, total: positions.length,
      message: `Salvando print ${index + 1} de ${positions.length}…`
    });
  }
  await withOperationTimeout(webContents.executeJavaScript(`(() => {
    const scroller = globalThis.__centralConversationBackupCapture?.scroller;
    if (scroller?.isConnected) scroller.scrollTop = scroller.scrollHeight;
    delete globalThis.__centralConversationBackupCapture;
  })()`), 3000, 'O WhatsApp demorou para restaurar a conversa.').catch(() => {});
  return positions.length;
}

module.exports = { captureWhatsAppConversation, prepareWhatsAppConversationCapture };
