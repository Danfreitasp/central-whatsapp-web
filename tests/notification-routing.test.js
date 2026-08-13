const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notificationLaunchArgument,
  profileIdFromNotificationActivation,
  notificationTargetFromActivation,
  resolveNotificationProfileId,
  profileIdFromActivatedViews,
  createProfileNotificationToast,
  createNotificationShortcutDetails
} = require('../src/notification-routing');

test('grava e recupera o perfil nos argumentos da notificação', () => {
  const argument = notificationLaunchArgument('perfil vermelho/1', '5511999999999@c.us');
  assert.equal(profileIdFromNotificationActivation(argument), 'perfil vermelho/1');
  assert.deepEqual(notificationTargetFromActivation(argument), {
    profileId: 'perfil vermelho/1',
    chatId: '5511999999999@c.us'
  });
  assert.equal(profileIdFromNotificationActivation('argumento-do-whatsapp'), '');
});

test('não adivinha outro perfil quando a ativação não informa a origem', () => {
  assert.equal(resolveNotificationProfileId('argumento-do-whatsapp', ['vermelho', 'azul']), '');
  assert.equal(resolveNotificationProfileId('central-whatsapp-profile=azul', ['vermelho', 'azul']), 'azul');
  assert.equal(resolveNotificationProfileId('', ['unico']), 'unico');
});

test('sincroniza apenas quando outra sessão recebeu foco ou foi movida ao topo', () => {
  assert.equal(profileIdFromActivatedViews([
    { id: 'azul', focused: true, top: true },
    { id: 'verde', focused: false, top: false }
  ], 'azul'), '');
  assert.equal(profileIdFromActivatedViews([
    { id: 'azul', focused: false, top: true },
    { id: 'verde', focused: true, top: false }
  ], 'azul'), 'verde');
  assert.equal(profileIdFromActivatedViews([
    { id: 'azul', focused: false, top: false },
    { id: 'verde', focused: false, top: true }
  ], 'azul'), 'verde');
});

test('gera toast do Windows com perfil, conversa e texto XML seguro', () => {
  const xml = createProfileNotificationToast(
    { id: 'vermelho', name: 'Pessoal & Empresa' },
    2,
    { id: '5511999999999@c.us', name: 'Cliente <Teste>' }
  );
  assert.match(xml, /launch="central-whatsapp-profile=vermelho&amp;chat=5511999999999%40c.us"/);
  assert.match(xml, /Pessoal &amp; Empresa/);
  assert.match(xml, /Cliente &lt;Teste&gt;/);
});

test('configura o atalho com AppUserModelId e ToastActivatorCLSID correspondentes', () => {
  const details = createNotificationShortcutDetails('C:\\Programa\\Central.exe', 'com.codex.central', '{11111111-1111-1111-1111-111111111111}');
  assert.equal(details.target, 'C:\\Programa\\Central.exe');
  assert.equal(details.appUserModelId, 'com.codex.central');
  assert.equal(details.toastActivatorClsid, '{11111111-1111-1111-1111-111111111111}');
});
