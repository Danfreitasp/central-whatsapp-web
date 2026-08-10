const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAppUpdater, isNoPublishedReleaseError } = require('../src/app-updater');

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function updaterFixture({ activeDispatches = false, responses = [] } = {}) {
  const autoUpdater = new EventEmitter();
  autoUpdater.checkForUpdates = async () => null;
  autoUpdater.downloadUpdate = async () => null;
  autoUpdater.quitAndInstall = () => {};
  const messages = [];
  const progress = [];
  const fixture = {
    activeDispatches,
    messages,
    progress,
    autoUpdater,
    controller: createAppUpdater({
      autoUpdater,
      app: { isPackaged: true },
      dialog: {
        showMessageBox: async (...args) => {
          messages.push(args.at(-1));
          return { response: responses.length ? responses.shift() : 0 };
        }
      },
      getWindow: () => ({ isDestroyed: () => false, setProgressBar: (value) => progress.push(value) }),
      hasActiveDispatches: () => fixture.activeDispatches,
      logger: { error: () => {} }
    })
  };
  return fixture;
}

test('aceita somente releases estáveis e não instala silenciosamente ao fechar', () => {
  const fixture = updaterFixture();
  assert.equal(fixture.autoUpdater.autoDownload, false);
  assert.equal(fixture.autoUpdater.autoInstallOnAppQuit, false);
  assert.equal(fixture.autoUpdater.allowPrerelease, false);
  assert.equal(fixture.autoUpdater.allowDowngrade, false);
});

test('baixa uma atualização somente depois da confirmação', async () => {
  const fixture = updaterFixture({ responses: [0] });
  let downloads = 0;
  fixture.autoUpdater.downloadUpdate = async () => { downloads += 1; };
  fixture.autoUpdater.emit('update-available', { version: '0.10.13' });
  await nextTurn();
  assert.equal(downloads, 1);
  assert.match(fixture.messages[0].message, /0\.10\.13/);
});

test('aguarda os disparos terminarem antes de oferecer a instalação', async () => {
  const fixture = updaterFixture({ activeDispatches: true, responses: [0, 0] });
  let installations = 0;
  fixture.autoUpdater.quitAndInstall = () => { installations += 1; };

  fixture.autoUpdater.emit('update-downloaded', { version: '0.10.13' });
  await nextTurn();
  assert.equal(installations, 0);
  assert.match(fixture.messages[0].detail, /disparos terminarem/i);

  fixture.activeDispatches = false;
  fixture.controller.notifyDispatchStateChanged();
  await nextTurn();
  assert.equal(installations, 1);
  assert.match(fixture.messages[1].title, /pronta para instalar/i);
});

test('não consulta o servidor durante o desenvolvimento', async () => {
  let checks = 0;
  const autoUpdater = new EventEmitter();
  autoUpdater.checkForUpdates = async () => { checks += 1; };
  const messages = [];
  const controller = createAppUpdater({
    autoUpdater,
    app: { isPackaged: false },
    dialog: { showMessageBox: async (options) => { messages.push(options); return { response: 0 }; } },
    getWindow: () => null,
    hasActiveDispatches: () => false,
    logger: { error: () => {} }
  });
  const result = await controller.checkForUpdates({ manual: true });
  assert.equal(result.reason, 'not-packaged');
  assert.equal(checks, 0);
  assert.equal(messages.length, 1);
});

test('reconhece a ausência de releases estáveis sem esconder outros erros', () => {
  assert.equal(isNoPublishedReleaseError(new Error('No published versions on GitHub')), true);
  assert.equal(isNoPublishedReleaseError(new Error('Unable to find latest version on GitHub')), true);
  assert.equal(isNoPublishedReleaseError(new Error('net::ERR_INTERNET_DISCONNECTED')), false);
});

test('informa que a versão é atual quando ainda não há release publicada', async () => {
  const fixture = updaterFixture();
  fixture.autoUpdater.checkForUpdates = async () => {
    const error = new Error('No published versions on GitHub');
    fixture.autoUpdater.emit('error', error);
    throw error;
  };

  const result = await fixture.controller.checkForUpdates({ manual: true });
  await nextTurn();
  assert.equal(result.noPublishedReleases, true);
  assert.equal(fixture.messages.length, 1);
  assert.match(fixture.messages[0].message, /versão mais recente/i);
  assert.match(fixture.messages[0].detail, /ainda não existe uma versão estável/i);
});
