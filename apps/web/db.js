import pg from 'pg';
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
