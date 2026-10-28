const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOwnPhoneWid,
  readOwnPhoneFromWpp,
  createOwnPhoneRuntimeSource
} = require('../src/whatsapp-own-phone');

test('extrai o telefone de um wid PN e descarta identificadores LID', () => {
  assert.equal(normalizeOwnPhoneWid({ user: '5527999991111', server: 'c.us' }), '5527999991111');
  assert.equal(normalizeOwnPhoneWid('5527999991111@c.us'), '5527999991111');
  assert.equal(normalizeOwnPhoneWid({ user: '108854452100000', server: 'lid' }), '');
  assert.equal(normalizeOwnPhoneWid('108854452100000@lid'), '');
  assert.equal(normalizeOwnPhoneWid(null), '');
});

test('tenta as fontes de número do próprio usuário até encontrar um PN', () => {
  const wpp = {
    whatsapp: {
      UserPrefs: {
        getMaybeMePnUser: () => { throw new Error('indisponível'); },
        getMaybeMeUser: () => ({ user: '5527999991111', server: 'c.us' })
      }
    },
    conn: {
      getMyUserWid: () => ({ user: '108854452100000', server: 'lid' })
    }
  };
  assert.equal(readOwnPhoneFromWpp(wpp), '5527999991111');
  assert.equal(readOwnPhoneFromWpp(null), '');
});

test('o código injetado no WhatsApp lê o número da sessão autenticada', () => {
  const source = createOwnPhoneRuntimeSource();
  const run = new Function('globalThis', `return ${source};`);
  const phone = run({
    WPP: {
      whatsapp: {
        UserPrefs: {
          getMaybeMePnUser: () => ({ user: '5527988882222', server: 'c.us' })
        }
      },
      conn: { getMyUserWid: () => null }
    }
  });
  assert.equal(phone, '5527988882222');
});
