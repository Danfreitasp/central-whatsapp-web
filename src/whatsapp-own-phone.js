function normalizeOwnPhoneWid(value) {
  if (!value) return '';
  const serialized = typeof value === 'string'
    ? value
    : String(value._serialized || value.toString?.() || '');
  const server = value.server || serialized.split('@')[1] || '';
  const source = value.user ?? serialized.split('@')[0];
  const user = String(source || '').replace(/\D/g, '');
  if (server === 'lid' || !/^\d{8,15}$/.test(user)) return '';
  return user;
}

function readOwnPhoneFromWpp(wpp) {
  try {
    const prefs = wpp?.whatsapp?.UserPrefs;
    const tryRead = (read) => {
      try { return read(); } catch { return null; }
    };
    const candidates = [
      () => prefs?.getMaybeMePnUser?.(),
      () => wpp?.conn?.getMyUserWid?.(),
      () => prefs?.getMaybeMeUser?.()
    ];
    for (const read of candidates) {
      const phone = normalizeOwnPhoneWid(tryRead(read));
      if (phone) return phone;
    }
  } catch {
    // A integração pode não estar disponível nesta versão do WhatsApp Web.
  }
  return '';
}

function createOwnPhoneRuntimeSource() {
  return `(() => {
    ${normalizeOwnPhoneWid.toString()}
    ${readOwnPhoneFromWpp.toString()}
    return readOwnPhoneFromWpp(globalThis.WPP);
  })()`;
}

module.exports = {
  normalizeOwnPhoneWid,
  readOwnPhoneFromWpp,
  createOwnPhoneRuntimeSource
};
