const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWhatsAppConversationHistory } = require('../src/whatsapp-conversation-capture');
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'central-history-smoke-'));
app.setPath('userData', directory);
const deadline = setTimeout(() => app.exit(1), 30000);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 700 });
  try {
    await window.loadURL('data:text/html,' + encodeURIComponent('<style>#main{height:600px}.scroll{height:500px;overflow-y:auto}.message{height:140px}</style><main id="main"><div class="scroll"></div></main>'));
    await window.webContents.executeJavaScript(`(() => {
      let first = 3, pending = false;
      globalThis.historyLoads = 0;
      const scroller = document.querySelector('.scroll');
      const render = () => {
        scroller.innerHTML = (pending ? '<div role="progressbar">Carregando mensagens</div>' : '') +
          Array.from({length: 7-first}, (_, index) => '<div class="message" data-id="KEY'+(first+index)+'">Mensagem '+(first+index)+'</div>').join('');
      };
      render();
      scroller.addEventListener('scroll', () => {
        if (pending || first === 1 || scroller.scrollTop > 1) return;
        pending = true; render();
        setTimeout(() => { first--; pending = false; globalThis.historyLoads++; render(); }, 1800);
      });
      globalThis.WPP = {chat: {
        getActiveChat: () => ({id: {_serialized: 'chat'}}),
        openChatAt: async () => true,
        getMessages: async () => Array.from({length: 7-first}, (_, index) => ({
          id: 'false_123@lid_KEY'+(first+index), type: 'chat', timestampMs: first+index, sequence: index
        }))
      }};
    })()`);
    const read = () => window.webContents.executeJavaScript('(async () => ({ok:true,chat:{id:"chat"},messages:await WPP.chat.getMessages()}))()');
    const initial = await read();
    assert.equal(initial.messages.length, 4);
    const result = await loadWhatsAppConversationHistory(window.webContents, initial, read, () => {}, {
      historyStableRounds: 2, historyEdgeWaitMs: 6000, historyEdgeStableMs: 500
    });
    assert.equal(result.conversation.messages.length, 6);
    assert.equal(result.conversation.messages[0].id, 'false_123@lid_KEY1');
    assert.equal(await window.webContents.executeJavaScript('globalThis.historyLoads'), 2);
    assert.ok(result.rounds >= 3);
    console.log('Histórico carregado em dois lotes atrasados; spinner aguardado; 4 registros iniciais -> 6 registros finais');
  } finally {
    clearTimeout(deadline);
    window.destroy();
    // O perfil temporário continua bloqueado até o processo Electron sair.
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
