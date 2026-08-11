function syncWindowsStartup(app, enabled, options = {}) {
  const platform = options.platform || process.platform;
  const packaged = options.packaged ?? app?.isPackaged;
  if (platform !== 'win32' || !packaged || typeof app?.setLoginItemSettings !== 'function') return false;

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: Boolean(enabled),
    path: process.execPath,
    args: enabled ? ['--hidden'] : []
  });
  return true;
}

function createTrayMenuTemplate(options = {}) {
  return [
    {
      label: 'Abrir Central WhatsApp Web',
      click: () => options.onShow?.()
    },
    { type: 'separator' },
    {
      label: 'Iniciar junto com o Windows',
      type: 'checkbox',
      checked: Boolean(options.startupEnabled),
      enabled: options.startupAvailable !== false,
      click: (item) => options.onToggleStartup?.(Boolean(item.checked))
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => options.onQuit?.()
    }
  ];
}

module.exports = { syncWindowsStartup, createTrayMenuTemplate };
