function parseWebUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isInternalNavigation(value, internalOrigin) {
  const url = parseWebUrl(value);
  if (!url) return false;
  try {
    return url.origin === new URL(internalOrigin).origin;
  } catch {
    return false;
  }
}

function openWebUrlExternally(value, openExternal, onError = () => {}) {
  const url = parseWebUrl(value);
  if (!url || typeof openExternal !== 'function') return false;
  try {
    Promise.resolve(openExternal(url.href)).catch(onError);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

function configureExternalNavigation(webContents, options) {
  const { internalOrigin, openExternal, onError } = options;
  const open = (url) => openWebUrlExternally(url, openExternal, onError);

  webContents.setWindowOpenHandler(({ url }) => {
    open(url);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isInternalNavigation(url, internalOrigin)) return;
    event.preventDefault();
    open(url);
  });
}

module.exports = {
  parseWebUrl,
  isInternalNavigation,
  openWebUrlExternally,
  configureExternalNavigation
};
