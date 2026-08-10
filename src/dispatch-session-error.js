const WHATSAPP_RESTRICTION_PATTERN_SOURCE = [
  'sua conta est[aá] (?:restringida|restrita) nos dispositivos conectados',
  'n[aã]o [eé] poss[ií]vel iniciar novas conversas no momento',
  'your account is (?:restricted|limited) on linked devices',
  'you (?:cannot|can.t) start new (?:chats|conversations) right now'
].join('|');

const RESTRICTED_SESSION_PATTERNS = [
  new RegExp(WHATSAPP_RESTRICTION_PATTERN_SOURCE, 'i'),
  /this account can no longer use whatsapp/i,
  /esta conta n[aã]o (?:pode|tem permiss[aã]o para) (?:mais )?usar o whatsapp/i,
  /(?:account|whatsapp|user).*(?:bann?ed|block(?:ed)?|restrict(?:ed)?|suspend(?:ed)?|disabled)/i,
  /(?:bann?ed|block(?:ed)?|restrict(?:ed)?|suspend(?:ed)?|disabled).*(?:account|whatsapp|user)/i,
  /conta.*(?:banid|bloquead|restrit|suspens|desativad)/i,
  /(?:banid|bloquead|restrit|suspens|desativad).*conta/i,
  /temporar(?:ily|iamente).*(?:bann?ed|banid|block|bloque|restrict|restrit|suspend)/i,
  /(?:tos|smb)[_\s-]*block/i,
  /\b403\b|forbidden|not allowed to send/i,
  /policy violation|viola[cç][aã]o (?:dos termos|da pol[ií]tica)/i
];

const DISCONNECTED_SESSION_PATTERNS = [
  /not authenticated|not authorized|logged out|disconnected|unpaired/i,
  /n[aã]o (?:est[aá] )?(?:autenticad|conectad)|sess[aã]o (?:encerrada|desconectada)/i,
  /whatsapp n[aã]o est[aá] pronto ou conectado/i
];

const TERMINAL_CONNECTION_STATES = new Set([
  'ACCOUNT_EXPIRED', 'BLOCKED', 'CONFLICT', 'DEPRECATED_VERSION', 'LOGOUT',
  'MD_DOWNGRADE', 'PROXYBLOCK', 'SMB_TOS_BLOCK', 'TOS_BLOCK', 'UNLAUNCHED',
  'UNPAIRED', 'UNPAIRED_IDLE'
]);

class DispatchSessionError extends Error {
  constructor(message, kind = 'unavailable', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DispatchSessionError';
    this.code = 'SENDER_SESSION_UNAVAILABLE';
    this.kind = kind;
  }
}

function normalizedDetails(input) {
  if (input && typeof input === 'object') {
    return {
      message: String(input.message || input.error || ''),
      code: String(input.code || ''),
      connectionState: String(input.connectionState || '').trim().toUpperCase(),
      authenticated: input.authenticated,
      restrictionVisible: input.restrictionVisible === true
    };
  }
  return { message: String(input || ''), code: '', connectionState: '', authenticated: undefined, restrictionVisible: false };
}

function classifyDispatchSessionFailure(input) {
  const details = normalizedDetails(input);
  const combined = `${details.code} ${details.message}`.trim();
  if (details.code === 'sender_restricted') return 'restricted';
  if (details.code === 'sender_unconfirmed') return 'disconnected';
  if (details.restrictionVisible || RESTRICTED_SESSION_PATTERNS.some((pattern) => pattern.test(combined))) return 'restricted';
  if (details.code === '403') return 'restricted';
  if (details.code === '401' || TERMINAL_CONNECTION_STATES.has(details.connectionState)) {
    return details.connectionState.includes('BLOCK') ? 'restricted' : 'disconnected';
  }
  if (details.authenticated === false || DISCONNECTED_SESSION_PATTERNS.some((pattern) => pattern.test(combined))) return 'disconnected';
  return '';
}

function sessionFailureMessage(kind) {
  if (kind === 'restricted') {
    return 'O WhatsApp restringiu ou bloqueou este número. Os envios deste perfil foram interrompidos e os contatos restantes continuam pendentes.';
  }
  return 'Este número perdeu a conexão com o WhatsApp. Os envios deste perfil foram interrompidos e os contatos restantes continuam pendentes.';
}

function createDispatchSessionError(input, fallbackKind = 'unavailable') {
  if (input instanceof DispatchSessionError) return input;
  const kind = classifyDispatchSessionFailure(input) || fallbackKind;
  return new DispatchSessionError(sessionFailureMessage(kind), kind, input instanceof Error ? input : undefined);
}

function isDispatchSessionError(error) {
  return error instanceof DispatchSessionError || error?.code === 'SENDER_SESSION_UNAVAILABLE';
}

module.exports = {
  DispatchSessionError,
  WHATSAPP_RESTRICTION_PATTERN_SOURCE,
  classifyDispatchSessionFailure,
  createDispatchSessionError,
  isDispatchSessionError,
  sessionFailureMessage
};
