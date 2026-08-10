function normalizeChromeVersion(version) {
  const value = String(version || '').trim();
  if (!/^\d+(?:\.\d+){0,3}$/.test(value)) return '';
  return [...value.split('.'), '0', '0', '0'].slice(0, 4).join('.');
}

function createWhatsAppUserAgent(chromeVersion) {
  const normalizedVersion = normalizeChromeVersion(chromeVersion);
  if (!normalizedVersion) {
    throw new Error('Versão do Chromium indisponível para o WhatsApp Web.');
  }

  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalizedVersion} Safari/537.36`;
}

module.exports = { normalizeChromeVersion, createWhatsAppUserAgent };
