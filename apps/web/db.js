import pg from 'pg';
import { createHash } from 'node:crypto';
import { logServiceFailure } from './utils/service-error.js';
import { readJsonWithStatus as readLegacyJsonWithStatus, writeJson as writeLegacyJson, storageReady } from './storage.js';

const { Pool } = pg;

const connectionString = String(process.env.DATABASE_URL || '').trim();

// Production verifies PostgreSQL TLS certificates by default. If a provider's
// managed endpoint uses a non-public CA, explicitly opt into encrypted-but-
// unverified TLS with DATABASE_SSL=allow. DATABASE_SSL=disable is for local
// development databases only; never set it for a public production database.
const sslMode = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
const productionRuntime = process.env.NODE_ENV === 'production' || Boolean(
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT
);
const sslConfig = sslMode === 'disable'
  ? false
  : {
      rejectUnauthorized: sslMode === 'strict' || (productionRuntime && sslMode !== 'allow')
    };

export const dbReady = Boolean(connectionString);

let pool = null;
let schemaPromise = null;

const LEGACY_MIGRATION_MARKER = '__system__/legacy-json-to-db/v1';
const LEGACY_SNAPSHOT_KEYS = Object.freeze([
  'data/arabisk-state.json',
  'data/arabisk-categories.json',
  'data/arabisk-promotions-v1.json',
  'data/arabisk-product-details.json'
]);

