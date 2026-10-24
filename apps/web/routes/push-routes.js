import { logServiceFailure } from '../utils/service-error.js';

const isValidBase64Url = (value, min, max) => {
  const normalized = String(value || '');
  if (normalized.length < min || normalized.length > max || !/^[A-Za-z0-9_-]+$/.test(normalized)) return false;
  try {
    return Buffer.from(normalized, 'base64url').length > 0;
  } catch {
    return false;
  }
};

function isSupportedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && (
      host === 'fcm.googleapis.com' ||
      host === 'web.push.apple.com' ||
      host === 'notify.windows.com' ||
      host.endsWith('.notify.windows.com') ||
      host === 'push.services.mozilla.com' ||
      host.endsWith('.push.services.mozilla.com')
    );
  } catch {
    return false;
  }
}

function isSameOrigin(req) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.get('host') || '').toLowerCase();
  } catch {
    return false;
  }
}

export function registerPushRoutes(app, { pushService, saveSubscription, removeSubscription, subscribeRateLimit }) {
  app.get('/api/push/config', (_req, res) => {
    const enabled = pushService.isConfigured();
    return res.json({ enabled, publicKey: enabled ? pushService.publicKey() : '' });
  });

  app.post('/api/push/subscribe', subscribeRateLimit, async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ message: 'Cross-origin subscription is not allowed.' });
    if (!pushService.isConfigured()) return res.status(503).json({ message: 'Push notifications are not configured yet.' });
    const value = req.body?.subscription;
    const endpoint = String(value?.endpoint || '').trim();
    const p256dh = String(value?.keys?.p256dh || '').trim();
    const auth = String(value?.keys?.auth || '').trim();
    if (endpoint.length > 2048 || p256dh.length > 120 || auth.length > 120 ||
        !isValidBase64Url(p256dh, 80, 100) || !isValidBase64Url(auth, 20, 64) ||
        Buffer.from(p256dh, 'base64url').length !== 65 ||
        Buffer.from(auth, 'base64url').length !== 16 ||
        !isSupportedPushEndpoint(endpoint)) {
      return res.status(400).json({ message: 'A valid browser push subscription is required.' });
    }
    try {
      await saveSubscription({
        endpoint,
        p256dh,
        auth,
        userAgent: String(req.get('user-agent') || '').slice(0, 400)
      });
      return res.status(201).json({ ok: true });
    } catch (error) {
      logServiceFailure(error, { service: 'push', operation: 'subscribe' });
      return res.status(503).json({ message: 'تعذر حفظ اشتراك الإشعارات الآن.' });
    }
  });

  app.delete('/api/push/subscribe', async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ message: 'Cross-origin subscription is not allowed.' });
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint || endpoint.length > 2048) return res.status(400).json({ message: 'A valid endpoint is required.' });
    try {
      await removeSubscription(endpoint);
      return res.json({ ok: true });
    } catch (error) {
      logServiceFailure(error, { service: 'push', operation: 'unsubscribe' });
      return res.status(503).json({ message: 'تعذر إلغاء اشتراك الإشعارات الآن.' });
    }
  });
}
