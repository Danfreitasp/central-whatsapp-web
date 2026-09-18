const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GlobalSearchIndex } = require('../src/global-search-index');
const { normalizeGlobalSearchQuery } = require('../src/global-search');

app.whenReady().then(() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-global-search-electron-'));
  const databasePath = path.join(directory, 'search.db');
  let index = new GlobalSearchIndex(databasePath);
  try {
    assert.equal(index.ftsAvailable, true);
    index.replaceChatMessages('comercial', {
      chatId: '5527999991234@c.us', chatName: 'João', phone: '5527999991234',
      sourceTimestamp: 20, sourceMessageId: 'm1'
    }, [{ messageId: 'm1', body: 'Sua proposta foi aprovada hoje', timestamp: 20 }]);
    const result = index.search(normalizeGlobalSearchQuery('proposta foi aprovada'), ['comercial']);
    assert.equal(result[0].messageId, 'm1');
    index.close();
    index = new GlobalSearchIndex(databasePath);
    assert.equal(index.search(normalizeGlobalSearchQuery('aprovada hoje'), ['comercial'])[0].messageId, 'm1');
    console.log('índice FTS5 de pesquisa disponível e consultável no Electron');
  } finally {
    index.close();
    fs.rmSync(directory, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
