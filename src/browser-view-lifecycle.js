function isBrowserViewAttached(window, view) {
  return Boolean(window && view && window.getBrowserViews().includes(view));
}

function ensureBrowserViewAttached(window, view) {
  if (!isBrowserViewAttached(window, view)) window.addBrowserView(view);
}

function keepBrowserViewReady(window, view, bounds) {
  ensureBrowserViewAttached(window, view);
  view.setBounds({ ...bounds });
}

function refreshBrowserViewSurface(view) {
  const webContents = view?.webContents;
  if (!webContents || webContents.isDestroyed?.()) return false;
  webContents.setBackgroundThrottling?.(false);
  // Solicita um novo quadro sem navegar ou perder o estado da conversa.
  // É especialmente importante ao trazer de volta uma BrowserView estacionada.
  webContents.invalidate?.();
  return true;
}

function showBrowserView(window, view, bounds) {
  ensureBrowserViewAttached(window, view);
  view.setBounds({ ...bounds });
  if (typeof window.setTopBrowserView === 'function') window.setTopBrowserView(view);
  refreshBrowserViewSurface(view);
  if (view.webContents && !view.webContents.isDestroyed?.()) view.webContents.focus?.();
}

async function withTemporarilyAttachedBrowserView(window, view, bounds, operation, options = {}) {
  if (!window || !view || typeof operation !== 'function') {
    throw new Error('Não foi possível preparar a tela do WhatsApp para a captura.');
  }
  const wasAttached = isBrowserViewAttached(window, view);
  const wasAlwaysOnTop = Boolean(window.isAlwaysOnTop?.());
  window.show?.();
  if (!wasAlwaysOnTop) window.setAlwaysOnTop?.(true);
  window.moveTop?.();
  window.focus?.();
  if (!wasAttached) window.addBrowserView(view);
  view.setBounds({ ...bounds });
  if (typeof window.setTopBrowserView === 'function') window.setTopBrowserView(view);

  // capturePage depende de a superfície do BrowserView estar anexada e já ter
  // produzido ao menos um quadro. Sem isso o Chromium pode aguardar para sempre.
  const settleMs = Math.max(0, Number(options.settleMs) || 0);
  if (settleMs) await new Promise((resolve) => setTimeout(resolve, settleMs));

  try {
    return await operation();
  } finally {
    if (!wasAttached && isBrowserViewAttached(window, view)) window.removeBrowserView(view);
    if (!wasAlwaysOnTop) window.setAlwaysOnTop?.(false);
  }
}

function isolateActiveBrowserView(window, browserViews, activeView, activeBounds, options = {}) {
  if (!window) return;
  const attach = options.attach !== false;
  const focus = options.focus !== false;

  for (const view of browserViews || []) {
    if (!view) continue;
    if (view !== activeView) {
      if (isBrowserViewAttached(window, view)) window.removeBrowserView(view);
      continue;
    }
    if (!isBrowserViewAttached(window, view)) {
      if (!attach) continue;
      window.addBrowserView(view);
    }
    view.setBounds({ ...activeBounds });
  }

  if (!activeView || !isBrowserViewAttached(window, activeView)) return;
  if (typeof window.setTopBrowserView === 'function') window.setTopBrowserView(activeView);
  refreshBrowserViewSurface(activeView);
  if (focus && activeView.webContents && !activeView.webContents.isDestroyed?.()) {
    activeView.webContents.focus?.();
  }
}

module.exports = {
  isBrowserViewAttached,
  keepBrowserViewReady,
  refreshBrowserViewSurface,
  showBrowserView,
  withTemporarilyAttachedBrowserView,
  isolateActiveBrowserView
};
