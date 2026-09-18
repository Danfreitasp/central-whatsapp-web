const MAX_GLOBAL_SEARCH_QUERY = 120;
const GLOBAL_SEARCH_MODES = new Set(['quick', 'complete']);

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeGlobalSearchQuery(value) {
  const raw = String(value || '').trim().slice(0, MAX_GLOBAL_SEARCH_QUERY);
  const text = normalizeSearchText(raw);
  const digits = normalizeSearchDigits(raw);
  const letters = text.replace(/[^a-z]/g, '');
  if (letters.length < 2 && digits.length < 3) {
    throw new Error('Digite pelo menos 2 letras ou 3 números para pesquisar.');
  }
  return { raw, text, digits };
}

function normalizeGlobalSearchMode(value) {
  return GLOBAL_SEARCH_MODES.has(value) ? value : 'quick';
}

function queryMatches(value, query) {
  const text = normalizeSearchText(value);
  if (query?.text && text.includes(query.text)) return true;
  if (!query?.digits) return false;
  return normalizeSearchDigits(value).includes(query.digits);
}

function sortGlobalSearchResults(results) {
  return [...(Array.isArray(results) ? results : [])].sort((a, b) => {
    const timeDifference = (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0);
    if (timeDifference) return timeDifference;
    return String(a?.chatName || '').localeCompare(String(b?.chatName || ''), 'pt-BR');
  });
}

module.exports = {
  MAX_GLOBAL_SEARCH_QUERY,
  normalizeSearchText,
  normalizeSearchDigits,
  normalizeGlobalSearchQuery,
  normalizeGlobalSearchMode,
  queryMatches,
  sortGlobalSearchResults
};
