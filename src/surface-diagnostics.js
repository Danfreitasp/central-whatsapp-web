const fs = require('node:fs');
const path = require('node:path');

// Somente campos técnicos autorizados. Nunca gravar títulos, URLs, mensagens,
// capturas, telefones ou IDs persistentes de perfis neste diagnóstico.
const FIELDS = new Set(['version', 'electron', 'chrome', 'accelerated', 'reason',
  'exitCode', 'contentsId', 'profileCount', 'viewCount', 'attachedCount',
  'freeMemoryMB', 'totalMemoryMB', 'dispatchActive']);

function createSurfaceDiagnostics(directory, { maxBytes = 512 * 1024 } = {}) {
  const file = path.join(directory, 'surface-health.jsonl');
  return {
    directory,
    record(event, details = {}) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) {
          fs.rmSync(`${file}.1`, { force: true });
          fs.renameSync(file, `${file}.1`);
        }
        const fields = Object.fromEntries(Object.entries(details).filter(([key]) => FIELDS.has(key)));
        fs.appendFileSync(file, `${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`);
      } catch { /* Diagnóstico nunca deve impedir o funcionamento da Central. */ }
    }
  };
}

module.exports = { createSurfaceDiagnostics };
