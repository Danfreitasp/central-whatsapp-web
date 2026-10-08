const fs = require('node:fs');
const path = require('node:path');

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

async function downloadConversationAudios(messages, directory, download, options = {}) {
  const audioFiles = [];
  const audioFailures = [];
  let next = 0;
  let completed = 0;
  let stopped = false;
  const worker = async () => {
    try {
      while (!stopped && next < messages.length) {
        if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
        const index = next++;
        const message = messages[index];
        const startedAt = Date.now();
        options.onProgress?.({ phase: 'audio', current: completed, total: messages.length, message: `Baixando áudios: ${completed} de ${messages.length} processados…` });
        const downloaded = await download(message.id);
        if (options.isCancelled?.()) throw Object.assign(new Error('Backup cancelado.'), { code: 'backup_cancelled' });
        if (!downloaded?.ok || !downloaded.base64) {
          audioFailures.push({ messageId: message.id, timestampMs: message.timestampMs, elapsedMs: Date.now() - startedAt, reason: downloaded?.error || 'Mídia indisponível' });
        } else {
          const mimetype = downloaded.type || message.mimetype;
          const filename = audioBackupFilename(message, index, mimetype);
          const data = Buffer.from(downloaded.base64, 'base64');
          await fs.promises.writeFile(path.join(directory, filename), data);
          audioFiles.push({ messageId: message.id, filename, mimetype, bytes: data.length, elapsedMs: Date.now() - startedAt });
        }
        completed += 1;
        options.onProgress?.({ phase: 'audio', current: completed, total: messages.length, message: `Baixando áudios: ${completed} de ${messages.length} processados…` });
      }
    } catch (error) { stopped = true; throw error; }
  };
  // Aguarda todos os workers antes de permitir a remoção da pasta temporária.
  const results = await Promise.allSettled(Array.from({ length: Math.min(3, messages.length) }, worker));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return { audioFiles: audioFiles.sort((a, b) => a.filename.localeCompare(b.filename)), audioFailures };
}

function conversationCapturePlan(messages) {
  // Os registros de chamada retornados pela consulta separada de call logs
  // não são âncoras confiáveis de openChatAt. Preserva-os no relatório.
  const callRecords = messages.filter(message => message.type === 'call_log');
  const systemRecords = messages.filter(message => message.type === 'e2e_notification');
  const screenshotMessages = messages.filter(message => message.type !== 'call_log' && message.type !== 'e2e_notification');
  return { callRecords, systemRecords, screenshotMessages };
}

// Objetos de ID copiados pelo WhatsApp podem conservar _serialized sem o
// método nativo toString. Object.prototype.toString produz [object Object].
function serializeWhatsAppId(value) {
  const usable = candidate => typeof candidate === 'string' && candidate.length > 0 && !/^\[object .+\]$/.test(candidate);
  if (usable(value)) return value;
  if (!value || typeof value !== 'object') return '';
  try { if (usable(value._serialized)) return value._serialized; } catch {}
  // Reconstrói uma MsgKey quando a propriedade serializada não está exposta.
  if (typeof value.id === 'string' && typeof value.fromMe === 'boolean' && value.remote) {
    const remote = serializeWhatsAppId(value.remote);
    if (remote) {
      const participant = value.participant ? serializeWhatsAppId(value.participant) : '';
      return `${value.fromMe}_${remote}_${value.id}${participant ? `_${participant}` : ''}`;
    }
  }
  if (typeof value.user === 'string' && typeof value.server === 'string') return `${value.user}@${value.server}`;
  try {
    const native = value.toString?.();
    if (usable(native)) return native;
  } catch {}
  return '';
}

module.exports = { audioBackupFilename, audioExtension, sanitizeBackupName, downloadConversationAudios, conversationCapturePlan, serializeWhatsAppId };
