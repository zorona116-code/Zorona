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

function isSameOrigin(req) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.get('host') || '').toLowerCase();
  } catch {
    return false;
  }
}

export function registerPushRoutes(app, { pushService, saveSubscription, removeSubscription }) {
  app.get('/api/push/config', (_req, res) => {
    const enabled = pushService.isConfigured();
    return res.json({ enabled, publicKey: enabled ? pushService.publicKey() : '' });
  });

  app.post('/api/push/subscribe', async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ message: 'Cross-origin subscription is not allowed.' });
    if (!pushService.isConfigured()) return res.status(503).json({ message: 'Push notifications are not configured yet.' });
    const value = req.body?.subscription;
    const endpoint = String(value?.endpoint || '').trim();
    const p256dh = String(value?.keys?.p256dh || '').trim();
    const auth = String(value?.keys?.auth || '').trim();
    if (endpoint.length > 2048 || p256dh.length > 120 || auth.length > 120 ||
        !isValidBase64Url(p256dh, 80, 100) || !isValidBase64Url(auth, 20, 64)) {
      return res.status(400).json({ message: 'A valid push subscription is required.' });
    }
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return res.status(400).json({ message: 'A valid HTTPS push endpoint is required.' });
      }
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