function getPool() {
  if (!dbReady) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: sslConfig,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on('error', (error) => {
      // A background/idle client failing must never crash the process.
      logServiceFailure(error, { service: 'db', operation: 'pool-idle-error' });
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!dbReady) return;
  if (!schemaPromise) {
    schemaPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        reservation_count INTEGER NOT NULL DEFAULT 0,
        sms_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
        whatsapp_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
        sms_consent_at TIMESTAMPTZ,
        whatsapp_consent_at TIMESTAMPTZ,
        sms_unsubscribed_at TIMESTAMPTZ,
        whatsapp_unsubscribed_at TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_reservation_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS customer_reservations (
        reservation_id TEXT PRIMARY KEY,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        reservation_date TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS customer_consent_events (
        id BIGSERIAL PRIMARY KEY,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
        action TEXT NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
        consent_text TEXT NOT NULL,
        consent_language TEXT NOT NULL DEFAULT 'ar',
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS customers_sms_opt_in_idx ON customers (last_seen_at DESC) WHERE sms_marketing_consent = TRUE;
      CREATE INDEX IF NOT EXISTS customers_whatsapp_opt_in_idx ON customers (last_seen_at DESC) WHERE whatsapp_marketing_consent = TRUE;

      CREATE TABLE IF NOT EXISTS customer_account_sessions (
        token_hash TEXT PRIMARY KEY,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS customer_account_sessions_expiry_idx ON customer_account_sessions (expires_at);

      CREATE TABLE IF NOT EXISTS customer_favorites (
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (customer_id, product_id)
      );
    `).catch((error) => {
      // Allow retrying schema setup on a later call instead of caching a failure forever.
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}


export async function migrateLegacySnapshots() {
  if (!dbReady) return { ok: false, skipped: true, reason: 'database_not_configured' };
  if (!storageReady) return { ok: false, skipped: true, reason: 'legacy_storage_not_configured' };

  try {
    await ensureSchema();

    const marker = await getPool().query(
      'SELECT value FROM app_state WHERE key = $1',
      [LEGACY_MIGRATION_MARKER]
    );
    if (marker.rows.length > 0) {
      return { ok: true, alreadyMigrated: true, migrated: [], missing: [] };
    }

    const migrated = [];
    const missing = [];

    for (const key of LEGACY_SNAPSHOT_KEYS) {
      const legacy = await readLegacyJsonWithStatus(key);
      if (!legacy.ok) {
        throw new Error(`Legacy snapshot read failed for ${key}: ${legacy.reason}`);
      }
      if (!legacy.found) {
        missing.push(key);
        continue;
      }

      const written = await writeJson(key, legacy.value);
      if (!written) {
        throw new Error(`Legacy snapshot migration write failed for ${key}`);
      }
      migrated.push(key);
    }

    await writeJson(LEGACY_MIGRATION_MARKER, {
      version: 1,
      completedAt: new Date().toISOString(),
      migrated,
      missing
    });

    return { ok: true, alreadyMigrated: false, migrated, missing };
  } catch (error) {
    logServiceFailure(error, { service: 'db', operation: 'legacy-migration' });
    return { ok: false, skipped: false, reason: error.message };
  }
}

export async function readJsonWithStatus(key) {
  if (!dbReady) {
    if (storageReady) return readLegacyJsonWithStatus(key);
    return { ok: false, found: false, value: null, reason: 'persistence_not_configured' };
  }
  try {
    await ensureSchema();
    const { rows } = await getPool().query('SELECT value FROM app_state WHERE key = $1', [key]);
    if (rows.length === 0) return { ok: true, found: false, value: null, reason: 'not_found' };
    return { ok: true, found: true, value: rows[0].value, reason: 'ok' };
  } catch (error) {
    logServiceFailure(error, { service: 'db', operation: 'read', key });
    return { ok: false, found: false, value: null, reason: 'read_failed' };
  }
}

export async function readJson(key, fallback = null) {
  const result = await readJsonWithStatus(key);
  return result.ok && result.found ? result.value : fallback;
}

export async function writeJson(key, value) {
  if (!dbReady) {
    if (!storageReady) return false;
    return writeLegacyJson(key, value);
  }
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
    return true;
  } catch (error) {
    logServiceFailure(error, { service: 'db', operation: 'write', key });
    return false;
  }
}

export async function deleteJson(key) {
  if (!dbReady) return true;
  try {
    await ensureSchema();
    await getPool().query('DELETE FROM app_state WHERE key = $1', [key]);
    return true;
  } catch (error) {
    logServiceFailure(error, { service: 'db', operation: 'delete', key });
    return false;
  }
}

export async function dbHealthCheck() {
  if (!dbReady) return { ok: false, configured: false, reason: 'not_configured' };
  try {
    await getPool().query('SELECT 1');
    return { ok: true, configured: true };
  } catch (error) {
    return { ok: false, configured: true, reason: error.message };
  }
}

export async function closeDbPool() {
  if (pool) {
    const current = pool;
    pool = null;
    schemaPromise = null;
    await current.end();
  }
}


const CUSTOMER_CONSENT_COPY = {
  ar: {
    sms: 'أوافق على تلقي رسائل SMS تسويقية من ZORONA. هذه الموافقة اختيارية ويمكنني إلغاء الاشتراك في أي وقت.',
    whatsapp: 'أوافق على تلقي عروض وإشعارات تسويقية من ZORONA عبر WhatsApp. هذه الموافقة اختيارية ويمكنني إلغاء الاشتراك في أي وقت.'
  },
  en: {
    sms: 'I agree to receive marketing SMS messages from ZORONA. This is optional and I can unsubscribe at any time.',
    whatsapp: 'I agree to receive marketing offers and updates from ZORONA through WhatsApp. This is optional and I can unsubscribe at any time.'
  }
};

export async function recordCustomerReservation(reservation, consent = {}) {
  if (!dbReady) return { ok: false, configured: false, reason: 'database_not_configured' };
  await ensureSchema();
  const client = await getPool().connect();
  const language = consent.marketingConsentLanguage === 'en' ? 'en' : 'ar';
  try {
    await client.query('BEGIN');
    let result = await client.query(
      `INSERT INTO customers (name, phone, first_seen_at, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now(), now())
       ON CONFLICT (phone) DO UPDATE
         SET name = EXCLUDED.name, last_seen_at = now(), updated_at = now()
       RETURNING *`,
      [String(reservation.name || '').trim(), String(reservation.phone || '').trim()]
    );
    let customer = result.rows[0];

    const reservationLink = await client.query(
      `INSERT INTO customer_reservations (reservation_id, customer_id, reservation_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (reservation_id) DO NOTHING
       RETURNING reservation_id`,
      [String(reservation.id), customer.id, String(reservation.date || '')]
    );
    if (reservationLink.rowCount > 0) {
      await client.query(
        `UPDATE customers
         SET reservation_count = reservation_count + 1,
             last_reservation_at = now(),
             last_seen_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [customer.id]
      );
    }

    const choices = [
      { channel: 'sms', consented: consent.marketingSmsConsent === true, flag: 'sms_marketing_consent', timestamp: 'sms_consent_at', unsubscribed: 'sms_unsubscribed_at' },
      { channel: 'whatsapp', consented: consent.marketingWhatsappConsent === true, flag: 'whatsapp_marketing_consent', timestamp: 'whatsapp_consent_at', unsubscribed: 'whatsapp_unsubscribed_at' }
    ];

    for (const choice of choices) {
      if (!choice.consented || customer[choice.flag] === true) continue;
      result = await client.query(
        `UPDATE customers
         SET ${choice.flag} = TRUE, ${choice.timestamp} = now(),
             ${choice.unsubscribed} = NULL, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [customer.id]
      );
      customer = result.rows[0];
      await client.query(
        `INSERT INTO customer_consent_events
          (customer_id, channel, action, consent_text, consent_language, source)
         VALUES ($1, $2, 'opt_in', $3, $4, 'reservation_form')`,
        [customer.id, choice.channel, CUSTOMER_CONSENT_COPY[language][choice.channel], language]
      );
    }

    result = await client.query('SELECT * FROM customers WHERE id = $1', [customer.id]);
    await client.query('COMMIT');
    return { ok: true, configured: true, customer: result.rows[0] };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    logServiceFailure(error, { service: 'db', operation: 'record-customer-reservation' });
    if (!Number.isInteger(error?.status)) error.status = 503;
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomers() {
  if (!dbReady) {
    const error = new Error('Customer database is not configured.');
    error.status = 503;
    throw error;
  }
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, phone, reservation_count, sms_marketing_consent,
            whatsapp_marketing_consent, sms_consent_at, whatsapp_consent_at,
            sms_unsubscribed_at, whatsapp_unsubscribed_at, first_seen_at,
            last_seen_at, last_reservation_at, created_at, updated_at
     FROM customers
     ORDER BY last_reservation_at DESC NULLS LAST, last_seen_at DESC`
  );
  return rows;
}

export async function revokeCustomerMarketingConsent(customerId, channel) {
  if (!dbReady) {
    const error = new Error('Customer database is not configured.');
    error.status = 503;
    throw error;
  }
  const map = {
    sms: { flag: 'sms_marketing_consent', stamp: 'sms_unsubscribed_at' },
    whatsapp: { flag: 'whatsapp_marketing_consent', stamp: 'whatsapp_unsubscribed_at' }
  };
  const spec = map[channel];
  if (!spec) {
    const error = new Error('Unsupported consent channel.');
    error.status = 400;
    throw error;
  }

  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [customerId]);
    if (!current.rowCount) {
      await client.query('COMMIT');
      return null;
    }
    let customer = current.rows[0];
    if (customer[spec.flag] === true) {
      const updated = await client.query(
        `UPDATE customers SET ${spec.flag} = FALSE, ${spec.stamp} = now(), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [customerId]
      );
      customer = updated.rows[0];
      await client.query(
        `INSERT INTO customer_consent_events
          (customer_id, channel, action, consent_text, consent_language, source)
         VALUES ($1, $2, 'opt_out', $3, 'ar', 'admin_dashboard')`,
        [customerId, channel, 'Marketing preference disabled in the admin dashboard following a customer opt-out request.']
      );
    }
    await client.query('COMMIT');
    return customer;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    logServiceFailure(error, { service: 'db', operation: 'revoke-customer-consent' });
    if (!Number.isInteger(error?.status)) error.status = 503;
    throw error;
  } finally {
    client.release();
  }
}



function hashCustomerSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function accountNotConfiguredError() {
  const error = new Error('Customer accounts are not configured.');
  error.status = 503;
  return error;
}

const CUSTOMER_ACCOUNT_COLUMNS = 'id, name, phone, sms_marketing_consent, whatsapp_marketing_consent, first_seen_at, last_seen_at';

export async function createCustomerAccountSession(phone, rawToken) {
  if (!dbReady) throw accountNotConfiguredError();
  if (!phone || !rawToken) throw new Error('Phone and session token are required.');
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      "INSERT INTO customers (name, phone, first_seen_at, last_seen_at, updated_at) " +
      "VALUES ($1, $2, now(), now(), now()) " +
      "ON CONFLICT (phone) DO UPDATE SET last_seen_at = now(), updated_at = now() " +
      "RETURNING " + CUSTOMER_ACCOUNT_COLUMNS,
      ['عميل ZORONA', phone]
    );
    const customer = result.rows[0];
    await client.query(
      "INSERT INTO customer_account_sessions (token_hash, customer_id, expires_at) " +
      "VALUES ($1, $2, now() + interval '14 days')",
      [hashCustomerSessionToken(rawToken), customer.id]
    );
    await client.query('COMMIT');
    return customer;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    logServiceFailure(error, { service: 'customer-account', operation: 'create-session' });
    throw error;
  } finally {
    client.release();
  }
}

export async function getCustomerAccountFromSession(rawToken) {
  if (!dbReady || !rawToken) return null;
  await ensureSchema();
  const result = await getPool().query(
    "UPDATE customer_account_sessions AS s SET last_seen_at = now() " +
    "FROM customers AS c " +
    "WHERE s.customer_id = c.id AND s.token_hash = $1 " +
    "AND s.revoked_at IS NULL AND s.expires_at > now() " +
    "RETURNING " + CUSTOMER_ACCOUNT_COLUMNS.split(', ').map(column => 'c.' + column).join(', '),
    [hashCustomerSessionToken(rawToken)]
  );
  return result.rows[0] || null;
}

export async function revokeCustomerAccountSession(rawToken) {
  if (!dbReady || !rawToken) return;
  await ensureSchema();
  await getPool().query(
    'UPDATE customer_account_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashCustomerSessionToken(rawToken)]
  );
}

export async function updateCustomerAccountName(customerId, name) {
  if (!dbReady) throw accountNotConfiguredError();
  await ensureSchema();
  const result = await getPool().query(
    'UPDATE customers SET name = $2, updated_at = now() WHERE id = $1 RETURNING ' + CUSTOMER_ACCOUNT_COLUMNS,
    [customerId, name]
  );
  return result.rows[0] || null;
}

export async function listCustomerFavoriteIds(customerId) {
  if (!dbReady) throw accountNotConfiguredError();
  await ensureSchema();
  const result = await getPool().query(
    'SELECT product_id FROM customer_favorites WHERE customer_id = $1 ORDER BY created_at DESC',
    [customerId]
  );
  return result.rows.map(row => row.product_id);
}

export async function setCustomerFavorite(customerId, productId, enabled) {
  if (!dbReady) throw accountNotConfiguredError();
  await ensureSchema();
  if (enabled) {
    await getPool().query(
      'INSERT INTO customer_favorites (customer_id, product_id) VALUES ($1, $2) ON CONFLICT (customer_id, product_id) DO NOTHING',
      [customerId, productId]
    );
  } else {
    await getPool().query(
      'DELETE FROM customer_favorites WHERE customer_id = $1 AND product_id = $2',
      [customerId, productId]
    );
  }
}


export async function setCustomerMarketingConsent(customerId, channel, enabled, language = 'ar') {
  if (!dbReady) throw accountNotConfiguredError();
  const map = {
    sms: { flag: 'sms_marketing_consent', consentAt: 'sms_consent_at', unsubscribedAt: 'sms_unsubscribed_at' },
    whatsapp: { flag: 'whatsapp_marketing_consent', consentAt: 'whatsapp_consent_at', unsubscribedAt: 'whatsapp_unsubscribed_at' }
  };
  const spec = map[channel];
  if (!spec) {
    const error = new Error('Unsupported consent channel.');
    error.status = 400;
    throw error;
  }
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT * FROM customers WHERE id = $1 FOR UPDATE',
      [customerId]
    );
    if (!currentResult.rowCount) {
      await client.query('COMMIT');
      return null;
    }
    const current = currentResult.rows[0];
    if (current[spec.flag] !== Boolean(enabled)) {
      const updateSql = enabled
        ? 'UPDATE customers SET ' + spec.flag + ' = TRUE, ' + spec.consentAt + ' = now(), ' +
          spec.unsubscribedAt + ' = NULL, updated_at = now() WHERE id = $1 RETURNING *'
        : 'UPDATE customers SET ' + spec.flag + ' = FALSE, ' + spec.unsubscribedAt + ' = now(), updated_at = now() WHERE id = $1 RETURNING *';
      const updated = await client.query(updateSql, [customerId]);
      await client.query(
        'INSERT INTO customer_consent_events (customer_id, channel, action, consent_text, consent_language, source) ' +
        'VALUES ($1, $2, $3, $4, $5, $6)',
        [
          customerId,
          channel,
          enabled ? 'opt_in' : 'opt_out',
          enabled
            ? CUSTOMER_CONSENT_COPY[language === 'en' ? 'en' : 'ar'][channel]
            : 'Customer changed marketing preferences in their ZORONA account settings.',
          language === 'en' ? 'en' : 'ar',
          'customer_account'
        ]
      );
      await client.query('COMMIT');
      const customer = updated.rows[0];
      return {
        id: Number(customer.id),
        name: customer.name,
        phone: customer.phone,
        sms_marketing_consent: customer.sms_marketing_consent === true,
        whatsapp_marketing_consent: customer.whatsapp_marketing_consent === true,
        first_seen_at: customer.first_seen_at,
        last_seen_at: customer.last_seen_at
      };
    }
    await client.query('COMMIT');
    return {
      id: Number(current.id),
      name: current.name,
      phone: current.phone,
      sms_marketing_consent: current.sms_marketing_consent === true,
      whatsapp_marketing_consent: current.whatsapp_marketing_consent === true,
      first_seen_at: current.first_seen_at,
      last_seen_at: current.last_seen_at
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    logServiceFailure(error, { service: 'customer-account', operation: 'marketing-preference' });
    throw error;
  } finally {
    client.release();
  }
}
