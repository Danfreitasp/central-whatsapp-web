// WebContentsView usa diretamente a árvore nativa de views. Evita o wrapper
// BrowserView, que no Electron 43 acumula listeners 'closed' em cada reanexo.
function getAttachedBrowserViews(window) {
  if (!window || window.isDestroyed?.()) return [];
  return window.contentView.children.filter(view => view.webContents !== window.webContents);
}

function attachBrowserView(window, view) {
  window.contentView.addChildView(view);
}

function detachBrowserView(window, view) {
  if (isBrowserViewAttached(window, view)) window.contentView.removeChildView(view);
}

function isBrowserViewAttached(window, view) {
  return Boolean(window && view && getAttachedBrowserViews(window).includes(view));
}

function ensureBrowserViewAttached(window, view) {
  if (!isBrowserViewAttached(window, view)) attachBrowserView(window, view);
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
  attachBrowserView(window, view);
  refreshBrowserViewSurface(view);
  if (view.webContents && !view.webContents.isDestroyed?.()) view.webContents.focus?.();
}

function rebindBrowserViewSurface(window, view, bounds, options = {}) {
  const webContents = view?.webContents;
  if (!window || !view || !webContents || webContents.isDestroyed?.()) return false;

  // Recria somente o vínculo com o compositor. O WebContents e sua partição
  // continuam os mesmos, preservando login, conversa aberta e texto digitado.
  detachBrowserView(window, view);
  attachBrowserView(window, view);
  view.setBounds({ ...bounds });
  attachBrowserView(window, view);
  refreshBrowserViewSurface(view);
  if (options.focus !== false) webContents.focus?.();
  return true;
}

function repaintBrowserViewSurface(view, getCurrentBounds) {
  const bounds = getCurrentBounds();
  if (!bounds || bounds.width < 2 || view.webContents.isDestroyed()) return;
  // Um novo tamanho força o compositor a produzir uma nova superfície. Usar
  // dois turnos evita que o Chromium coalesça as duas alterações de tamanho.
  view.setBounds({ ...bounds, width: bounds.width - 1 });
  setTimeout(() => {
    const currentBounds = getCurrentBounds();
    if (!currentBounds || view.webContents.isDestroyed()) return;
    view.setBounds({ ...currentBounds });
    view.webContents.invalidate?.();
  }, 32);
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
  if (!wasAttached) attachBrowserView(window, view);
  view.setBounds({ ...bounds });
  attachBrowserView(window, view);

  // capturePage depende de a superfície do BrowserView estar anexada e já ter
  // produzido ao menos um quadro. Sem isso o Chromium pode aguardar para sempre.
  const settleMs = Math.max(0, Number(options.settleMs) || 0);
  if (settleMs) await new Promise((resolve) => setTimeout(resolve, settleMs));

  try {
    return await operation();
  } finally {
    const shouldRemainAttached = typeof options.shouldRemainAttached === 'function'
      ? options.shouldRemainAttached()
      : Boolean(options.shouldRemainAttached);
    if (!wasAttached && !shouldRemainAttached) detachBrowserView(window, view);
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
      detachBrowserView(window, view);
      continue;
    }
    if (!isBrowserViewAttached(window, view)) {
      if (!attach) continue;
      attachBrowserView(window, view);
    }
    view.setBounds({ ...activeBounds });
  }

  if (!activeView || !isBrowserViewAttached(window, activeView)) return;
  attachBrowserView(window, activeView);
  refreshBrowserViewSurface(activeView);
  if (focus && activeView.webContents && !activeView.webContents.isDestroyed?.()) {
    activeView.webContents.focus?.();
  }
}

module.exports = {
  getAttachedBrowserViews,
  attachBrowserView,
  detachBrowserView,
  isBrowserViewAttached,
  keepBrowserViewReady,
  refreshBrowserViewSurface,
  rebindBrowserViewSurface,
  repaintBrowserViewSurface,
  showBrowserView,
  withTemporarilyAttachedBrowserView,
  isolateActiveBrowserView
};
