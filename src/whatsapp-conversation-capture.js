const fs = require('node:fs');
const path = require('node:path');
const { serializeWhatsAppId } = require('./conversation-backup');

// O JID pode mudar entre o histórico (@lid) e o DOM (@c.us).
// A direção e a chave da mensagem continuam identificando a mesma mensagem.
function conversationMessageKey(value) {
  const id = String(value || '');
  const match = /^(true|false)_([^_]+)_(.+)$/.exec(id);
  let raw = match ? match[3].replace(/_[^_]+@[^_]+$/, '') : id;
  // Chaves de 16 bytes podem aparecer como hexadecimal ou base64/base64url.
  // Só unifica codificações reversíveis dos mesmos bytes, nunca texto parecido.
  if (/^[0-9a-f]{32}$/i.test(raw)) raw = raw.toUpperCase();
  else if (/^[A-Za-z0-9_+/-]{22}$/.test(raw)) {
    try {
      const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = atob(base64 + '==');
      if (bytes.length === 16 && btoa(bytes).replace(/=+$/, '') === base64) {
        raw = Array.from(bytes, character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    } catch {}
  }
  return match ? `${match[1]}_${raw}` : raw;
}

function createConversationMessageIndex(ids) {
  const index = new Map();
  for (const id of ids) {
    const key = conversationMessageKey(id);
    const raw = /^(true|false)_/.test(key) ? key.replace(/^(true|false)_/, '') : null;
    for (const alias of [key, raw].filter(Boolean)) {
      if (!index.has(alias)) index.set(alias, id);
      else if (index.get(alias) !== id) index.set(alias, null); // Uma chave simples ambígua não identifica a mensagem.
    }
  }
  return index;
}

let messagePositionSequence = 0;

// Executado na página: não aguarda openChatAt, que pode ficar pendente mesmo
// depois de a interface mostrar a mensagem ou o aviso de histórico do celular.
function pollConversationMessage(chatId, messageId, messageKeys, token, stableMs, keyOf, serializeId) {
  const chat = globalThis.WPP?.chat;
  if (!chat?.openChatAt) throw new Error('Não foi possível localizar as mensagens para os prints.');
  const activeId = serializeId(chat.getActiveChat?.()?.id);
  if (activeId && activeId !== chatId) throw new Error('A conversa mudou durante o backup.');
  let state = globalThis.__centralMessagePosition;
  if (state?.token !== token) {
    state = { token, attempts: 0, pending: false, lastAttempt: 0, signature: '', stableSince: 0 };
    globalThis.__centralMessagePosition = state;
  }
  const main = document.querySelector('#main') || document.querySelector('[role="main"]');
  const target = [...(main?.querySelectorAll('[data-id]') || [])].find(el => messageKeys.includes(keyOf(el.getAttribute('data-id'))));
  if (target) {
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    const rect = target.getBoundingClientRect();
    if (rect.height > 0) {
      const signature = [Math.round(rect.top), Math.round(rect.height), main.querySelectorAll('[data-id]').length].join(':');
      if (signature !== state.signature) { state.signature = signature; state.stableSince = Date.now(); }
      else if (Date.now() - state.stableSince >= stableMs) return { ok: true };
      return { ok: false };
    }
  }
  state.signature = '';
  // O carregamento do celular fica sob controle do usuário. A captura nunca
  // clica em avisos, anexos ou outros controles da conversa.
  // Uma única abertura. Repetir openChatAt pode reposicionar/focar a imagem
  // enquanto o DOM está carregando e parecer um clique repetido no chat.
  if (!state.pending && state.attempts === 0) {
    state.pending = true;
    state.attempts++;
    state.lastAttempt = Date.now();
    Promise.resolve().then(() => {
      if (globalThis.__centralMessagePosition === state) return chat.openChatAt(chatId, messageId, 'Chatlist');
    }).catch(error => { state.openErrorCode = String(error?.code || error?.name || 'unknown'); }).finally(() => { state.pending = false; });
  }
  const elements = [...(main?.querySelectorAll('[data-id]') || [])];
  return { ok: false, diagnostic: {
    navigationAttempts: state.attempts, navigationPending: state.pending, navigationErrorCode: state.openErrorCode || '',
    targetIdFormat: /^(true|false)_[^_]+_.+/.test(messageId) ? 'serialized-message' : 'invalid',
    renderedIdCount: elements.length,
    expectedAliasCount: messageKeys.length,
    targetSerializedKeyLength: messageId.replace(/^(true|false)_[^_]+_/, '').replace(/_[^_]+@[^_]+$/, '').length,
    matchingKeyCount: elements.filter(el => messageKeys.includes(keyOf(el.getAttribute('data-id')))).length,
    renderedIdFormats: [...new Set(elements.map(el => {
      const id = el.getAttribute('data-id') || '';
      return /^(true|false)_[^_]+_.+/.test(id) ? 'serialized-message' : /^[A-Za-z0-9]+$/.test(id) ? 'simple-key' : 'other';
    }))],
    renderedIdShapes: [...new Set(elements.map(el => {
      const id = el.getAttribute('data-id') || '';
      return `${id.length} characters; separators: ${[...new Set(id.match(/[^A-Za-z0-9]/g) || [])].join('')}`;
    }))].slice(0, 10)
  } };
}

async function positionConversationMessage(webContents, chatId, messageId, waitMs, options = {}, onProgress = () => {}) {
  const token = `${Date.now()}-${++messagePositionSequence}`;
  const started = Date.now();
  const maxWaitMs = Math.max(500, Number(options.messageLoadMaxMs) || 90000);
  let lastProgress = 0;
  let diagnostic = null;
  const index = createConversationMessageIndex(options.messageIds || [messageId]);
  const messageKeys = [...index].filter(([, id]) => id === messageId).map(([key]) => key);
  const recordNumber = options.messageIds?.indexOf(messageId);
  const label = ({ image: 'a imagem', video: 'o vídeo', audio: 'o áudio', ptt: 'o áudio', document: 'o documento' })[options.messageTypes?.[messageId]] || 'a mensagem';
  try {
    while (Date.now() - started < maxWaitMs) {
      if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
      const result = await withOperationTimeout(webContents.executeJavaScript(`(() => {
        // __centralCaptureMessage
        const messageId = ${JSON.stringify(messageId)};
        return (${pollConversationMessage.toString()})(${JSON.stringify(chatId)}, messageId,
          ${JSON.stringify(messageKeys)}, ${JSON.stringify(token)},
          ${Math.max(300, Number(waitMs) || 900)}, ${conversationMessageKey.toString()}, ${serializeWhatsAppId.toString()});
      })()`), 5000, 'O WhatsApp não respondeu durante a busca da mensagem.');
      if (result?.ok) return result;
      diagnostic = result?.diagnostic || diagnostic;
      if (Date.now() - lastProgress >= 5000) {
        lastProgress = Date.now();
        onProgress({ phase: 'history', current: 0, total: 0, message: `Aguardando o WhatsApp localizar ${label}${recordNumber >= 0 ? ` ${recordNumber + 1} de ${options.messageIds.length}` : ''} para o print…` });
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const index = options.messageIds?.indexOf(messageId);
    const type = options.messageTypes?.[messageId] || 'não identificado';
    const error = new Error(`Não foi possível localizar o registro${index >= 0 ? ` ${index + 1} de ${options.messageIds.length}` : ''} na tela (tipo: ${type}). Isso pode ocorrer mesmo com a conversa carregada. O backup foi interrompido para evitar prints incompletos.`);
    error.diagnostic = { stage: 'message-position', recordIndex: index >= 0 ? index + 1 : null, expectedCount: options.messageIds?.length || 0, recordType: type, ...diagnostic };
    throw error;
  } finally {
    await withOperationTimeout(webContents.executeJavaScript(`(() => {
      if (globalThis.__centralMessagePosition?.token === ${JSON.stringify(token)}) delete globalThis.__centralMessagePosition;
    })()`), 3000, 'Não foi possível encerrar a busca da mensagem.').catch(() => {});
  }
}

async function inspectConversationCapture(webContents) {
  return withOperationTimeout(webContents.executeJavaScript(`(() => {
    // __centralCaptureInspect
    const state = globalThis.__centralConversationBackupCapture;
    if (!state?.main?.isConnected || !state?.scroller?.isConnected) throw new Error('A conversa mudou durante o backup.');
    const mainRect = state.main.getBoundingClientRect();
    const scrollRect = state.scroller.getBoundingClientRect();
    const top = Math.max(0, scrollRect.top);
    const bottom = Math.min(window.innerHeight, scrollRect.bottom);
    const messages = [...state.main.querySelectorAll('[data-id]')].map(el => {
      const rect = el.getBoundingClientRect();
      return { id: el.getAttribute('data-id'), top: rect.top, bottom: rect.bottom, height: rect.height };
    }).filter(item => item.height > 0 && item.bottom > top && item.top < bottom);
    return {
      ok: true,
      rect: { x: Math.max(0, Math.floor(mainRect.x)), y: Math.max(0, Math.floor(mainRect.y)), width: Math.max(1, Math.floor(mainRect.width)), height: Math.max(1, Math.floor(mainRect.height)) },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollTop: state.scroller.scrollTop, scrollHeight: state.scroller.scrollHeight, clientHeight: state.scroller.clientHeight,
      top, bottom, messages
    };
  })()`), 5000, 'O WhatsApp demorou para conferir as mensagens do print.');
}

async function saveConversationScreenshot(webContents, layout, screenshotsDirectory, index) {
  const fullImage = await captureRenderedPage(webContents);
  const imageSize = fullImage.getSize();
  const scaleX = imageSize.width / Math.max(1, layout.viewport.width);
  const scaleY = imageSize.height / Math.max(1, layout.viewport.height);
  const x = Math.max(0, Math.min(imageSize.width - 1, Math.round(layout.rect.x * scaleX)));
  const y = Math.max(0, Math.min(imageSize.height - 1, Math.round(layout.rect.y * scaleY)));
  const width = Math.max(1, Math.min(imageSize.width - x, Math.round(layout.rect.width * scaleX)));
  const height = Math.max(1, Math.min(imageSize.height - y, Math.round(layout.rect.height * scaleY)));
  const data = fullImage.crop({ x, y, width, height }).toPNG();
  if (data.length < 1000) throw new Error('O WhatsApp não produziu uma captura válida da conversa.');
  fs.writeFileSync(path.join(screenshotsDirectory, `${String(index).padStart(3, '0')}.png`), data);
}

async function captureConversationByMessages(webContents, directory, onProgress, options) {
  const ids = [...new Set(options.messageIds.filter(Boolean))];
  const expectedIds = new Set(ids);
  const idsByKey = createConversationMessageIndex(ids);
  const identifyMessages = layout => {
    layout.messages = layout.messages.map(item => ({ ...item, id: idsByKey.get(conversationMessageKey(item.id)) || item.id }));
    return layout;
  };
  const captured = new Set();
  let pages = 0;
  let lastLayout = null;
  const remember = layout => {
    for (const item of layout.messages) {
      if (expectedIds.has(item.id) && item.top >= layout.top - 2 && item.bottom <= layout.bottom + 2) captured.add(item.id);
    }
    lastLayout = layout;
  };
  fs.mkdirSync(directory, { recursive: true });
  for (const id of ids) {
    if (captured.has(id)) continue;
    if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
    // Entre os alvos, percorre a tela com sobreposição em vez de saltar sobre
    // cartões de chamadas e outros elementos que não têm data-id próprio.
    for (let step = 0; lastLayout && !captured.has(id) && step < 100; step++) {
      if (lastLayout.messages.some(item => item.id === id)) break;
      if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
      const signature = layout => JSON.stringify([layout.scrollTop, layout.scrollHeight, layout.messages.map(item => [item.id, Math.round(item.top)])]);
      const previous = signature(lastLayout);
      await positionWhatsAppConversation(webContents, lastLayout.scrollTop + Math.max(100, Math.floor((lastLayout.bottom - lastLayout.top) * 0.65)), options.captureDelayMs);
      const next = identifyMessages(await inspectConversationCapture(webContents));
      if (signature(next) === previous) break;
      await saveConversationScreenshot(webContents, next, directory, ++pages);
      remember(next);
      onProgress({ phase: 'screenshots', current: ids.filter(value => captured.has(value)).length, total: ids.length, message: `Salvando print ${pages} — avançando pela conversa…` });
    }
    if (captured.has(id)) continue;
    onProgress({ phase: 'screenshots', current: captured.size, total: ids.length, message: `Localizando mensagem ${captured.size + 1} de ${ids.length} para os prints…` });
    try {
      await positionConversationMessage(webContents, options.chatId, id, options.captureDelayMs, options, progress => onProgress({
        ...progress, phase: 'screenshots', current: captured.size, total: ids.length
      }));
    } catch (error) {
      if (error.code !== 'backup_cancelled') {
        try {
          const snapshot = await withOperationTimeout(webContents.capturePage(), 5000, 'A tela da falha não respondeu.');
          const failurePath = path.join(path.dirname(directory), 'falha-captura.png');
          if (!snapshot.isEmpty?.()) { fs.writeFileSync(failurePath, snapshot.toPNG()); error.failureScreenshotPath = failurePath; }
        } catch {}
      }
      throw error;
    }
    const prepared = await prepareWhatsAppConversationCapture(webContents);
    if (!prepared?.ok) throw new Error(prepared?.error || 'Não foi possível preparar as capturas.');
    let layout = identifyMessages(await inspectConversationCapture(webContents));
    let target = layout.messages.find(item => item.id === id);
    if (!target) throw new Error('A mensagem localizada não ficou visível para o print.');
    if (target.top < layout.top - 2) throw new Error('O início da mensagem ficou fora do print. O backup foi interrompido para evitar um trecho faltando.');
    // Mensagens maiores que a tela precisam de vários prints com sobreposição.
    for (;;) {
      if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
      await saveConversationScreenshot(webContents, layout, directory, ++pages);
      remember(layout);
      if (target.bottom <= layout.bottom + 2) { captured.add(id); break; }
      const previousTop = target.top;
      await positionWhatsAppConversation(webContents, layout.scrollTop + Math.max(100, Math.floor((layout.bottom - layout.top) * 0.65)), options.captureDelayMs);
      layout = identifyMessages(await inspectConversationCapture(webContents));
      target = layout.messages.find(item => item.id === id);
      if (!target || target.top >= previousTop - 2) throw new Error('O WhatsApp não avançou na mensagem. O backup foi interrompido para evitar um trecho faltando.');
    }
    onProgress({ phase: 'screenshots', current: ids.filter(value => captured.has(value)).length, total: ids.length, message: `Salvando print ${pages} — conferindo as mensagens do histórico…` });
  }
  return pages;
}

async function prepareWhatsAppConversationCapture(webContents) {
  return webContents.executeJavaScript(`(() => {
    const main = document.querySelector('#main') || document.querySelector('[role="main"]');
    if (!main) return { ok: false, error: 'Abra uma conversa antes de gerar as capturas.' };
    const candidates = [main, ...main.querySelectorAll('div')].filter((element) => {
      const style = getComputedStyle(element);
      const scrollableStyle = /auto|scroll/.test(style.overflowY || '');
      return element.clientHeight > 220 && element.scrollHeight >= element.clientHeight
        && (scrollableStyle || (element.scrollHeight > element.clientHeight + 40 && element.querySelector('[data-id]')));
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

async function loadWhatsAppConversationHistory(webContents, initial, readConversation, onProgress = () => {}, options = {}) {
  const started = Date.now();
  const maxWaitMs = Math.max(1000, Number(options.historyLoadMaxMs) || 180000);
  const requiredStableRounds = Math.max(2, Number(options.historyStableRounds) || 3);
  let conversation = initial;
  const records = new Map(initial.messages.map(message => [message.id, message]));
  const initialMessageCount = records.size;
  let stableRounds = 0;
  let previousSignature = '';
  let rounds = 0;
  const checkCancelled = () => {
    if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
  };
  while (Date.now() - started < maxWaitMs) {
    checkCancelled();
    rounds++;
    onProgress({ phase: 'history', current: 0, total: 0, message: `Carregando o início da conversa… ${records.size} registros encontrados; conferência ${rounds}.` });
    const first = conversation.messages.find(message => !['call_log', 'e2e_notification'].includes(message.type));
    if (first) await positionConversationMessage(webContents, conversation.chat.id, first.id, 300, { ...options, messageLoadMaxMs: Math.min(30000, maxWaitMs - (Date.now() - started)) });
    const prepared = await prepareWhatsAppConversationCapture(webContents);
    if (!prepared?.ok) throw new Error(prepared?.error || 'Não foi possível preparar o carregamento do histórico.');
    const edge = await withOperationTimeout(settleWhatsAppConversationEdge(webContents, 'top', {
      maxWaitMs: Number(options.historyEdgeWaitMs) || 15000,
      stableMs: Number(options.historyEdgeStableMs) || 3000,
      checkHistoryLoading: true
    }), 18000, 'O início da conversa não respondeu durante o carregamento.');
    checkCancelled();
    if (edge.phoneHistoryNotice) throw new Error('O WhatsApp ainda pede para carregar mensagens antigas do celular. Carregue esse histórico na conversa e tente novamente. Nenhum ZIP foi gerado.');
    const refreshed = await withOperationTimeout(readConversation(), 30000, 'O WhatsApp não concluiu a releitura do histórico.');
    checkCancelled();
    if (!refreshed?.ok || refreshed.chat.id !== initial.chat.id) throw new Error(refreshed?.error || 'A conversa mudou durante o carregamento do histórico.');
    for (const message of refreshed.messages) records.set(message.id, message);
    conversation = { ...refreshed, messages: [...records.values()].sort((a, b) => a.timestampMs - b.timestampMs || a.sequence - b.sequence) };
    const signature = JSON.stringify(conversation.messages.map(message => message.id));
    stableRounds = signature === previousSignature && !edge.historyLoading ? stableRounds + 1 : 0;
    previousSignature = signature;
    if (stableRounds >= requiredStableRounds) return { conversation, rounds, initialMessageCount };
  }
  throw new Error('O histórico ainda está carregando e não estabilizou. O backup foi interrompido antes dos prints para evitar uma conversa incompleta.');
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
    let historyLoading = false;
    let phoneHistoryNotice = false;
    while (Date.now() - startedAt < ${maxWaitMs}) {
      scroller.scrollTop = edge === 'top' ? 0 : scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      // requestAnimationFrame pode ser suspenso pelo Chromium em BrowserViews
      // temporariamente cobertos pelo modal. O timer continua ativo nesse caso.
      await new Promise((resolve) => setTimeout(resolve, 40));
      const messageCount = state.main?.querySelectorAll?.('[data-id]')?.length || 0;
      if (${Boolean(options.checkHistoryLoading)}) {
        const notice = /(?:carregar mensagens mais antigas do seu celular|(?:get|load) older messages from your phone)/i;
        phoneHistoryNotice = [...state.main.querySelectorAll('button, [role="button"], span, div')].some(el => (
          !el.closest('[data-id]') && el.getBoundingClientRect().height > 0 && String(el.textContent || '').length < 250 && notice.test(el.textContent || '')
        ));
        historyLoading = [...state.main.querySelectorAll('[role="progressbar"], [aria-busy="true"], [data-icon*="spinner"]')].some(el => !el.closest('[data-id]') && el.getBoundingClientRect().height > 0);
      }
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const atEdge = edge === 'top'
        ? Math.abs(scroller.scrollTop) <= 2
        : Math.abs(maxScroll - scroller.scrollTop) <= 3;
      const signature = [scroller.scrollHeight, scroller.clientHeight, [...state.main.querySelectorAll('[data-id]')].map(el => el.getAttribute('data-id')).join(','), Math.round(scroller.scrollTop)].join(':');
      if (signature !== previousSignature || !atEdge || historyLoading) {
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
      messageCount: state.main?.querySelectorAll?.('[data-id]')?.length || 0,
      historyLoading, phoneHistoryNotice
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
  if (options.chatId && Array.isArray(options.messageIds) && options.messageIds.length) {
    try {
      return await captureConversationByMessages(webContents, screenshotsDirectory, onProgress, options);
    } finally {
      await webContents.executeJavaScript(`(() => {
        const scroller = globalThis.__centralConversationBackupCapture?.scroller;
        if (scroller?.isConnected) scroller.scrollTop = scroller.scrollHeight;
        delete globalThis.__centralConversationBackupCapture;
      })()`).catch(() => {});
    }
  }
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

module.exports = { captureWhatsAppConversation, prepareWhatsAppConversationCapture, positionConversationMessage, loadWhatsAppConversationHistory };
