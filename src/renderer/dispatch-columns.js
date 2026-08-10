(function exposeDispatchColumns(root) {
  const PHONE_HEADER_WORDS = new Set([
    'telefone', 'telefones', 'tel', 'fone', 'fones', 'cel', 'celular', 'celulares',
    'whatsapp', 'whats', 'zap', 'numero', 'numeros', 'phone', 'mobile'
  ]);
  const EXCLUDED_HEADER_WORDS = new Set([
    'cpf', 'cnpj', 'documento', 'matricula', 'beneficio', 'nb', 'contrato', 'id', 'codigo'
  ]);
  const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ]);

  function normalizeHeader(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function phoneShapeScore(value) {
    const raw = String(value ?? '').trim();
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return 0;
    const national = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
    if (!/^\d{10,11}$/.test(national) || !VALID_DDDS.has(Number(national.slice(0, 2)))) return 0;
    const subscriber = national.slice(2);
    const strongSubscriber = (subscriber.length === 9 && subscriber.startsWith('9'))
      || (subscriber.length === 8 && /^[2-5]/.test(subscriber));
    if (!strongSubscriber) return 0;
    let score = digits.startsWith('55') ? 5 : 4;
    if (/[()+\-\s]/.test(raw)) score += 2;
    return score;
  }

  function headerScore(header) {
    const normalized = normalizeHeader(header);
    const words = normalized.split('_').filter(Boolean);
    if (words.some((word) => EXCLUDED_HEADER_WORDS.has(word))) return -100;
    if (PHONE_HEADER_WORDS.has(normalized)) return 120;
    if (words.some((word) => PHONE_HEADER_WORDS.has(word))) return 100;
    if (/^(tel|cel|fone|whats|numero)/.test(normalized)) return 90;
    return 0;
  }

  function detectPhoneColumn(rows) {
    const items = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    const headers = [...new Set(items.flatMap((row) => Object.keys(row)))];
    if (!headers.length) return null;

    const named = headers
      .map((header) => ({ header, normalized: normalizeHeader(header), score: headerScore(header) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
    if (named.length) return { ...named[0], detectedBy: 'header' };

    const sample = items.slice(0, 50);
    const inferred = headers.filter((header) => headerScore(header) >= 0).map((header) => {
      const values = sample.map((row) => row[header]).filter((value) => String(value ?? '').trim());
      const matches = values.filter((value) => phoneShapeScore(value) > 0);
      const shapePoints = matches.reduce((sum, value) => sum + phoneShapeScore(value), 0);
      return {
        header,
        normalized: normalizeHeader(header),
        matches: matches.length,
        total: values.length,
        confidence: values.length ? matches.length / values.length : 0,
        shapePoints
      };
    }).filter((candidate) => {
      if (!candidate.total || candidate.confidence < 0.6) return false;
      return candidate.matches >= Math.min(2, candidate.total);
    }).sort((left, right) => right.confidence - left.confidence || right.shapePoints - left.shapePoints);

    return inferred.length ? { ...inferred[0], detectedBy: 'values' } : null;
  }

  const api = { normalizeHeader, phoneShapeScore, detectPhoneColumn };
  root.DispatchSpreadsheetColumns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
