const { DatabaseSync } = require('node:sqlite');

const MAX_CAMPAIGN_CONTACTS = 20_000;
const MAX_DISPATCH_CONTACTS = 5_000;

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function leadPhone(lead) {
  const areaCode = String(lead?.phone?.areaCode || '').replace(/\D/g, '');
  const number = String(lead?.phone?.number || '').replace(/\D/g, '');
  return areaCode.length === 2 && /^\d{8,9}$/.test(number) ? `55${areaCode}${number}` : '';
}

function normalizeRepeatDays(value) {
  const days = Number(value);
  return [-1, 0, 30, 60, 90, 180, 365].includes(days) ? days : 90;
}

function shouldSkipSent(lastSentAt, repeatDays, now = Date.now()) {
  if (!lastSentAt || repeatDays === -1) return false;
  if (repeatDays === 0) return true;
  const sentAt = Date.parse(lastSentAt);
  return Number.isFinite(sentAt) && sentAt >= now - repeatDays * 86_400_000;
}

function statusLabel(status) {
  return ({ pending: 'Pendente', sent: 'Enviado', error: 'Erro', skipped: 'Já enviado' })[status] || 'Pendente';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

class CampaignStore {
  constructor(filePath) {
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_name TEXT NOT NULL DEFAULT '',
        source_hash TEXT NOT NULL DEFAULT '',
        repeat_days INTEGER NOT NULL DEFAULT 90,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        original_count INTEGER NOT NULL DEFAULT 0,
        invalid_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS campaigns_source_hash_unique
        ON campaigns(source_hash) WHERE source_hash <> '';
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        position INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        lead_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'error', 'skipped')),
        reason TEXT NOT NULL DEFAULT '',
        last_attempt_at TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL DEFAULT '',
        profile_id TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (campaign_id, phone)
      );
      CREATE INDEX IF NOT EXISTS campaign_contacts_status
        ON campaign_contacts(campaign_id, status, position);
      CREATE TABLE IF NOT EXISTS sent_registry (
        phone TEXT PRIMARY KEY,
        last_sent_at TEXT NOT NULL,
        profile_id TEXT NOT NULL DEFAULT '',
        campaign_id TEXT NOT NULL DEFAULT ''
      );
    `);
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }

  seedSentRegistry(entries) {
    const upsert = this.db.prepare(`
      INSERT INTO sent_registry(phone, last_sent_at, profile_id, campaign_id)
      VALUES (?, ?, ?, '')
      ON CONFLICT(phone) DO UPDATE SET
        last_sent_at = CASE WHEN excluded.last_sent_at > sent_registry.last_sent_at THEN excluded.last_sent_at ELSE sent_registry.last_sent_at END,
        profile_id = CASE WHEN excluded.last_sent_at > sent_registry.last_sent_at THEN excluded.profile_id ELSE sent_registry.profile_id END
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const phone = cleanText(entry?.phone, 20).replace(/\D/g, '');
        const occurredAt = cleanText(entry?.occurredAt, 40);
        if (entry?.status === 'sent' && phone && Number.isFinite(Date.parse(occurredAt))) {
          upsert.run(phone, occurredAt, cleanText(entry?.profileId, 80));
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  campaignSummary(id) {
    return this.db.prepare(`
      SELECT c.*,
        COUNT(cc.phone) AS contact_count,
        COALESCE(SUM(cc.status = 'pending'), 0) AS pending_count,
        COALESCE(SUM(cc.status = 'sent'), 0) AS sent_count,
        COALESCE(SUM(cc.status = 'error'), 0) AS error_count,
        COALESCE(SUM(cc.status = 'skipped'), 0) AS skipped_count
      FROM campaigns c
      LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id);
  }

  publicCampaign(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      sourceName: row.source_name,
      repeatDays: Number(row.repeat_days),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      originalCount: Number(row.original_count),
      invalidCount: Number(row.invalid_count),
      duplicateCount: Number(row.duplicate_count),
      contactCount: Number(row.contact_count),
      pendingCount: Number(row.pending_count),
      sentCount: Number(row.sent_count),
      errorCount: Number(row.error_count),
      skippedCount: Number(row.skipped_count)
    };
  }

  listCampaigns() {
    return this.db.prepare(`
      SELECT c.*,
        COUNT(cc.phone) AS contact_count,
        COALESCE(SUM(cc.status = 'pending'), 0) AS pending_count,
        COALESCE(SUM(cc.status = 'sent'), 0) AS sent_count,
        COALESCE(SUM(cc.status = 'error'), 0) AS error_count,
        COALESCE(SUM(cc.status = 'skipped'), 0) AS skipped_count
      FROM campaigns c
      LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all().map((row) => this.publicCampaign(row));
  }

  createCampaign(input) {
    const id = cleanText(input?.id, 80);
    const name = cleanText(input?.name, 100);
    const sourceName = cleanText(input?.sourceName, 180);
    const sourceHash = cleanText(input?.sourceHash, 128);
    const repeatDays = normalizeRepeatDays(input?.repeatDays);
    const leads = Array.isArray(input?.leads) ? input.leads.slice(0, MAX_CAMPAIGN_CONTACTS) : [];
    if (!id || !name || !leads.length) throw new Error('Informe o nome e os contatos da campanha.');
    if (sourceHash) {
      const duplicate = this.db.prepare('SELECT id, name FROM campaigns WHERE source_hash = ?').get(sourceHash);
      if (duplicate) return { ok: false, duplicateCampaignId: duplicate.id, error: `Esta planilha já foi salva na campanha “${duplicate.name}”.` };
    }

    const now = new Date().toISOString();
    const insertCampaign = this.db.prepare(`
      INSERT INTO campaigns(id, name, source_name, source_hash, repeat_days, created_at, updated_at, original_count, invalid_count, duplicate_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const sentRecord = this.db.prepare('SELECT last_sent_at FROM sent_registry WHERE phone = ?');
    const insertContact = this.db.prepare(`
      INSERT INTO campaign_contacts(campaign_id, phone, position, name, lead_json, status, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      insertCampaign.run(
        id, name, sourceName, sourceHash, repeatDays, now, now,
        Math.max(leads.length, Number(input?.originalCount) || 0),
        Math.max(0, Number(input?.invalidCount) || 0),
        Math.max(0, Number(input?.duplicateCount) || 0)
      );
      const phones = new Set();
      let extraDuplicates = 0;
      for (let position = 0; position < leads.length; position += 1) {
        const lead = leads[position];
        const phone = leadPhone(lead);
        if (!phone || phones.has(phone)) {
          if (phone) extraDuplicates += 1;
          continue;
        }
        phones.add(phone);
        const previous = sentRecord.get(phone)?.last_sent_at || '';
        const skipped = shouldSkipSent(previous, repeatDays);
        insertContact.run(
          id,
          phone,
          position,
          cleanText(lead?.person?.name, 160),
          JSON.stringify(lead),
          skipped ? 'skipped' : 'pending',
          skipped ? `Já enviado anteriormente em ${previous}.` : ''
        );
      }
      if (extraDuplicates) {
        this.db.prepare('UPDATE campaigns SET duplicate_count = duplicate_count + ? WHERE id = ?').run(extraDuplicates, id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { ok: true, campaign: this.publicCampaign(this.campaignSummary(id)) };
  }

  contactsForDispatch(campaignId, mode = 'pending', limit = MAX_DISPATCH_CONTACTS) {
    const status = mode === 'errors' ? 'error' : 'pending';
    const campaign = this.publicCampaign(this.campaignSummary(cleanText(campaignId, 80)));
    if (!campaign) throw new Error('A campanha não foi encontrada.');
    const rows = this.db.prepare(`
      SELECT lead_json FROM campaign_contacts
      WHERE campaign_id = ? AND status = ?
      ORDER BY position LIMIT ?
    `).all(campaign.id, status, Math.max(1, Math.min(MAX_DISPATCH_CONTACTS, Number(limit) || MAX_DISPATCH_CONTACTS)));
    return { campaign, mode, leads: rows.map((row) => JSON.parse(row.lead_json)) };
  }

  recordOutcome(input) {
    const phone = cleanText(input?.phone, 20).replace(/\D/g, '');
    const campaignId = cleanText(input?.campaignId, 80);
    const occurredAt = cleanText(input?.occurredAt, 40) || new Date().toISOString();
    const status = input?.status === 'sent' ? 'sent' : 'error';
    if (!phone) return;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (status === 'sent') {
        this.db.prepare(`
          INSERT INTO sent_registry(phone, last_sent_at, profile_id, campaign_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET
            last_sent_at = excluded.last_sent_at,
            profile_id = excluded.profile_id,
            campaign_id = excluded.campaign_id
        `).run(phone, occurredAt, cleanText(input?.profileId, 80), campaignId);
      }
      if (campaignId) {
        this.db.prepare(`
          UPDATE campaign_contacts SET
            status = ?, reason = ?, last_attempt_at = ?,
            sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
            profile_id = ?, model_name = ?
          WHERE campaign_id = ? AND phone = ?
        `).run(
          status,
          status === 'error' ? cleanText(input?.reason, 500) : '',
          occurredAt,
          status,
          occurredAt,
          cleanText(input?.profileId, 80),
          cleanText(input?.modelName, 80),
          campaignId,
          phone
        );
        this.db.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(occurredAt, campaignId);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  releaseSkipped(campaignId) {
    const id = cleanText(campaignId, 80);
    this.db.prepare(`UPDATE campaign_contacts SET status = 'pending', reason = '' WHERE campaign_id = ? AND status = 'skipped'`).run(id);
    this.db.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return this.publicCampaign(this.campaignSummary(id));
  }

  removeCampaign(campaignId) {
    this.db.prepare('DELETE FROM campaigns WHERE id = ?').run(cleanText(campaignId, 80));
    return this.listCampaigns();
  }

  createCampaignCsv(campaignId) {
    const rows = this.db.prepare(`
      SELECT name, phone, status, reason, last_attempt_at, sent_at, profile_id, model_name
      FROM campaign_contacts WHERE campaign_id = ? ORDER BY position
    `).all(cleanText(campaignId, 80));
    const header = ['Nome', 'Telefone', 'Situação', 'Motivo', 'Última tentativa', 'Enviado em', 'Número utilizado', 'Modelo'];
    const body = rows.map((row) => [
      row.name, row.phone, statusLabel(row.status), row.reason, row.last_attempt_at,
      row.sent_at, row.profile_id, row.model_name
    ]);
    return `\uFEFFsep=;\r\n${[header, ...body].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
  }
}

module.exports = {
  CampaignStore,
  MAX_CAMPAIGN_CONTACTS,
  MAX_DISPATCH_CONTACTS,
  leadPhone,
  normalizeRepeatDays,
  shouldSkipSent
};
