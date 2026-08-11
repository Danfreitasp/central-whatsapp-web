function createApplicationMenuTemplate(version, options = {}) {
  return [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Configurações',
      submenu: [
        {
          label: 'Iniciar junto com o Windows',
          type: 'checkbox',
          checked: Boolean(options.startupEnabled),
          enabled: options.startupAvailable !== false,
          click: (item) => options.onToggleStartup?.(Boolean(item.checked))
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `Central WhatsApp Web — versão ${String(version || '')}`,
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Verificar atualizações…',
          click: () => options.onCheckForUpdates?.()
        }
      ]
    }
  ];
}

module.exports = { createApplicationMenuTemplate };
