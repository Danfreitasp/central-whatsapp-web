const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isNoPublishedReleaseError(error) {
  const message = String(error?.message || error || '');
  return /no published (?:versions?|releases?) on github/i.test(message)
    || /unable to find latest version on github/i.test(message);
}

function createAppUpdater({ autoUpdater, app, dialog, getWindow, hasActiveDispatches, logger = console }) {
  let startupTimer = null;
  let periodicTimer = null;
  let manualCheck = false;
  let downloadRequested = false;
  let downloadedUpdate = null;
  let waitingForDispatches = false;
  let installPromptOpen = false;
  let noPublishedNoticeHandled = false;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  function currentWindow() {
    const target = getWindow?.();
    return target && !target.isDestroyed?.() ? target : null;
  }

  function showMessage(options) {
    const target = currentWindow();
    return target ? dialog.showMessageBox(target, options) : dialog.showMessageBox(options);
  }

  function setProgress(value) {
    const target = currentWindow();
    if (target?.setProgressBar) target.setProgressBar(value);
  }

  function showAlreadyUpToDate() {
    return showMessage({
      type: 'info',
      title: 'Central WhatsApp Web',
      message: 'Você já está usando a versão mais recente.',
      detail: 'Ainda não existe uma versão estável mais nova publicada.',
      buttons: ['OK']
    });
  }

  async function promptInstall() {
    if (!downloadedUpdate || installPromptOpen) return;
    if (hasActiveDispatches?.()) {
      if (!waitingForDispatches) {
        waitingForDispatches = true;
        await showMessage({
          type: 'info',
          title: 'Atualização pronta',
          message: `A versão ${downloadedUpdate.version} já foi baixada.`,
          detail: 'A instalação será oferecida assim que todos os disparos terminarem.',
          buttons: ['Entendi'],
          defaultId: 0
        });
      }
      return;
    }

    waitingForDispatches = false;
    installPromptOpen = true;
    try {
      const result = await showMessage({
        type: 'info',
        title: 'Atualização pronta para instalar',
        message: `A versão ${downloadedUpdate.version} foi baixada e está pronta.`,
        detail: 'O aplicativo será fechado, atualizado e aberto novamente. Perfis, sessões e dados serão preservados.',
        buttons: ['Reiniciar e instalar', 'Instalar depois'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (result.response === 0) autoUpdater.quitAndInstall(false, true);
    } finally {
      installPromptOpen = false;
    }
  }

  autoUpdater.on('update-available', async (info) => {
    manualCheck = false;
    const result = await showMessage({
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${info.version} está disponível.`,
      detail: 'Esta versão já foi publicada como estável. Deseja baixá-la agora?',
      buttons: ['Baixar atualização', 'Agora não'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (result.response !== 0) return;
    downloadRequested = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const shouldNotify = downloadRequested;
      downloadRequested = false;
      setProgress(-1);
      logger.error('[Central WhatsApp] Falha ao baixar atualização:', error);
      if (shouldNotify) {
        await showMessage({
          type: 'error',
          title: 'Não foi possível baixar a atualização',
          message: error?.message || String(error),
          buttons: ['Fechar']
        });
      }
    }
  });

  autoUpdater.on('update-not-available', async () => {
    if (!manualCheck) return;
    manualCheck = false;
    await showAlreadyUpToDate();
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    setProgress(percent / 100);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    downloadRequested = false;
    downloadedUpdate = info;
    setProgress(-1);
    await promptInstall();
  });

  autoUpdater.on('error', async (error) => {
    if (isNoPublishedReleaseError(error)) {
      const shouldNotify = manualCheck;
      manualCheck = false;
      downloadRequested = false;
      noPublishedNoticeHandled = shouldNotify;
      logger.info?.('[Central WhatsApp] Ainda não há uma release estável publicada.');
      if (shouldNotify) await showAlreadyUpToDate();
      return;
    }
    const wasDownloading = downloadRequested;
    const shouldNotify = manualCheck || wasDownloading;
    manualCheck = false;
    downloadRequested = false;
    setProgress(-1);
    logger.error('[Central WhatsApp] Erro no atualizador:', error);
    if (!shouldNotify) return;
    await showMessage({
      type: 'error',
      title: wasDownloading ? 'Não foi possível baixar a atualização' : 'Não foi possível verificar atualizações',
      message: error?.message || String(error),
      buttons: ['Fechar']
    });
  });

  async function checkForUpdates({ manual = false } = {}) {
    if (!app.isPackaged) {
      if (manual) {
        await showMessage({
          type: 'info',
          title: 'Atualizações',
          message: 'A verificação de atualizações funciona na versão instalada do aplicativo.',
          buttons: ['OK']
        });
      }
      return { ok: false, reason: 'not-packaged' };
    }
    if (downloadedUpdate) {
      await promptInstall();
      return { ok: true, downloaded: true };
    }
    manualCheck = Boolean(manual);
    noPublishedNoticeHandled = false;
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      if (isNoPublishedReleaseError(error)) {
        const shouldNotify = manualCheck && !noPublishedNoticeHandled;
        manualCheck = false;
        noPublishedNoticeHandled = false;
        logger.info?.('[Central WhatsApp] Ainda não há uma release estável publicada.');
        if (shouldNotify) await showAlreadyUpToDate();
        return { ok: true, noPublishedReleases: true };
      }
      const shouldNotify = manualCheck;
      manualCheck = false;
      logger.error('[Central WhatsApp] Falha ao consultar atualizações:', error);
      if (shouldNotify) {
        await showMessage({
          type: 'error',
          title: 'Não foi possível verificar atualizações',
          message: error?.message || String(error),
          buttons: ['Fechar']
        });
      }
      return { ok: false, reason: 'check-failed' };
    }
  }

  function start() {
    if (!app.isPackaged) return;
    startupTimer = setTimeout(() => checkForUpdates(), STARTUP_CHECK_DELAY_MS);
    periodicTimer = setInterval(() => checkForUpdates(), PERIODIC_CHECK_INTERVAL_MS);
    startupTimer.unref?.();
    periodicTimer.unref?.();
  }

  function stop() {
    if (startupTimer) clearTimeout(startupTimer);
    if (periodicTimer) clearInterval(periodicTimer);
    startupTimer = null;
    periodicTimer = null;
  }

  function notifyDispatchStateChanged() {
    if (waitingForDispatches && !hasActiveDispatches?.()) void promptInstall();
  }

  return { start, stop, checkForUpdates, notifyDispatchStateChanged };
}

module.exports = {
  STARTUP_CHECK_DELAY_MS,
  PERIODIC_CHECK_INTERVAL_MS,
  isNoPublishedReleaseError,
  createAppUpdater
};
