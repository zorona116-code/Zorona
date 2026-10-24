import crypto from 'node:crypto';
import { cleanText, cleanKey, cleanUrl } from '../utils/input.js';
import { logServiceFailure } from '../utils/service-error.js';

const STATE_KEY = 'data/arabisk-hero-banner-v1.json';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const DEFAULTS = Object.freeze({
  enabled: true,
  mediaType: 'image',
  mediaKey: '',
  posterKey: '',
  kickerAr: 'ZORONA · مطعم لبناني وتركي',
  kickerEn: 'ZORONA · LEBANESE & TURKISH CUISINE',
  titleAr: 'نكهات لبنان وتركيا',
  accentAr: 'على مائدة واحدة',
  leadAr: 'من المشاوي التركية والمقبلات اللبنانية إلى أطباق أصيلة تجمع العائلة والأصدقاء.',
  titleEn: 'Lebanese & Turkish flavors',
  accentEn: 'at one table',
  leadEn: 'From Turkish grills and Lebanese mezze to authentic dishes made for sharing with family and friends.',
  primaryLabelAr: 'استكشف المنيو',
  primaryLabelEn: 'Explore the Menu',
  primaryUrl: '/menu',
  secondaryLabelAr: 'احجز طاولتك',
  secondaryLabelEn: 'Book a Table',
  secondaryUrl: '/reservation',
  updatedAt: ''
});

const mediaKey = value => {
  const key = cleanKey(value);
  return key.startsWith('hero-banner/') && !key.includes('..') ? key : '';
};
const text = (value, fallback, max) => cleanText(value, max) || fallback;
const url = (value, fallback) => cleanUrl(value) || fallback;

