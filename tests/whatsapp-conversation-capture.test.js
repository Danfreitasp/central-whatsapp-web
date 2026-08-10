const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { captureWhatsAppConversation } = require('../src/whatsapp-conversation-capture');

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
