function createApplicationMenuTemplate(version, options = {}) {
  return [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
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
