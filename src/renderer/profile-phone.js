(function exposeProfilePhone(root) {
  function digitsOf(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function normalizePhone(value) {
    let digits = digitsOf(value).replace(/^0+/, '');
    if (!digits) return '';
    // Números brasileiros costumam ser informados apenas com DDD + número.
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (digits.length < 8 || digits.length > 15) return '';
    return digits;
  }

  function formatPhone(value) {
    const digits = digitsOf(value);
    if (!digits) return '';
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      const areaCode = digits.slice(2, 4);
      const local = digits.slice(4);
      const split = local.length - 4;
      return `+55 (${areaCode}) ${local.slice(0, split)}-${local.slice(split)}`;
    }
    return `+${digits}`;
  }

  const api = { normalizePhone, formatPhone };
  root.ProfilePhone = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
