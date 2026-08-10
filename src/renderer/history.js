const dispatchHistoryElements = {
  button: document.querySelector('#dispatch-history-button'),
  dialog: document.querySelector('#dispatch-history-dialog'),
  close: document.querySelector('#dispatch-history-close'),
  profile: document.querySelector('#dispatch-history-profile'),
  status: document.querySelector('#dispatch-history-status'),
  query: document.querySelector('#dispatch-history-query'),
  summary: document.querySelector('#dispatch-history-summary'),
  list: document.querySelector('#dispatch-history-list'),
  empty: document.querySelector('#dispatch-history-empty'),
  export: document.querySelector('#dispatch-history-export')
};

let visibleDispatchHistory = [];
let dispatchHistorySearchTimer = null;

function dispatchHistoryFilters(limit = 500) {
  return {
    profileId: dispatchHistoryElements.profile.value,
    status: dispatchHistoryElements.status.value,
    query: dispatchHistoryElements.query.value.trim(),
    limit
  };
}

function formatHistoryPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) {
    const national = digits.slice(2);
    return `+55 ${national.slice(0, 2)} ${national.slice(2)}`;
  }
  return digits;
}

function historyCell(text, detail = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    cell.append(small);
  }
  return cell;
}

function renderDispatchHistory() {
  dispatchHistoryElements.list.replaceChildren();
  dispatchHistoryElements.empty.hidden = visibleDispatchHistory.length > 0;
  dispatchHistoryElements.export.disabled = visibleDispatchHistory.length === 0;
  dispatchHistoryElements.summary.textContent = visibleDispatchHistory.length
    ? `${visibleDispatchHistory.length} registro(s) exibido(s). São mantidos os 10.000 envios mais recentes.`
    : 'Nenhum registro encontrado.';

  for (const entry of visibleDispatchHistory) {
    const row = document.createElement('tr');
    const occurredAt = new Date(entry.occurredAt);
    row.append(historyCell(Number.isNaN(occurredAt.getTime()) ? entry.occurredAt : occurredAt.toLocaleString('pt-BR')));
    row.append(historyCell(entry.profileName || 'Número removido'));
    row.append(historyCell(entry.name || 'Sem nome', formatHistoryPhone(entry.phone)));
    row.append(historyCell(entry.modelName || 'Mensagem única'));
    const result = historyCell(entry.status === 'sent' ? 'Enviado' : 'Erro', entry.reason || '');
    result.classList.add(entry.status === 'sent' ? 'history-sent' : 'history-error');
    row.append(result);
    dispatchHistoryElements.list.append(row);
  }
}

async function loadDispatchHistory() {
  visibleDispatchHistory = await window.centralWhatsApp.listDispatchHistory(dispatchHistoryFilters());
  renderDispatchHistory();
}

function populateDispatchHistoryProfiles() {
  const selected = dispatchHistoryElements.profile.value;
  dispatchHistoryElements.profile.replaceChildren(new Option('Todos os números', ''));
  for (const profile of profiles) dispatchHistoryElements.profile.append(new Option(profile.name, profile.id));
  if ([...dispatchHistoryElements.profile.options].some((option) => option.value === selected)) {
    dispatchHistoryElements.profile.value = selected;
  }
}

async function openDispatchHistory() {
  populateDispatchHistoryProfiles();
  await window.centralWhatsApp.beginAdd();
  await loadDispatchHistory();
  dispatchHistoryElements.dialog.showModal();
}

async function closeDispatchHistory() {
  dispatchHistoryElements.dialog.close();
  await window.centralWhatsApp.cancelAdd();
}

dispatchHistoryElements.button.onclick = openDispatchHistory;
dispatchHistoryElements.close.onclick = closeDispatchHistory;
dispatchHistoryElements.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDispatchHistory();
});
dispatchHistoryElements.profile.onchange = loadDispatchHistory;
dispatchHistoryElements.status.onchange = loadDispatchHistory;
dispatchHistoryElements.query.oninput = () => {
  clearTimeout(dispatchHistorySearchTimer);
  dispatchHistorySearchTimer = setTimeout(loadDispatchHistory, 180);
};
dispatchHistoryElements.export.onclick = async () => {
  const response = await window.centralWhatsApp.saveDispatchHistory(dispatchHistoryFilters(10_000));
  if (!response?.ok || response.canceled) return;
  dispatchHistoryElements.export.textContent = 'CSV salvo';
  setTimeout(() => { dispatchHistoryElements.export.textContent = 'Exportar CSV'; }, 1600);
};
window.centralWhatsApp.onDispatchHistoryChanged?.(() => {
  if (dispatchHistoryElements.dialog.open) loadDispatchHistory();
});
