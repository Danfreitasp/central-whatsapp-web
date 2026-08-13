const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');
const { spriteCellForUnread, addUnreadBadge } = require('../src/notification-badge');

app.whenReady().then(() => {
  const assets = path.join(__dirname, '..', 'assets');
  const output = path.join(__dirname, '..', 'dist', 'icon-preview');
  fs.mkdirSync(output, { recursive: true });
  const icon = nativeImage.createFromPath(path.join(assets, 'icon.png'));
  const badge = nativeImage.createFromPath(path.join(assets, 'notification-badge.png'));
  const counts = nativeImage.createFromPath(path.join(assets, 'notification-counts.png'));
  assert.equal(icon.isEmpty(), false);
  assert.equal(badge.isEmpty(), false);
  assert.equal(counts.isEmpty(), false);

  const trayIcon = icon.resize({ width: 16, height: 16, quality: 'best' });
  const trayBadge = badge.resize({ width: 8, height: 8, quality: 'best' });
  const trayUnread = nativeImage.createFromBitmap(addUnreadBadge(
    trayIcon.toBitmap(), 16, 16, trayBadge.toBitmap(), 8, 8
  ), { width: 16, height: 16, scaleFactor: 1 });
  fs.writeFileSync(path.join(output, 'tray.png'), trayIcon.toPNG());
  fs.writeFileSync(path.join(output, 'tray-unread.png'), trayUnread.toPNG());

  for (const count of [1, 12, 120]) {
    const overlay = counts.crop(spriteCellForUnread(count)).resize({ width: 16, height: 16, quality: 'best' });
    assert.equal(overlay.isEmpty(), false);
    fs.writeFileSync(path.join(output, `overlay-${count}.png`), overlay.toPNG());
  }
  console.log(`prévia dos ícones gravada em ${output}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
