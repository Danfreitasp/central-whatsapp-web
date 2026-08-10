const test = require('node:test');
const assert = require('node:assert/strict');
const { isWhatsAppSendConfirmed } = require('../src/dispatch-delivery-confirmation');

test('só aceita mensagem confirmada pelo servidor do WhatsApp', () => {
  assert.equal(isWhatsAppSendConfirmed({ ack: 1 }), true);
  assert.equal(isWhatsAppSendConfirmed({ ack: 2 }), true);
  assert.equal(isWhatsAppSendConfirmed({ ack: 0 }), false);
  assert.equal(isWhatsAppSendConfirmed({ ack: -1 }), false);
  assert.equal(isWhatsAppSendConfirmed({}), false);
});
