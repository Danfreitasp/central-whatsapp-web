const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBrowserViewAttached,
  keepBrowserViewReady,
  refreshBrowserViewSurface,
  showBrowserView,
  withTemporarilyAttachedBrowserView,
  isolateActiveBrowserView
} = require('../src/browser-view-lifecycle');

function fixture() {
  const attached = [];
  const calls = [];
  const window = {
    getBrowserViews: () => [...attached],
    addBrowserView: (view) => { attached.push(view); calls.push('attach'); },
    removeBrowserView: (view) => { attached.splice(attached.indexOf(view), 1); calls.push('detach'); },
    setTopBrowserView: () => calls.push('top')
  };
  const view = {
    setBounds: (bounds) => calls.push({ bounds }),
    webContents: {
      isDestroyed: () => false,
      setBackgroundThrottling: (value) => calls.push(`throttle:${value}`),
      invalidate: () => calls.push('invalidate'),
      focus: () => calls.push('focus')
    }
  };
  return { attached, calls, view, window };
}

test('mantém a sessão anexada e com tamanho completo', () => {
  const { calls, view, window } = fixture();
  const bounds = { x: 252, y: 56, width: 1188, height: 844 };
  keepBrowserViewReady(window, view, bounds);
  assert.equal(isBrowserViewAttached(window, view), true);
  assert.deepEqual(calls, ['attach', { bounds }]);
});

test('troca para uma sessão já anexada sem recriar sua superfície', () => {
  const { calls, view, window } = fixture();
  keepBrowserViewReady(window, view, { x: 252, y: 56, width: 1188, height: 844 });
  calls.length = 0;
  const bounds = { x: 252, y: 56, width: 1188, height: 844 };
  showBrowserView(window, view, bounds);
  assert.deepEqual(calls, [{ bounds }, 'top', 'throttle:false', 'invalidate', 'focus']);
});

test('solicita um novo quadro sem recarregar a página', () => {
  const { calls, view } = fixture();
  assert.equal(refreshBrowserViewSurface(view), true);
  assert.deepEqual(calls, ['throttle:false', 'invalidate']);
});

test('mantém somente a sessão ativa anexada ao compositor', () => {
  const { attached, calls, view, window } = fixture();
  const otherCalls = [];
  const other = { setBounds: (bounds) => otherCalls.push(bounds) };
  const bounds = { x: 252, y: 56, width: 1188, height: 844 };
  isolateActiveBrowserView(window, [view, other], view, bounds);

  assert.deepEqual(attached, [view]);
  assert.deepEqual(calls, ['attach', { bounds }, 'top', 'throttle:false', 'invalidate', 'focus']);
  assert.deepEqual(otherCalls, []);
});

test('remove a sessão anterior antes de anexar a próxima', () => {
  const { attached, calls, view, window } = fixture();
  const previous = { setBounds: () => calls.push('previous-bounds') };
  attached.push(previous);

  isolateActiveBrowserView(window, [previous, view], view, { x: 252, y: 56, width: 1188, height: 844 });

  assert.deepEqual(attached, [view]);
  assert.deepEqual(calls, [
    'detach',
    'attach',
    { bounds: { x: 252, y: 56, width: 1188, height: 844 } },
    'top',
    'throttle:false',
    'invalidate',
    'focus'
  ]);
});

test('redimensiona somente sessões já anexadas sem reexibir uma sessão removida', () => {
  const { attached, calls, view, window } = fixture();
  const other = { setBounds: () => calls.push('other-bounds') };
  attached.push(view);

  isolateActiveBrowserView(
    window,
    [view, other],
    view,
    { x: 252, y: 56, width: 1188, height: 844 },
    { attach: false, focus: false }
  );

  assert.deepEqual(attached, [view]);
  assert.deepEqual(calls, [
    { bounds: { x: 252, y: 56, width: 1188, height: 844 } },
    'top',
    'throttle:false',
    'invalidate'
  ]);
});

test('anexa a sessão somente durante a captura e a remove mesmo quando há erro', async () => {
  const { attached, calls, view, window } = fixture();
  const bounds = { x: 252, y: 56, width: 1188, height: 844 };

  await assert.rejects(
    withTemporarilyAttachedBrowserView(window, view, bounds, async () => {
      assert.equal(attached.includes(view), true);
      throw new Error('falha simulada');
    }),
    /falha simulada/
  );

  assert.equal(attached.includes(view), false);
  assert.deepEqual(calls, ['attach', { bounds }, 'top', 'detach']);
});