export function createHeroBannerService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  presign,
  deleteObject,
  persistenceReady = storageReady,
  allowEphemeral = false
}) {
  let banner = { ...DEFAULTS };
  let lastPersistAt = null;
  let lastPersistOk = persistenceReady ? null : Boolean(allowEphemeral);

  function normalize(value = {}) {
    return {
      ...DEFAULTS,
      enabled: value.enabled !== false,
      mediaType: value.mediaType === 'video' ? 'video' : 'image',
      mediaKey: mediaKey(value.mediaKey),
      posterKey: mediaKey(value.posterKey),
      kickerAr: text(value.kickerAr, DEFAULTS.kickerAr, 100),
      kickerEn: text(value.kickerEn, DEFAULTS.kickerEn, 100),
      titleAr: text(value.titleAr, DEFAULTS.titleAr, 120),
      accentAr: text(value.accentAr, DEFAULTS.accentAr, 120),
      leadAr: text(value.leadAr, DEFAULTS.leadAr, 320),
      titleEn: text(value.titleEn, DEFAULTS.titleEn, 120),
      accentEn: text(value.accentEn, DEFAULTS.accentEn, 120),
      leadEn: text(value.leadEn, DEFAULTS.leadEn, 320),
      primaryLabelAr: text(value.primaryLabelAr, DEFAULTS.primaryLabelAr, 60),
      primaryLabelEn: text(value.primaryLabelEn, DEFAULTS.primaryLabelEn, 60),
      primaryUrl: url(value.primaryUrl, DEFAULTS.primaryUrl),
      secondaryLabelAr: text(value.secondaryLabelAr, DEFAULTS.secondaryLabelAr, 60),
      secondaryLabelEn: text(value.secondaryLabelEn, DEFAULTS.secondaryLabelEn, 60),
      secondaryUrl: url(value.secondaryUrl, DEFAULTS.secondaryUrl),
      updatedAt: cleanText(value.updatedAt, 40)
    };
  }

  function mediaUrl(key) {
    if (!key || !storageReady) return '';
    try {
      return presign('GET', key, 3600);
    } catch (error) {
      logServiceFailure(error, { service: 'hero-banner', operation: 'presignRead' });
      return '';
    }
  }

  function present(includeKeys = false) {
    const result = {
      enabled: banner.enabled,
      mediaType: banner.mediaType,
      mediaUrl: mediaUrl(banner.mediaKey),
      posterUrl: mediaUrl(banner.posterKey),
      kickerAr: banner.kickerAr,
      kickerEn: banner.kickerEn,
      titleAr: banner.titleAr,
      accentAr: banner.accentAr,
      leadAr: banner.leadAr,
      titleEn: banner.titleEn,
      accentEn: banner.accentEn,
      leadEn: banner.leadEn,
      primaryLabelAr: banner.primaryLabelAr,
      primaryLabelEn: banner.primaryLabelEn,
      primaryUrl: banner.primaryUrl,
      secondaryLabelAr: banner.secondaryLabelAr,
      secondaryLabelEn: banner.secondaryLabelEn,
      secondaryUrl: banner.secondaryUrl,
      updatedAt: banner.updatedAt
    };
    if (includeKeys) {
      result.mediaKey = banner.mediaKey;
      result.posterKey = banner.posterKey;
    }
    return result;
  }

  async function restore() {
    banner = { ...DEFAULTS };
    if (!persistenceReady) return;
    const result = await readJsonWithStatus(STATE_KEY);
    if (!result.ok) {
      lastPersistOk = false;
      const error = new Error('Hero banner settings could not be restored from storage.');
      error.status = 503;
      throw error;
    }
    if (result.found && result.value && typeof result.value === 'object') {
      banner = normalize(result.value.banner || result.value);
    }
  }

  async function persist(nextBanner) {
    if (!persistenceReady) {
      lastPersistOk = Boolean(allowEphemeral);
      return lastPersistOk;
    }
    const ok = await writeJson(STATE_KEY, { version: 1, banner: nextBanner });
    lastPersistOk = ok !== false;
    lastPersistAt = new Date().toISOString();
    return lastPersistOk;
  }

  async function update(body = {}) {
    const previous = banner;
    const next = normalize({ ...banner, ...body, updatedAt: new Date().toISOString() });
    if (body.mediaKey !== undefined) next.mediaKey = mediaKey(body.mediaKey);
    if (body.posterKey !== undefined) next.posterKey = mediaKey(body.posterKey);
    if (body.mediaType !== undefined && !['image', 'video'].includes(body.mediaType)) {
      const error = new Error('نوع وسائط البانر غير صالح.');
      error.status = 400;
      throw error;
    }
    if (body.mediaKey && !next.mediaKey) {
      const error = new Error('ملف الوسائط غير صالح.');
      error.status = 400;
      throw error;
    }
    if (body.posterKey && !next.posterKey) {
      const error = new Error('ملف الغلاف غير صالح.');
      error.status = 400;
      throw error;
    }
    if (next.mediaType === 'video' && next.mediaKey && !VIDEO_TYPES.has(String(body.mediaContentType || 'video/mp4'))) {
      // The actual uploaded content type is validated before issuing its upload URL.
    }
    banner = next;
    try {
      if (!(await persist(next))) {
        banner = previous;
        const error = new Error('تعذر حفظ إعدادات البانر في قاعدة البيانات.');
        error.status = 503;
        throw error;
      }
    } catch (error) {
      banner = previous;
      throw error;
    }

    const retained = new Set([next.mediaKey, next.posterKey].filter(Boolean));
    const obsolete = [...new Set([previous.mediaKey, previous.posterKey].filter(key => key && !retained.has(key)))];
    for (const key of obsolete) {
      const deleted = await deleteObject(key);
      if (!deleted) logServiceFailure(new Error('Old hero banner media could not be removed.'), { service: 'hero-banner', operation: 'cleanupOldMedia' });
    }
    return present(true);
  }

  function uploadPresign(body = {}) {
    if (!storageReady) {
      const error = new Error('تخزين الصور والفيديو غير مهيأ على الخادم.');
      error.status = 503;
      throw error;
    }
    const purpose = body.purpose === 'poster' ? 'poster' : body.purpose === 'media' ? 'media' : '';
    if (!purpose) {
      const error = new Error('الغرض من الرفع غير صالح.');
      error.status = 400;
      throw error;
    }
    const fileName = cleanText(body.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(body.contentType, 100).toLowerCase();
    const size = Number(body.size);
    const allowed = purpose === 'poster' ? IMAGE_TYPES : new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);
    const maxSize = purpose === 'poster' || IMAGE_TYPES.has(contentType) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (!fileName || !allowed.has(contentType)) {
      const error = new Error(purpose === 'poster' ? 'صورة الغلاف يجب أن تكون JPG أو PNG أو WebP أو AVIF.' : 'الصيغ المسموحة: JPG وPNG وWebP وMP4 وMOV.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(size) || size < 1 || size > maxSize) {
      const error = new Error(purpose === 'poster' || IMAGE_TYPES.has(contentType) ? 'الحد الأقصى للصورة 15MB.' : 'الحد الأقصى للفيديو 120MB.');
      error.status = 400;
      throw error;
    }
    if (purpose === 'media' && ((banner.mediaType === 'video' && IMAGE_TYPES.has(contentType)) || (banner.mediaType === 'image' && VIDEO_TYPES.has(contentType)))) {
      // The dashboard may upload a replacement before saving the selected media type,
      // so this endpoint validates the media type by MIME and lets the save operation commit it.
    }
    const key = 'hero-banner/' + crypto.randomUUID() + '-' + fileName;
    return { key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 };
  }

  function deletePresign(body = {}) {
    if (!storageReady) {
      const error = new Error('تخزين الوسائط غير مهيأ على الخادم.');
      error.status = 503;
      throw error;
    }
    const key = mediaKey(body.key);
    if (!key || ![banner.mediaKey, banner.posterKey].includes(key)) {
      const error = new Error('ملف البانر المطلوب حذفه غير صالح.');
      error.status = 400;
      throw error;
    }
    return { key, url: presign('DELETE', key, 900) };
  }

  return {
    restore,
    getPublicBanner: () => present(false),
    getAdminBanner: () => present(true),
    update,
    uploadPresign,
    deletePresign,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: () => persist(banner)
  };
}
