const configuredWebApiBase = String(process.env.ARABISK_WEB_API_URL || '').trim().replace(/\/$/, '');
const runtimeEnvironment = String(
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || ''
).trim().toLowerCase();
const isProductionRuntime =
  process.env.NODE_ENV === 'production' || runtimeEnvironment === 'production';
const isRailwayRuntime = Boolean(
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_ENVIRONMENT_ID
);
const configuredPrivateWebHost = String(process.env.ARABISK_WEB_API_PRIVATE_DOMAIN || '').trim().replace(/\/$/, '');
const privateWebHost = configuredPrivateWebHost || (isRailwayRuntime ? 'web.railway.internal' : '');
const privateWebPort = Number(process.env.ARABISK_WEB_API_PRIVATE_PORT || (isRailwayRuntime ? 8080 : 10000));
const privateWebApiBase = privateWebHost && Number.isInteger(privateWebPort) && privateWebPort > 0 && privateWebPort < 65536
  ? `http://${privateWebHost}:${privateWebPort}`
  : '';

export const adminPort = Number(process.env.PORT || 4174);
export const adminHost = '0.0.0.0';
export const adminUsername = String(process.env.ARABISK_ADMIN_USERNAME || '').trim();
export const adminPassword = String(process.env.ARABISK_ADMIN_PASSWORD || '');
export const adminApiKey = String(process.env.ARABISK_ADMIN_API_KEY || '').trim();

/*
 * Prefer private service-to-service networking in production when an explicit
 * private host is configured. Railway keeps its conventional hostname; other
 * providers (for example Render) can set the same environment variables.
 * ARABISK_WEB_API_URL remains the public website base URL for outbound links.
 */
export const webApiBase = (
  isProductionRuntime && privateWebApiBase
    ? privateWebApiBase
    : configuredWebApiBase
);
export const publicWebBase = configuredWebApiBase || 'https://web-production-d41a3.up.railway.app';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ADMIN_SESSIONS = 2000;
export const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
export const AUTH_RATE_LIMIT = 6;
export const MAX_AUTH_RATE_KEYS = 5000;
export const UPSTREAM_API_TIMEOUT_MS = 15000;
export const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_ADMIN_BODY_BYTES = 256 * 1024;
