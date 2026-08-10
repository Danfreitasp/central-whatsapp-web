function normalizeDispatchFailures(failures) {
  return (Array.isArray(failures) ? failures : []).slice(0, 500).map((item) => ({
    name: String(item?.name || '').slice(0, 160),
    phone: String(item?.phone || '').replace(/\D/g, '').slice(0, 13),
    reason: String(item?.reason || '').replace(/[\r\n]+/g, ' ').slice(0, 500)
  }));
}

function createDispatchFailuresCsv(failures) {
  const rows = normalizeDispatchFailures(failures);
  const escapeCsv = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return `\uFEFF${[
    'Nome;Telefone;Motivo',
    ...rows.map((row) => [row.name, row.phone, row.reason].map(escapeCsv).join(';'))
  ].join('\r\n')}`;
}

module.exports = { normalizeDispatchFailures, createDispatchFailuresCsv };
