const { app, shell } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNotificationShortcutDetails } = require('../src/notification-routing');

const APP_ID = 'com.codex.centralwhatsappweb';
const CLSID = '{7C52F4A5-C1B8-4A32-A901-3B3BFFDC5D30}';

app.whenReady().then(() => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-notification-shortcut-'));
  const shortcutPath = path.join(tempDirectory, 'Central WhatsApp Web.lnk');
  try {
    assert.equal(shell.writeShortcutLink(shortcutPath, 'create', createNotificationShortcutDetails(process.execPath, APP_ID, CLSID)), true);
    const details = shell.readShortcutLink(shortcutPath);
    assert.equal(details.appUserModelId, APP_ID);
    assert.equal(details.toastActivatorClsid.toUpperCase(), CLSID.toUpperCase());
    console.log('atalho do Windows gravado com AppUserModelId e ToastActivatorCLSID');
  } finally {
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);
    fs.rmdirSync(tempDirectory);
    app.quit();
  }
});
