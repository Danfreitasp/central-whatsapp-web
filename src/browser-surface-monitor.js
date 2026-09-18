const { isLikelyBlankImage } = require('./browser-surface-health');

function withDeadline(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('surface-timeout')), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

// A captura pode terminar depois de uma troca de perfil, painel ou janela.
// Toda decisão valida novamente o alvo. Uma imagem vazia não comprova que o
// renderer morreu: reload automático poderia apagar um rascunho ou uma chamada.
function createBrowserSurfaceMonitor({ getTarget, isCurrent, recover,
  report = () => {}, timeoutMs = 4000 }) {
  const states = new WeakMap();
  const captures = new WeakMap();
  let checking = false;

  return async function check() {
    if (checking) return;
    const target = getTarget();
    if (!target || !isCurrent(target)) return;
    checking = true;
    const contents = target.view.webContents;
    let state = states.get(contents);
    if (!state) {
      state = { blanks: 0 };
      states.set(contents, state);
    }
    try {
      if (!target.attached) {
        state.blanks = 0;
        report('detached', target);
        recover(target);
        return;
      }
      // O timeout não cancela capturePage no Chromium. Não acumular capturas
      // pendentes a cada intervalo quando o compositor deixa de responder.
      if (captures.has(contents)) return;
      const capture = Promise.resolve().then(() => contents.capturePage());
      captures.set(contents, capture);
      capture.then(() => captures.delete(contents), () => captures.delete(contents));
      let image;
      try {
        image = await withDeadline(capture, timeoutMs);
      } catch {
        if (!isCurrent(target)) return;
        state.blanks = 0;
        report('capture-failed', target);
        recover(target);
        return; // Falha de captura sozinha nunca justifica recarregar a sessão.
      }
      if (!isCurrent(target)) return;
      if (!isLikelyBlankImage(image)) {
        if (state.blanks) report('healthy', target);
        state.blanks = 0;
        return;
      }
      state.blanks += 1;
      report('blank', target);
      recover(target);
      if (state.blanks === 3) report('persistent-blank', target);
    } catch {
      if (isCurrent(target)) report('recovery-failed', target);
    } finally {
      checking = false;
    }
  };
}

module.exports = { createBrowserSurfaceMonitor };
