const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GlobalSearchIndex, normalizedMessageBody, sourceChanged } = require('../src/global-search-index');
const { normalizeGlobalSearchQuery } = require('../src/global-search');

function withIndex(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-global-search-'));
  const index = new GlobalSearchIndex(path.join(directory, 'search.db'));
  try { run(index); } finally {
    index.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('normaliza texto e dígitos para o índice local', () => {
  assert.equal(normalizedMessageBody('Proposta aprovada para (27) 99999-1234'), 'proposta aprovada para (27) 99999-1234 27999991234');
});

test('detecta somente conversas novas ou alteradas', () => {
  assert.equal(sourceChanged(null, { sourceTimestamp: 10 }), true);
  assert.equal(sourceChanged({ complete: false, sourceTimestamp: 10, sourceMessageId: 'a' }, { sourceTimestamp: 10, sourceMessageId: 'a' }), true);
  assert.equal(sourceChanged({ complete: true, sourceTimestamp: 10, sourceMessageId: 'a' }, { sourceTimestamp: 10, sourceMessageId: 'a' }), false);
  assert.equal(sourceChanged({ complete: true, sourceTimestamp: 10, sourceMessageId: 'a' }, { sourceTimestamp: 11, sourceMessageId: 'b' }), true);
});

test('pesquisa mensagens, nomes e telefones no índice persistente', () => withIndex((index) => {
  const chat = {
    chatId: '5527999991234@c.us',
    chatName: 'João da Silva',
    phone: '5527999991234',
    sourceTimestamp: 30,
    sourceMessageId: 'm3'
  };
  index.replaceChatMessages('azul', chat, [
    { messageId: 'm1', body: 'A proposta ainda está em análise', timestamp: 10 },
    { messageId: 'm2', body: 'Sua proposta foi aprovada', timestamp: 20 }
  ]);
  index.finishProfile('azul', { chatCount: 1, complete: true });

  assert.equal(index.search(normalizeGlobalSearchQuery('proposta foi aprovada'), ['azul'])[0].messageId, 'm2');
  assert.equal(index.search(normalizeGlobalSearchQuery('proposta'), ['azul'])[0].messageId, 'm2');
  assert.equal(index.search(normalizeGlobalSearchQuery('joao'), ['azul'])[0].matchType, 'contact');
  assert.equal(index.search(normalizeGlobalSearchQuery('99991234'), ['azul'])[0].chatId, chat.chatId);
  assert.equal(index.search(normalizeGlobalSearchQuery('joao'), []).length, 0);
  assert.equal(index.profileStatus(['azul']).messageCount, 2);
  assert.equal(index.profileStatus([]).messageCount, 0);
}));

test('substitui mensagens alteradas, remove conversas antigas e apaga o índice', () => withIndex((index) => {
  const first = { chatId: '1@c.us', chatName: 'Primeira', sourceTimestamp: 10, sourceMessageId: 'a' };
  const second = { chatId: '2@c.us', chatName: 'Segunda', sourceTimestamp: 20, sourceMessageId: 'b' };
  index.replaceChatMessages('verde', first, [{ messageId: 'a', body: 'texto antigo', timestamp: 10 }]);
  index.replaceChatMessages('verde', second, [{ messageId: 'b', body: 'manter esta mensagem', timestamp: 20 }]);
  index.appendChatMessages('verde', { ...first, sourceTimestamp: 11, sourceMessageId: 'a2' }, [{ messageId: 'a2', body: 'mensagem incremental', timestamp: 11 }]);
  assert.equal(index.search(normalizeGlobalSearchQuery('incremental'), ['verde'])[0].messageId, 'a2');
  index.replaceChatMessages('verde', { ...first, sourceTimestamp: 30, sourceMessageId: 'c' }, [{ messageId: 'c', body: 'texto atualizado', timestamp: 30 }]);

  assert.equal(index.search(normalizeGlobalSearchQuery('texto antigo'), ['verde']).length, 0);
  assert.equal(index.pruneProfileChats('verde', [first.chatId]), 1);
  assert.equal(index.search(normalizeGlobalSearchQuery('manter'), ['verde']).length, 0);
  index.clear('verde');
  assert.equal(index.profileStatus(['verde']).messageCount, 0);
}));
