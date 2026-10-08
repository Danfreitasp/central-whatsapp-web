const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { captureWhatsAppConversation, positionConversationMessage } = require('../src/whatsapp-conversation-capture');

function fakeWebContents() {
  let loadCalls = 0;
  const cropRects = [];
  const edgeCalls = [];
  const positionCalls = [];
  return {
    get loadCalls() { return loadCalls; },
    cropRects,
    edgeCalls,
    positionCalls,
    async executeJavaScript(source) {
      if (source.includes("const main = document.querySelector('#main')")) {
        return { ok: true, scrollHeight: 2000, clientHeight: 500, messageCount: 35 };
      }
      if (source.includes('__centralCaptureEdge:top')) {
        edgeCalls.push('top');
        return { ok: true, scrollTop: 0, scrollHeight: 2400, clientHeight: 500, messageCount: 42 };
      }
      if (source.includes('__centralCaptureEdge:bottom')) {
        edgeCalls.push('bottom');
        return { ok: true, scrollTop: 1900, scrollHeight: 2400, clientHeight: 500, messageCount: 42 };
      }
      if (source.includes('__centralCapturePosition')) {
        positionCalls.push(source);
        return { ok: true, scrollTop: 0, scrollHeight: 2400, clientHeight: 500 };
      }
      if (source.includes('state.scroller.scrollTop = 0')) {
        loadCalls += 1;
        // Simula a âncora do WhatsApp: a posição nunca volta a zero.
        return { ok: true, scrollTop: 240, scrollHeight: 2000, clientHeight: 500, messageCount: 35 };
      }
      if (source.includes('const rect = state.main.getBoundingClientRect()')) {
        return { ok: true, rect: { x: 200, y: 0, width: 800, height: 700 }, viewport: { width: 1000, height: 700 }, scrollHeight: 2400, clientHeight: 500 };
      }
      return undefined;
    },
    async capturePage() {
      return {
        getSize: () => ({ width: 800, height: 560 }),
        crop: (rect) => {
          cropRects.push(rect);
          return { toPNG: () => Buffer.alloc(2000, 1) };
        }
      };
    }
  };
}

