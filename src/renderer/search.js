(() => {
  const button = document.querySelector('#global-search-button');
  const dialog = document.querySelector('#global-search-dialog');
  const form = document.querySelector('#global-search-form');
  const queryInput = document.querySelector('#global-search-query');
  const submit = document.querySelector('#global-search-submit');
  const close = document.querySelector('#global-search-close');
  const cancel = document.querySelector('#global-search-cancel');
  const status = document.querySelector('#global-search-status');
  const results = document.querySelector('#global-search-results');
  const indexStatus = document.querySelector('#global-search-index-status');
  const rebuild = document.querySelector('#global-search-rebuild');
  const clearIndex = document.querySelector('#global-search-clear-index');
  const modeInputs = [...document.querySelectorAll('input[name="global-search-mode"]')];
  let running = false;

  const setRunning = (value) => {
    running = value;
    submit.disabled = value;
    queryInput.disabled = value;
    cancel.hidden = !value;
    close.disabled = value;
    rebuild.disabled = value;
    clearIndex.disabled = value;
    for (const input of modeInputs) input.disabled = value;
  };

  const selectedMode = () => modeInputs.find((input) => input.checked)?.value || 'quick';

  const showEmpty = (message) => {
    results.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'global-search-empty';
    empty.textContent = message;
    results.append(empty);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  const renderIndexStatus = (value) => {
    const indexedProfiles = Number(value?.indexedProfiles) || 0;
    const profileCount = Number(value?.profileCount) || 0;
    const messages = Number(value?.messageCount) || 0;
    if (!messages) {
      indexStatus.textContent = 'Índice completo ainda não criado.';
      clearIndex.hidden = true;
      return;
    }
    const updatedAt = value.lastIndexedAt ? new Date(value.lastIndexedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const partial = indexedProfiles < profileCount ? ' · índice parcial' : '';
    indexStatus.textContent = `${messages.toLocaleString('pt-BR')} mensagem(ns) indexada(s) em ${indexedProfiles} de ${profileCount} número(s)${partial}${updatedAt ? ` · atualizado ${updatedAt}` : ''}.`;
    clearIndex.hidden = false;
  };

  const refreshIndexStatus = async () => {
    try { renderIndexStatus(await window.centralWhatsApp.getGlobalSearchIndexStatus()); } catch {}
  };

  const renderResults = (payload) => {
    results.replaceChildren();
    if (payload.failures?.length) {
      const warning = document.createElement('p');
      warning.className = 'global-search-warning';
      warning.textContent = `${payload.failures.length} número(s) não puderam ser pesquisados agora: ${payload.failures.map((item) => item.profileName).join(', ')}.`;
      results.append(warning);
    }
    if (payload.phoneOnlyProfiles?.length) {
      const warning = document.createElement('p');
      warning.className = 'global-search-warning';
      warning.textContent = `Em ${payload.phoneOnlyProfiles.map((item) => item.profileName).join(', ')}, o WhatsApp permitiu pesquisar apenas nomes e telefones.`;
      results.append(warning);
    }
    if (!payload.results?.length) {
      const empty = document.createElement('div');
      empty.className = 'global-search-empty';
      empty.textContent = 'Nenhuma conversa encontrada.';
      results.append(empty);
      return;
    }
    for (const item of payload.results) {
      const result = document.createElement('button');
      result.type = 'button';
      result.className = 'global-search-result';
      const color = document.createElement('i');
      color.style.background = item.profileColor;
      const title = document.createElement('strong');
      title.textContent = item.chatName || item.phone || 'Conversa';
      const source = document.createElement('em');
      source.textContent = `${item.profileName}${item.timestamp ? ` · ${formatDate(item.timestamp)}` : ''}`;
      const snippet = document.createElement('p');
      snippet.textContent = item.snippet || item.phone || 'Nome ou telefone encontrado';
      result.append(color, title, source, snippet);
      result.onclick = async () => {
        dialog.close();
        await window.centralWhatsApp.cancelAdd();
        const opened = await window.centralWhatsApp.openGlobalSearchResult(item);
        if (!opened?.ok) alert(opened?.error || 'Não foi possível abrir a conversa.');
      };
      results.append(result);
    }
  };

  const openDialog = async () => {
    await window.centralWhatsApp.beginAdd();
    status.textContent = 'Digite o que deseja encontrar.';
    showEmpty('A busca será feita em todos os números conectados.');
    dialog.showModal();
    await refreshIndexStatus();
    queryInput.focus();
  };

  const closeDialog = async () => {
    if (running) return;
    dialog.close();
    await window.centralWhatsApp.cancelAdd();
  };

  button.onclick = openDialog;
  close.onclick = closeDialog;
  dialog.addEventListener('cancel', (event) => {
    if (running) event.preventDefault();
    else window.centralWhatsApp.cancelAdd();
  });
  cancel.onclick = async () => {
    status.textContent = 'Cancelando a busca…';
    await window.centralWhatsApp.cancelGlobalSearch();
  };
  rebuild.onclick = async () => {
    if (running) return;
    setRunning(true);
    showEmpty('Preparando o índice completo…');
    status.textContent = 'Iniciando a reindexação…';
    try {
      const payload = await window.centralWhatsApp.rebuildGlobalSearchIndex();
      if (payload.cancelled) {
        status.textContent = 'Reindexação cancelada.';
      } else if (payload.failures?.length) {
        status.textContent = `Índice atualizado parcialmente; ${payload.failures.length} número(s) falharam.`;
      } else {
        status.textContent = 'Índice completo atualizado.';
      }
      renderIndexStatus(payload.indexStatus);
      showEmpty('Digite um termo e selecione “Completa” para pesquisar todo o histórico indexado.');
    } catch (error) {
      status.textContent = error.message || 'Não foi possível reconstruir o índice.';
      showEmpty('A reindexação não foi concluída. Tente novamente.');
    } finally {
      setRunning(false);
      queryInput.focus();
    }
  };
  clearIndex.onclick = async () => {
    if (running || !confirm('Apagar o índice local de pesquisa? Ele poderá ser criado novamente pela busca completa.')) return;
    try {
      renderIndexStatus(await window.centralWhatsApp.clearGlobalSearchIndex());
      status.textContent = 'Índice local apagado.';
      showEmpty('A busca rápida continua disponível. A próxima busca completa recriará o índice.');
    } catch (error) {
      status.textContent = error.message || 'Não foi possível apagar o índice.';
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (running) return;
    setRunning(true);
    const mode = selectedMode();
    showEmpty(mode === 'complete' ? 'Atualizando o índice e pesquisando todo o histórico…' : 'Pesquisando conversas e mensagens recentes…');
    status.textContent = mode === 'complete' ? 'Preparando a busca completa…' : 'Preparando a busca rápida…';
    try {
      const payload = await window.centralWhatsApp.searchAllConversations({ query: queryInput.value, mode });
      if (payload.cancelled) {
        status.textContent = 'Busca cancelada.';
        showEmpty('A busca foi cancelada.');
      } else {
        status.textContent = `${payload.results.length} conversa(s) encontrada(s) em ${payload.searchedProfiles} número(s) · busca ${payload.mode === 'complete' ? 'completa' : 'rápida'}.`;
        renderResults(payload);
        renderIndexStatus(payload.indexStatus);
      }
    } catch (error) {
      status.textContent = error.message || 'Não foi possível realizar a busca.';
      showEmpty('Confira o termo digitado e tente novamente.');
    } finally {
      setRunning(false);
      queryInput.focus();
    }
  };

  window.centralWhatsApp.onGlobalSearchProgress?.((progress) => {
    if (!running) return;
    status.textContent = progress.message || 'Pesquisando…';
  });
})();
