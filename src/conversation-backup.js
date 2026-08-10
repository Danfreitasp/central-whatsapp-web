function sanitizeBackupName(value, fallback = 'conversa') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized.slice(0, 70) || fallback;
}

function audioExtension(mimetype) {
  const type = String(mimetype || '').toLowerCase();
  if (type.includes('ogg') || type.includes('opus')) return 'ogg';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('wav')) return 'wav';
  return 'bin';
}

function audioBackupFilename(message, index, mimetype) {
  const date = new Date(Number(message?.timestampMs) || 0);
  const parts = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: 'America/Sao_Paulo'
    }).format(date).replace(/[: ]/g, '-')
    : 'data-desconhecida';
  const direction = message?.fromMe ? 'enviado' : 'recebido';
  return `${String(index + 1).padStart(3, '0')}-${parts}-${direction}.${audioExtension(mimetype)}`;
}

module.exports = { audioBackupFilename, audioExtension, sanitizeBackupName };
