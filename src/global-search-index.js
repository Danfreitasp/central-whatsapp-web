const { DatabaseSync } = require('node:sqlite');
const { normalizeSearchText, normalizeSearchDigits } = require('./global-search');

const MAX_INDEXED_MESSAGE_LENGTH = 20_000;
const MAX_SEARCH_RESULTS = 1_000;

function clean(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizedMessageBody(value) {
  const text = normalizeSearchText(clean(value, MAX_INDEXED_MESSAGE_LENGTH));
  const digits = normalizeSearchDigits(value);
  return digits && !text.includes(digits) ? `${text} ${digits}`.trim() : text;
}

function sourceChanged(indexedChat, chat) {
  if (!indexedChat || !indexedChat.complete) return true;
  const sourceMessageId = clean(chat?.sourceMessageId, 260);
  const sourceTimestamp = Number(chat?.sourceTimestamp) || 0;
  if (sourceMessageId && sourceMessageId !== indexedChat.sourceMessageId) return true;
  return sourceTimestamp > indexedChat.sourceTimestamp;
}

class GlobalSearchIndex {
  constructor(filePath) {
    this.db = new DatabaseSync(filePath);
    this.ftsAvailable = false;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS search_profiles (
        profile_id TEXT PRIMARY KEY,
        indexed_at TEXT NOT NULL DEFAULT '',
        chat_count INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS search_chats (
        profile_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_name TEXT NOT NULL DEFAULT '',
        normalized_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        source_timestamp INTEGER NOT NULL DEFAULT 0,
        source_message_id TEXT NOT NULL DEFAULT '',
        indexed_at TEXT NOT NULL DEFAULT '',
        complete INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(profile_id, chat_id)
      );
      CREATE INDEX IF NOT EXISTS search_chats_profile ON search_chats(profile_id);
      CREATE TABLE IF NOT EXISTS search_messages (
        id INTEGER PRIMARY KEY,
        profile_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        normalized_body TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT 0,
        UNIQUE(profile_id, message_id)
      );
      CREATE INDEX IF NOT EXISTS search_messages_chat ON search_messages(profile_id, chat_id);
      CREATE INDEX IF NOT EXISTS search_messages_timestamp ON search_messages(timestamp DESC);
    `);
    this.prepareFullTextSearch();
  }

  prepareFullTextSearch() {
    try {
      const alreadyCreated = Boolean(this.db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_messages_fts'"
      ).get());
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_messages_fts USING fts5(
          normalized_body,
          content='search_messages',
          content_rowid='id',
          tokenize='trigram'
        );
        CREATE TRIGGER IF NOT EXISTS search_messages_ai AFTER INSERT ON search_messages BEGIN
          INSERT INTO search_messages_fts(rowid, normalized_body) VALUES (new.id, new.normalized_body);
        END;
        CREATE TRIGGER IF NOT EXISTS search_messages_ad AFTER DELETE ON search_messages BEGIN
          INSERT INTO search_messages_fts(search_messages_fts, rowid, normalized_body)
          VALUES ('delete', old.id, old.normalized_body);
        END;
        CREATE TRIGGER IF NOT EXISTS search_messages_au AFTER UPDATE ON search_messages BEGIN
          INSERT INTO search_messages_fts(search_messages_fts, rowid, normalized_body)
          VALUES ('delete', old.id, old.normalized_body);
          INSERT INTO search_messages_fts(rowid, normalized_body) VALUES (new.id, new.normalized_body);
        END;
      `);
      if (!alreadyCreated) {
        this.db.prepare("INSERT INTO search_messages_fts(search_messages_fts) VALUES ('rebuild')").run();
      }
      this.ftsAvailable = true;
    } catch (error) {
      // O Node usado nos testes não inclui FTS5; o Electron distribuído inclui.
      // O fallback por LIKE preserva a correção, embora seja menos rápido.
      this.ftsAvailable = false;
    }
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }

  indexedChat(profileId, chatId) {
    const row = this.db.prepare(`
      SELECT source_timestamp, source_message_id, complete
      FROM search_chats WHERE profile_id = ? AND chat_id = ?
    `).get(clean(profileId, 80), clean(chatId, 180));
    return row ? {
      sourceTimestamp: Number(row.source_timestamp) || 0,
      sourceMessageId: row.source_message_id || '',
      complete: Boolean(row.complete)
    } : null;
  }

  needsRefresh(profileId, chat) {
    return sourceChanged(this.indexedChat(profileId, chat?.chatId), chat);
  }

  pruneProfileChats(profileId, chatIds) {
    const id = clean(profileId, 80);
    const current = new Set((Array.isArray(chatIds) ? chatIds : []).map((chatId) => clean(chatId, 180)).filter(Boolean));
    const stale = this.db.prepare('SELECT chat_id FROM search_chats WHERE profile_id = ?').all(id)
      .map((row) => row.chat_id)
      .filter((chatId) => !current.has(chatId));
    if (!stale.length) return 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const deleteMessages = this.db.prepare('DELETE FROM search_messages WHERE profile_id = ? AND chat_id = ?');
      const deleteChat = this.db.prepare('DELETE FROM search_chats WHERE profile_id = ? AND chat_id = ?');
      for (const chatId of stale) {
        deleteMessages.run(id, chatId);
        deleteChat.run(id, chatId);
      }
      this.db.exec('COMMIT');
      return stale.length;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  upsertChatMetadata(profileId, chat, complete = false) {
    const id = clean(profileId, 80);
    const chatId = clean(chat?.chatId, 180);
    if (!id || !chatId) return;
    const name = clean(chat?.chatName, 500);
    this.db.prepare(`
      INSERT INTO search_chats(
        profile_id, chat_id, chat_name, normalized_name, phone,
        source_timestamp, source_message_id, indexed_at, complete
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, chat_id) DO UPDATE SET
        chat_name = excluded.chat_name,
        normalized_name = excluded.normalized_name,
        phone = excluded.phone,
        source_timestamp = CASE WHEN excluded.complete THEN excluded.source_timestamp ELSE search_chats.source_timestamp END,
        source_message_id = CASE WHEN excluded.complete THEN excluded.source_message_id ELSE search_chats.source_message_id END,
        indexed_at = CASE WHEN excluded.complete THEN excluded.indexed_at ELSE search_chats.indexed_at END,
        complete = CASE WHEN excluded.complete THEN 1 ELSE search_chats.complete END
    `).run(
      id,
      chatId,
      name,
      normalizeSearchText(name),
      normalizeSearchDigits(chat?.phone),
      Number(chat?.sourceTimestamp) || 0,
      clean(chat?.sourceMessageId, 260),
      complete ? new Date().toISOString() : '',
      complete ? 1 : 0
    );
  }

  writeChatMessages(profileId, chat, messages, { replace = false } = {}) {
    const id = clean(profileId, 80);
    const chatId = clean(chat?.chatId, 180);
    if (!id || !chatId) return 0;
    const insert = this.db.prepare(`
      INSERT INTO search_messages(profile_id, chat_id, message_id, body, normalized_body, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, message_id) DO UPDATE SET
        chat_id = excluded.chat_id,
        body = excluded.body,
        normalized_body = excluded.normalized_body,
        timestamp = excluded.timestamp
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (replace) this.db.prepare('DELETE FROM search_messages WHERE profile_id = ? AND chat_id = ?').run(id, chatId);
      let inserted = 0;
      for (const [position, message] of (Array.isArray(messages) ? messages : []).entries()) {
        const body = clean(message?.body, MAX_INDEXED_MESSAGE_LENGTH).replace(/\s+/g, ' ').trim();
        if (!body) continue;
        const timestamp = Number(message?.timestamp) || 0;
        const messageId = clean(message?.messageId, 260) || `${chatId}:${timestamp}:${position}`;
        insert.run(id, chatId, messageId, body, normalizedMessageBody(body), timestamp);
        inserted += 1;
      }
      this.upsertChatMetadata(id, chat, true);
      this.db.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  replaceChatMessages(profileId, chat, messages) {
    return this.writeChatMessages(profileId, chat, messages, { replace: true });
  }

  appendChatMessages(profileId, chat, messages) {
    return this.writeChatMessages(profileId, chat, messages, { replace: false });
  }

  finishProfile(profileId, { chatCount = 0, complete = false } = {}) {
    const id = clean(profileId, 80);
    const messageCount = Number(this.db.prepare(
      'SELECT COUNT(*) AS count FROM search_messages WHERE profile_id = ?'
    ).get(id)?.count) || 0;
    this.db.prepare(`
      INSERT INTO search_profiles(profile_id, indexed_at, chat_count, message_count, complete)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        indexed_at = excluded.indexed_at,
        chat_count = excluded.chat_count,
        message_count = excluded.message_count,
        complete = excluded.complete
    `).run(id, new Date().toISOString(), Math.max(0, Number(chatCount) || 0), messageCount, complete ? 1 : 0);
    return messageCount;
  }

  profileStatus(profileIds = null) {
    const scoped = Array.isArray(profileIds);
    const ids = new Set((scoped ? profileIds : []).map((id) => clean(id, 80)).filter(Boolean));
    const rows = this.db.prepare('SELECT * FROM search_profiles').all()
      .filter((row) => !scoped || ids.has(row.profile_id));
    return {
      ftsAvailable: this.ftsAvailable,
      indexedProfiles: rows.filter((row) => row.complete).length,
      profileCount: scoped ? ids.size : rows.length,
      chatCount: rows.reduce((total, row) => total + (Number(row.chat_count) || 0), 0),
      messageCount: rows.reduce((total, row) => total + (Number(row.message_count) || 0), 0),
      lastIndexedAt: rows.map((row) => row.indexed_at).filter(Boolean).sort().at(-1) || ''
    };
  }

  clear(profileId = '') {
    const id = clean(profileId, 80);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (id) {
        this.db.prepare('DELETE FROM search_messages WHERE profile_id = ?').run(id);
        this.db.prepare('DELETE FROM search_chats WHERE profile_id = ?').run(id);
        this.db.prepare('DELETE FROM search_profiles WHERE profile_id = ?').run(id);
      } else {
        this.db.exec('DELETE FROM search_messages; DELETE FROM search_chats; DELETE FROM search_profiles;');
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  search(query, profileIds = null) {
    const scoped = Array.isArray(profileIds);
    const ids = new Set((scoped ? profileIds : []).map((id) => clean(id, 80)).filter(Boolean));
    const text = normalizeSearchText(query?.text || query?.raw);
    const digits = normalizeSearchDigits(query?.digits || query?.raw);
    const terms = [...new Set([text, digits].filter((term) => term.length >= 2))];
    const byChat = new Map();
    const acceptProfile = (profileId) => !scoped || ids.has(profileId);
    const remember = (row, matchType) => {
      if (!acceptProfile(row.profile_id)) return;
      const key = `${row.profile_id}\u0000${row.chat_id}`;
      const candidate = {
        profileId: row.profile_id,
        chatId: row.chat_id,
        chatName: row.chat_name,
        messageId: row.message_id || '',
        phone: row.phone || '',
        snippet: row.body || (row.phone ? `Telefone: +${row.phone}` : 'Nome da conversa encontrado'),
        timestamp: Number(row.timestamp || row.source_timestamp) || 0,
        matchType
      };
      const current = byChat.get(key);
      if (!current || matchType === 'message' && current.matchType !== 'message' || candidate.timestamp > current.timestamp) {
        byChat.set(key, candidate);
      }
    };

    const metadataConditions = [];
    const metadataParameters = [];
    if (text) {
      metadataConditions.push("normalized_name LIKE ? ESCAPE '\\'");
      metadataParameters.push(`%${text.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (digits) {
      metadataConditions.push("phone LIKE ? ESCAPE '\\'");
      metadataParameters.push(`%${digits.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const metadataRows = metadataConditions.length ? this.db.prepare(`
      SELECT profile_id, chat_id, chat_name, phone, source_timestamp
      FROM search_chats
      WHERE ${metadataConditions.join(' OR ')}
      LIMIT ?
    `).all(...metadataParameters, MAX_SEARCH_RESULTS) : [];
    for (const row of metadataRows) remember(row, 'contact');

    for (const term of terms) {
      let rows;
      if (this.ftsAvailable && term.length >= 3) {
        rows = this.db.prepare(`
          SELECT m.profile_id, m.chat_id, m.message_id, m.body, m.timestamp,
                 c.chat_name, c.phone, c.source_timestamp
          FROM search_messages_fts f
          JOIN search_messages m ON m.id = f.rowid
          JOIN search_chats c ON c.profile_id = m.profile_id AND c.chat_id = m.chat_id
          WHERE search_messages_fts MATCH ?
          ORDER BY m.timestamp DESC
          LIMIT ?
        `).all(`"${term.replace(/"/g, '""')}"`, MAX_SEARCH_RESULTS);
      } else {
        rows = this.db.prepare(`
          SELECT m.profile_id, m.chat_id, m.message_id, m.body, m.timestamp,
                 c.chat_name, c.phone, c.source_timestamp
          FROM search_messages m
          JOIN search_chats c ON c.profile_id = m.profile_id AND c.chat_id = m.chat_id
          WHERE m.normalized_body LIKE ? ESCAPE '\\'
          ORDER BY m.timestamp DESC
          LIMIT ?
        `).all(`%${term.replace(/[\\%_]/g, '\\$&')}%`, MAX_SEARCH_RESULTS);
      }
      for (const row of rows) remember(row, 'message');
    }
    return [...byChat.values()].sort((a, b) => (b.timestamp - a.timestamp) || a.chatName.localeCompare(b.chatName, 'pt-BR'));
  }
}

module.exports = {
  GlobalSearchIndex,
  MAX_INDEXED_MESSAGE_LENGTH,
  normalizedMessageBody,
  sourceChanged
};