test('aguarda as duas extremidades, percorre a conversa e compensa o zoom no recorte', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-test-'));
  try {
    const webContents = fakeWebContents();
    const pages = await captureWhatsAppConversation(webContents, directory, () => {}, {
      captureDelayMs: 20
    });
    assert.equal(webContents.loadCalls, 0);
    assert.ok(pages > 1);
    assert.deepEqual(webContents.edgeCalls, ['top', 'bottom']);
    assert.equal(webContents.positionCalls.length, pages - 1);
    assert.deepEqual(webContents.cropRects[0], { x: 160, y: 0, width: 640, height: 560 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('permite cancelar antes de continuar a busca do histórico', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-cancel-'));
  try {
    await assert.rejects(
      captureWhatsAppConversation(fakeWebContents(), directory, () => {}, { isCancelled: () => true }),
      (error) => error.code === 'backup_cancelled'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('confere mensagens por ID mesmo quando a altura da lista virtualizada não muda', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-virtual-'));
  const view = fakeWebContents();
  const original = view.executeJavaScript;
  const opened = [];
  let target;
  view.executeJavaScript = async source => {
    if (source.includes('__centralCaptureMessage')) {
      target = JSON.parse(source.match(/const messageId = (.*);/)[1]);
      opened.push(target);
      return { ok: true };
    }
    if (source.includes('__centralCaptureInspect')) {
      const first = Number(target.slice(1));
      return { ok: true, rect: { x: 200, y: 0, width: 800, height: 700 }, viewport: { width: 1000, height: 700 }, top: 60, bottom: 560, scrollTop: 0, scrollHeight: 800, clientHeight: 500,
        messages: [first, first + 1].map((value, index) => ({ id: `m${value}`, top: 70 + index * 180, bottom: 200 + index * 180, height: 130 })) };
    }
    return original.call(view, source);
  };
  try {
    const pages = await captureWhatsAppConversation(view, directory, () => {}, { chatId: 'chat', messageIds: ['m1', 'm2', 'm3', 'm4', 'm5'] });
    assert.equal(pages, 3);
    assert.deepEqual(opened, ['m1', 'm3', 'm5']);
    assert.equal(fs.readdirSync(directory).length, 3);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('interrompe o backup quando uma mensagem do histórico não aparece para o print', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-missing-'));
  const view = fakeWebContents();
  const original = view.executeJavaScript;
  view.executeJavaScript = async source => {
    if (source.includes('__centralCaptureMessage')) return { ok: true };
    if (source.includes('__centralCaptureInspect')) return { messages: [] };
    return original.call(view, source);
  };
  try {
    await assert.rejects(captureWhatsAppConversation(view, directory, () => {}, { chatId: 'chat', messageIds: ['missing'] }), /não ficou visível/);
    assert.equal(fs.readdirSync(directory).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('divide uma mensagem maior que a tela em prints sobrepostos', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-tall-'));
  const view = fakeWebContents();
  const original = view.executeJavaScript;
  let scrollTop = 0;
  view.executeJavaScript = async source => {
    if (source.includes('__centralCaptureMessage')) return { ok: true };
    if (source.includes('__centralCapturePosition')) { scrollTop += 325; return { ok: true }; }
    if (source.includes('__centralCaptureInspect')) return {
      rect: { x: 200, y: 0, width: 800, height: 700 }, viewport: { width: 1000, height: 700 },
      top: 60, bottom: 560, scrollTop, scrollHeight: 1800, clientHeight: 500,
      messages: [{ id: 'tall', top: 60 - scrollTop, bottom: 1260 - scrollTop, height: 1200 }]
    };
    return original.call(view, source);
  };
  try {
    assert.equal(await captureWhatsAppConversation(view, directory, () => {}, { chatId: 'chat', messageIds: ['tall'] }), 4);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('aguarda a mensagem com JIDs diferentes sem repetir a navegação', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-alias-'));
  const view = fakeWebContents();
  const original = view.executeJavaScript;
  let now = 0;
  let attempts = 0;
  const element = { getAttribute: () => 'false_5511999999999@c.us_ABC123', scrollIntoView() {}, getBoundingClientRect: () => ({ top: 70, height: 130 }) };
  const context = vm.createContext({
    WPP: { chat: { openChatAt: async () => { attempts++; } } },
    document: { querySelector: () => ({ querySelectorAll: selector => selector === '[data-id]' && now >= 20000 ? [element] : [] }) },
    Date: { now: () => now }
  });
  view.executeJavaScript = async source => {
    if (source.includes('__centralCaptureMessage')) { now += 5000; return vm.runInContext(source, context); }
    if (source.includes('__centralCaptureInspect')) return {
      rect: { x: 200, y: 0, width: 800, height: 700 }, viewport: { width: 1000, height: 700 },
      top: 60, bottom: 560, messages: [{ id: element.getAttribute(), top: 70, bottom: 200, height: 130 }]
    };
    return original.call(view, source);
  };
  try {
    assert.equal(await captureWhatsAppConversation(view, directory, () => {}, {
      chatId: 'chat', messageIds: ['false_123456789@lid_ABC123']
    }), 1);
    assert.equal(attempts, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('aguarda o histórico sem clicar no aviso e captura mesmo com openChatAt pendente', async () => {
  let requests = 0;
  let clicks = 0;
  let now = 0;
  const element = { getAttribute: () => 'old-message', scrollIntoView() {}, getBoundingClientRect: () => ({ top: 70, height: 130 }) };
  const notice = {
    textContent: 'Clique neste aviso para carregar mensagens mais antigas do seu celular.',
    closest: () => null,
    getBoundingClientRect: () => ({ height: 30 }),
    click: () => { clicks++; }
  };
  const main = { contains: () => true, querySelectorAll: selector => selector === '[data-id]' ? (now >= 4000 ? [element] : []) : (requests ? [notice] : []) };
  const context = vm.createContext({
    WPP: { chat: { getActiveChat: () => ({ id: { _serialized: 'chat' } }), openChatAt: () => { requests++; return new Promise(() => {}); } } },
    document: { querySelector: () => main }, Date: { now: () => now }
  });
  const view = { executeJavaScript: async source => { now += 1000; return vm.runInContext(source, context); } };
  assert.equal((await positionConversationMessage(view, 'chat', 'old-message', 300)).ok, true);
  assert.equal(clicks, 0);
  assert.equal(requests, 1);
  assert.equal(context.__centralMessagePosition, undefined);
});

test('percorre cartões sem ID entre mensagens sem saltar para a próxima âncora', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-calls-'));
  const view = fakeWebContents();
  const original = view.executeJavaScript;
  const opened = [];
  let step = 0;
  view.executeJavaScript = async source => {
    if (source.includes('__centralCaptureMessage')) { opened.push(JSON.parse(source.match(/const messageId = (.*);/)[1])); return { ok: true }; }
    if (source.includes('__centralCapturePosition')) { step++; return { ok: true }; }
    if (source.includes('__centralCaptureInspect')) return {
      rect: { x: 200, y: 0, width: 800, height: 700 }, viewport: { width: 1000, height: 700 },
      top: 60, bottom: 560, scrollTop: step * 325, scrollHeight: 1800, clientHeight: 500,
      messages: step === 1 ? [] : [{ id: step === 0 ? 'm1' : 'm2', top: 70, bottom: 200, height: 130 }]
    };
    return original.call(view, source);
  };
  try {
    assert.equal(await captureWhatsAppConversation(view, directory, () => {}, { chatId: 'chat', messageIds: ['m1', 'm2'] }), 3);
    assert.deepEqual(opened, ['m1']);
    assert.equal(fs.readdirSync(directory).length, 3, 'inclui o print intermediário sem mensagens com ID');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('não clica em uma mensagem que copia o texto do aviso e permite cancelar a espera', async () => {
  let requests = 0;
  let cancelled = false;
  const message = {
    textContent: 'Clique neste aviso para carregar mensagens mais antigas do seu celular.',
    closest: () => ({}), getBoundingClientRect: () => ({ height: 30 }),
    click: () => assert.fail('Não deve clicar em texto enviado pelo contato')
  };
  const context = vm.createContext({
    WPP: { chat: { openChatAt: () => { requests++; return new Promise(() => {}); } } },
    document: { querySelector: () => ({ querySelectorAll: selector => selector === '[data-id]' ? [] : [message] }) }, Date
  });
  const view = { executeJavaScript: async source => vm.runInContext(source, context) };
  await assert.rejects(positionConversationMessage(view, 'chat', 'missing', 300,
    { isCancelled: () => cancelled }, () => { cancelled = true; }), error => error.code === 'backup_cancelled');
  assert.equal(requests, 1);
  assert.equal(context.__centralMessagePosition, undefined);
});

test('limita a espera de histórico indisponível sem acumular chamadas pendentes', async () => {
  let requests = 0;
  const context = vm.createContext({
    WPP: { chat: { openChatAt: () => { requests++; return new Promise(() => {}); } } },
    document: { querySelector: () => ({ querySelectorAll: () => [] }) }, Date
  });
  const view = { executeJavaScript: async source => vm.runInContext(source, context) };
  await assert.rejects(positionConversationMessage(view, 'chat', 'missing', 300, { messageLoadMaxMs: 500 }), /evitar prints incompletos/);
  assert.equal(requests, 1);
  assert.equal(context.__centralMessagePosition, undefined);
});

test('confere a chave simples do DOM contra o ID completo do histórico', async () => {
  const element = { getAttribute: () => 'ABC123', scrollIntoView() {}, getBoundingClientRect: () => ({ top: 70, height: 130 }) };
  const context = vm.createContext({
    WPP: { chat: { openChatAt: () => assert.fail('a mensagem já está na tela') } },
    document: { querySelector: () => ({ querySelectorAll: () => [element] }) }, Date
  });
  const view = { executeJavaScript: async source => vm.runInContext(source, context) };
  assert.equal((await positionConversationMessage(view, 'chat', 'false_123@lid_ABC123', 300)).ok, true);
});

test('não aceita uma chave simples que identifica dois registros diferentes', async () => {
  const ids = ['false_123@lid_SAME', 'true_123@lid_SAME'];
  const element = { getAttribute: () => 'SAME' };
  const context = vm.createContext({
    WPP: { chat: { openChatAt: async () => true } },
    document: { querySelector: () => ({ querySelectorAll: () => [element] }) }, Date
  });
  const view = { executeJavaScript: async source => vm.runInContext(source, context) };
  await assert.rejects(positionConversationMessage(view, 'chat', ids[0], 300, { messageIds: ids, messageLoadMaxMs: 500 }), error => {
    assert.equal(error.diagnostic.matchingKeyCount, 0);
    return /evitar prints incompletos/.test(error.message);
  });
});

test('confere os mesmos bytes em hexadecimal e base64url, incluindo sublinhado no ID', async () => {
  const hex = '00112233445566778899AABBCCDDEEFF';
  const encoded = Buffer.from(hex, 'hex').toString('base64url');
  assert.ok(encoded.includes('_'));
  for (const [historyKey, domKey] of [[hex, encoded], [encoded, hex]]) {
    let now = 0;
    const element = { getAttribute: () => domKey, scrollIntoView() {}, getBoundingClientRect: () => ({ top: 70, height: 130 }) };
    const context = vm.createContext({
      WPP: { chat: { openChatAt: () => assert.fail('a mensagem equivalente já está na tela') } },
      document: { querySelector: () => ({ querySelectorAll: () => [element] }) },
      Date: { now: () => now }, atob, btoa
    });
    const view = { executeJavaScript: async source => { now += 1000; return vm.runInContext(source, context); } };
    assert.equal((await positionConversationMessage(view, 'chat', `false_123@lid_${historyKey}`, 300)).ok, true);
  }
});

test('não confunde imagem com outra chave de mesmo tamanho e preserva a tela da falha', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-capture-failure-'));
  const id = 'false_123@lid_00112233445566778899AABBCCDDEEFF';
  let calls = 0;
  const context = vm.createContext({
    WPP: { chat: { openChatAt: async () => { calls++; } } },
    document: { querySelector: () => ({ querySelectorAll: () => [{ getAttribute: () => '11112233445566778899AABBCCDDEEFF' }] }) }, Date, atob, btoa
  });
  const view = {
    executeJavaScript: async source => vm.runInContext(source, context),
    capturePage: async () => ({ isEmpty: () => false, toPNG: () => Buffer.from('failure-image') })
  };
  try {
    await assert.rejects(captureWhatsAppConversation(view, path.join(directory, '01-prints'), () => {}, {
      chatId: 'chat', messageIds: [id], messageTypes: { [id]: 'image' }, messageLoadMaxMs: 500
    }), error => {
      assert.equal(error.diagnostic.matchingKeyCount, 0);
      assert.equal(error.diagnostic.recordType, 'image');
      assert.equal(fs.readFileSync(error.failureScreenshotPath, 'utf8'), 'failure-image');
      return /evitar prints incompletos/.test(error.message);
    });
    assert.equal(calls, 1);
    assert.equal(fs.readdirSync(path.join(directory, '01-prints')).length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
