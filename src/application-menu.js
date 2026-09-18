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
        },
        {
          label: 'Compatibilidade gráfica (após reiniciar)',
          type: 'checkbox',
          checked: Boolean(options.graphicsCompatibilityMode),
          click: (item) => options.onToggleGraphicsCompatibility?.(Boolean(item.checked))
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
        },
        { type: 'separator' },
        {
          label: 'Recuperar tela do WhatsApp',
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => options.onRecoverSurface?.()
        },
        {
          label: 'Abrir diagnóstico de tela',
          click: () => options.onOpenDiagnostics?.()
        }
      ]
    }
  ];
}

module.exports = { createApplicationMenuTemplate };
