const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getWppPhoneVariants,
  resolveWppDispatchRecipient,
  serializeWppWid
} = require('../src/dispatch-recipient');

test('serializa os formatos de identificador retornados pelo WhatsApp', () => {
  assert.equal(serializeWppWid('5511999999999@c.us'), '5511999999999@c.us');
  assert.equal(serializeWppWid({ _serialized: '123@lid' }), '123@lid');
  assert.equal(serializeWppWid({ user: '456', server: 'lid' }), '456@lid');
});

test('gera as duas formas do celular brasileiro exibido pelo WhatsApp', () => {
  assert.deepEqual(getWppPhoneVariants('5532988544521@c.us'), [
    '5532988544521',
    '553288544521'
  ]);
  assert.deepEqual(getWppPhoneVariants('553288544521@c.us'), [
    '553288544521',
    '5532988544521'
  ]);
});

test('prioriza o LID retornado pela consulta do número', async () => {
  const wpp = {
    contact: {
      queryWidExists: async () => ({
        wid: { _serialized: '5527999999999@c.us' },
        lid: { _serialized: '109999999999999@lid' }
      })
    }
  };

  assert.deepEqual(await resolveWppDispatchRecipient(wpp, '5527999999999'), {
    chatId: '109999999999999@lid',
    candidateChatIds: [
      '109999999999999@lid',
      '5527999999999@c.us',
      '552799999999@c.us'
    ],
    phoneId: '5527999999999@c.us',
    usedLid: true,
    resolution: 'query-lid'
  });
});

test('consulta a forma sem o nono dígito e usa o LID retornado por ela', async () => {
  const calls = [];
  const wpp = {
    contact: {
      queryWidExists: async (id) => {
        calls.push(id);
        if (id === '553288544521@c.us') {
          return {
            wid: { _serialized: '553288544521@c.us' },
            lid: { _serialized: '108854452100000@lid' }
          };
        }
        return { wid: { _serialized: id } };
      },
      getPnLidEntry: async (id) => ({ phoneNumber: { _serialized: id } }),
      list: async () => []
    },
    chat: { list: async () => [] }
  };

  const result = await resolveWppDispatchRecipient(wpp, '5532988544521');
  assert.deepEqual(calls, ['5532988544521@c.us', '553288544521@c.us']);
  assert.equal(result.chatId, '108854452100000@lid');
  assert.equal(result.usedLid, true);
});

test('busca o LID na tabela de correspondência quando a consulta não o inclui', async () => {
  const wpp = {
    contact: {
      queryWidExists: async () => ({ wid: { _serialized: '5527888888888@c.us' } }),
      getPnLidEntry: async () => ({ lid: { _serialized: '108888888888888@lid' } })
    }
  };

  const result = await resolveWppDispatchRecipient(wpp, '5527888888888');
  assert.equal(result.chatId, '108888888888888@lid');
  assert.equal(result.usedLid, true);
});

test('mantém o telefone corrigido quando a sessão ainda não usa LID', async () => {
  const wpp = {
    contact: {
      queryWidExists: async () => ({ wid: { _serialized: '5527777777777@c.us' } }),
      getPnLidEntry: async () => ({ phoneNumber: { _serialized: '5527777777777@c.us' } })
    }
  };

  const result = await resolveWppDispatchRecipient(wpp, '5527777777777');
  assert.equal(result.chatId, '5527777777777@c.us');
  assert.equal(result.usedLid, false);
});

test('encontra pelo telefone uma conversa LID já carregada na sessão', async () => {
  const wpp = {
    contact: {
      queryWidExists: async () => ({ wid: { _serialized: '5527555555555@c.us' } }),
      getPnLidEntry: async () => ({ phoneNumber: { _serialized: '5527555555555@c.us' } }),
      list: async () => [{
        id: { _serialized: '105555555555555@lid' },
        pnForLid: { _serialized: '5527555555555@c.us' },
        name: 'Cliente conhecido'
      }]
    },
    chat: { list: async () => [] }
  };

  const result = await resolveWppDispatchRecipient(wpp, '5527555555555', 'Cliente conhecido');
  assert.equal(result.chatId, '105555555555555@lid');
  assert.equal(result.resolution, 'known-phone');
});

test('encaminha para a busca visual quando a consulta não reconhece o destinatário', async () => {
  const wpp = { contact: { queryWidExists: async () => null } };
  const result = await resolveWppDispatchRecipient(wpp, '5527666666666');
  assert.equal(result.resolution, 'ui-search-needed');
  assert.deepEqual(result.candidateChatIds, ['5527666666666@c.us']);
});
