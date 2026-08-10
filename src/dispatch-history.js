const MAX_DISPATCH_HISTORY = 10_000;

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeDispatchHistoryEntry(entry) {
  const status = entry?.status === 'sent' ? 'sent' : 'error';
  return {
    id: cleanText(entry?.id, 80),
    batchId: cleanText(entry?.batchId, 80),
    occurredAt: cleanText(entry?.occurredAt, 40),
    profileId: cleanText(entry?.profileId, 80),
    profileName: cleanText(entry?.profileName, 80),
    name: cleanText(entry?.name, 160),
    phone: cleanText(entry?.phone, 20).replace(/\D/g, ''),
    modelName: cleanText(entry?.modelName, 80) || 'Mensagem única',
    status,
    reason: status === 'error' ? cleanText(entry?.reason, 500) : ''
  };
}

function mergeDispatchHistory(current, additions, limit = MAX_DISPATCH_HISTORY) {
  const existing = Array.isArray(current) ? current.map(normalizeDispatchHistoryEntry) : [];
  const incoming = Array.isArray(additions) ? additions.map(normalizeDispatchHistoryEntry) : [];
  return [...incoming, ...existing]
    .filter((entry) => entry.id && entry.occurredAt && entry.profileId && entry.phone)
    .slice(0, Math.max(1, limit));
}

function filterDispatchHistory(entries, filters = {}) {
  const profileId = cleanText(filters.profileId, 80);
  const status = filters.status === 'sent' || filters.status === 'error' ? filters.status : '';
  const query = cleanText(filters.query, 120).toLocaleLowerCase('pt-BR');
  const limit = Math.max(1, Math.min(MAX_DISPATCH_HISTORY, Number(filters.limit) || 500));
  return (Array.isArray(entries) ? entries : [])
    .map(normalizeDispatchHistoryEntry)
    .filter((entry) => !profileId || entry.profileId === profileId)
    .filter((entry) => !status || entry.status === status)
    .filter((entry) => !query || [entry.name, entry.phone, entry.profileName, entry.modelName, entry.reason]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query)))
    .slice(0, limit);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function createDispatchHistoryCsv(entries) {
  const header = ['Data', 'Perfil', 'Nome', 'Telefone', 'Modelo', 'Status', 'Motivo'];
  const rows = (Array.isArray(entries) ? entries : []).map(normalizeDispatchHistoryEntry).map((entry) => [
    entry.occurredAt,
    entry.profileName,
    entry.name,
    entry.phone,
    entry.modelName,
    entry.status === 'sent' ? 'Enviado' : 'Erro',
    entry.reason
  ]);
  return `\uFEFFsep=;\r\n${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

module.exports = {
  MAX_DISPATCH_HISTORY,
  normalizeDispatchHistoryEntry,
  mergeDispatchHistory,
  filterDispatchHistory,
  createDispatchHistoryCsv
};
