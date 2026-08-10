const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATSAPP_RESTRICTION_PATTERN_SOURCE,
  classifyDispatchSessionFailure,
  createDispatchSessionError,
  isDispatchSessionError
} = require('../src/dispatch-session-error');

test('reconhece banimento e restrição da conta remetente', () => {
  assert.equal(classifyDispatchSessionFailure('This account can no longer use WhatsApp'), 'restricted');
  assert.equal(classifyDispatchSessionFailure('Esta conta não pode mais usar o WhatsApp'), 'restricted');
  assert.equal(classifyDispatchSessionFailure({ connectionState: 'TOS_BLOCK' }), 'restricted');
  assert.equal(classifyDispatchSessionFailure({ code: 403 }), 'restricted');
  assert.equal(classifyDispatchSessionFailure('Request failed with status code 403 (Forbidden)'), 'restricted');
  assert.equal(classifyDispatchSessionFailure('Sua conta está restringida nos dispositivos conectados. Não é possível iniciar novas conversas no momento.'), 'restricted');
});

test('o detector visual reconhece exatamente o aviso dos dispositivos conectados', () => {
  const detector = new RegExp(WHATSAPP_RESTRICTION_PATTERN_SOURCE, 'i');
  assert.equal(detector.test('Sua conta está restringida nos dispositivos conectados. Não é possível iniciar novas conversas no momento. Saiba mais'), true);
  assert.equal(detector.test('As mensagens e ligações são protegidas com a criptografia de ponta a ponta.'), false);
});

test('reconhece uma sessão que perdeu autenticação', () => {
  assert.equal(classifyDispatchSessionFailure({ authenticated: false }), 'disconnected');
  assert.equal(classifyDispatchSessionFailure({ connectionState: 'UNPAIRED' }), 'disconnected');
  assert.equal(classifyDispatchSessionFailure({ code: 'sender_unconfirmed' }), 'disconnected');
});

test('não confunde erro de destinatário com bloqueio do remetente', () => {
  assert.equal(classifyDispatchSessionFailure('Número inválido ou sem WhatsApp.'), '');
  assert.equal(classifyDispatchSessionFailure('O WhatsApp não conseguiu identificar este destinatário.'), '');
  assert.equal(classifyDispatchSessionFailure('No LID for user'), '');
});

test('gera erro operacional próprio para interromper o trabalhador', () => {
  const error = createDispatchSessionError({ restrictionVisible: true });
  assert.equal(isDispatchSessionError(error), true);
  assert.equal(error.kind, 'restricted');
  assert.match(error.message, /contatos restantes continuam pendentes/i);
});
