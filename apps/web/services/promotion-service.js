import { logServiceFailure } from '../utils/service-error.js';

const PROMOTION_STATE_KEY = 'data/arabisk-promotions-v2.json';

class PromotionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PromotionError';
    this.status = status;
  }
}

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);

const createDefaultTodayOffer = () => ({
  enabled: false,
  productId: '',
  badge: 'عرض اليوم',
  title: 'اختيار اليوم من ZORONA',
  message: 'اختيار مميز من القائمة متاح اليوم.',
  ctaLabel: 'اكتشف المنيو',
  startsAt: '',
  endsAt: '',
  updatedAt: new Date().toISOString()
});

export function createPromotionService({ readJsonWithStatus, writeJson, storageReady, persistenceReady = storageReady, allowEphemeral = false, onTodayOfferPublished = () => {} }) {
  let todayOffer = createDefaultTodayOffer();
  let lastPersistAt = null;
  let lastPersistOk = persistenceReady ? null : Boolean(allowEphemeral);

  const snapshot = () => ({
    version: 3,
    today: {
      enabled: todayOffer.enabled,
      productId: todayOffer.productId,
      badge: todayOffer.badge,
      title: todayOffer.title,
      message: todayOffer.message,
      ctaLabel: todayOffer.ctaLabel,
      startsAt: todayOffer.startsAt,
      endsAt: todayOffer.endsAt,
      updatedAt: todayOffer.updatedAt
    }
  });

  const persistSnapshot = async () => {
    if (!persistenceReady) return Boolean(allowEphemeral);
    try {
      const ok = await writeJson(PROMOTION_STATE_KEY, snapshot());
      lastPersistOk = ok !== false;
      lastPersistAt = new Date().toISOString();
      return ok !== false;
    } catch {
      lastPersistOk = false;
      lastPersistAt = new Date().toISOString();
      return false;
    }
  };

  async function restore() {
    todayOffer = createDefaultTodayOffer();
    if (!persistenceReady) return;
    const result = await readJsonWithStatus(PROMOTION_STATE_KEY);
    if (!result.ok) {
      lastPersistOk = false;
      throw new PromotionError('Promotion state could not be restored from storage.', 503);
    }
    if (result.found && result.value && typeof result.value === 'object') {
      todayOffer = { ...createDefaultTodayOffer(), ...(result.value.today || {}) };
    }
  }

  function getPublicTodayOffer() {
    const now = Date.now();
    const startsAt = Date.parse(todayOffer.startsAt || '');
    const endsAt = Date.parse(todayOffer.endsAt || '');
    const active = todayOffer.enabled === true &&
      (!Number.isFinite(startsAt) || startsAt <= now) &&
      (!Number.isFinite(endsAt) || endsAt > now);
    return {
      enabled: active,
      productId: clean(todayOffer.productId, 50),
      badge: clean(todayOffer.badge, 80),
      title: clean(todayOffer.title, 160),
      message: clean(todayOffer.message, 320),
      ctaLabel: clean(todayOffer.ctaLabel, 60) || 'اكتشف المنيو',
      startsAt: todayOffer.startsAt || '',
      endsAt: todayOffer.endsAt || ''
    };
  }

  function getAdminTodayOffer() {
    return {
      ...getPublicTodayOffer(),
      configuredEnabled: todayOffer.enabled === true,
      updatedAt: todayOffer.updatedAt
    };
  }

  async function updateTodayOffer(body = {}) {
    const previousPublicOffer = getPublicTodayOffer();
    const startsAt = clean(body.startsAt === undefined ? todayOffer.startsAt : body.startsAt, 40);
    const endsAt = clean(body.endsAt === undefined ? todayOffer.endsAt : body.endsAt, 40);
    if (startsAt && !Number.isFinite(Date.parse(startsAt))) throw new PromotionError('وقت بداية عرض اليوم غير صالح.');
    if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new PromotionError('وقت نهاية عرض اليوم غير صالح.');
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new PromotionError('وقت نهاية عرض اليوم يجب أن يكون بعد وقت البداية.');
    }

    todayOffer = {
      ...todayOffer,
      enabled: body.enabled === undefined ? todayOffer.enabled : body.enabled === true,
      productId: clean(body.productId === undefined ? todayOffer.productId : body.productId, 50),
      badge: clean(body.badge === undefined ? todayOffer.badge : body.badge, 80) || 'عرض اليوم',
      title: clean(body.title === undefined ? todayOffer.title : body.title, 160) || 'اختيار اليوم من ZORONA',
      message: clean(body.message === undefined ? todayOffer.message : body.message, 320) || 'اختيار مميز من القائمة متاح اليوم.',
      ctaLabel: clean(body.ctaLabel === undefined ? todayOffer.ctaLabel : body.ctaLabel, 60) || 'اكتشف المنيو',
      startsAt,
      endsAt,
      updatedAt: new Date().toISOString()
    };

    if (!(await persistSnapshot())) throw new PromotionError('تعذر حفظ عرض اليوم.', 503);
    const publishedOffer = getPublicTodayOffer();
    const offerChanged = previousPublicOffer.enabled !== publishedOffer.enabled ||
      previousPublicOffer.productId !== publishedOffer.productId ||
      previousPublicOffer.badge !== publishedOffer.badge ||
      previousPublicOffer.title !== publishedOffer.title ||
      previousPublicOffer.message !== publishedOffer.message;
    if (publishedOffer.enabled && offerChanged) {
      Promise.resolve().then(() => onTodayOfferPublished(publishedOffer)).catch(error => {
        logServiceFailure(error, { service: 'promotion', operation: 'notify-today-offer-published' });
      });
    }
    return getAdminTodayOffer();
  }

  return {
    restore,
    getPublicTodayOffer,
    getAdminTodayOffer,
    updateTodayOffer,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: persistSnapshot
  };
}
