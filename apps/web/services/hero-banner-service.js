import crypto from 'node:crypto';
import { cleanText, cleanKey } from '../utils/input.js';
import { logServiceFailure } from '../utils/service-error.js';

const STATE_KEY = 'data/arabisk-hero-banner-v1.json';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const mediaKey = value => {
  const key = cleanKey(value);
  return key.startsWith('hero-banner/') && !key.includes('..') ? key : '';
};
const validMediaType = value => value === 'video' || value === 'image';

export function createHeroBannerService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  presign,
  deleteObject,
  persistenceReady = storageReady,
  allowEphemeral = false
}) {
  let banner = { mediaType: 'image', mediaKey: '', updatedAt: '' };
  let legacyPosterKey = '';
  let lastPersistAt = null;
  let lastPersistOk = persistenceReady ? null : Boolean(allowEphemeral);

  function normalize(value = {}) {
    return {
      mediaType: value.mediaType === 'video' ? 'video' : 'image',
      mediaKey: mediaKey(value.mediaKey),
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

  function present(includeKey = false) {
    const result = {
      mediaType: banner.mediaType,
      mediaUrl: mediaUrl(banner.mediaKey),
      hasMedia: Boolean(banner.mediaKey),
      updatedAt: banner.updatedAt
    };
    if (includeKey) result.mediaKey = banner.mediaKey;
    return result;
  }

  async function restore() {
    banner = { mediaType: 'image', mediaKey: '', updatedAt: '' };
    legacyPosterKey = '';
    if (!persistenceReady) return;
    const result = await readJsonWithStatus(STATE_KEY);
    if (!result.ok) {
      lastPersistOk = false;
      const error = new Error('تعذر تحميل إعدادات وسائط البانر من التخزين.');
      error.status = 503;
      throw error;
    }
    if (result.found && result.value && typeof result.value === 'object') {
      const saved = result.value.banner || result.value;
      banner = normalize(saved);
      // Clean up files created by the earlier optional-poster version when the media is next changed.
      const candidate = mediaKey(saved.posterKey);
      if (candidate && candidate !== banner.mediaKey) legacyPosterKey = candidate;
    }
  }

  async function persist(nextBanner) {
    if (!persistenceReady) {
      lastPersistOk = Boolean(allowEphemeral);
      return lastPersistOk;
    }
    const ok = await writeJson(STATE_KEY, { version: 2, banner: nextBanner });
    lastPersistOk = ok !== false;
    lastPersistAt = new Date().toISOString();
    return lastPersistOk;
  }

  async function update(body = {}) {
    if (body.mediaType !== undefined && !validMediaType(body.mediaType)) {
      const error = new Error('اختر صورة أو فيديو للبانر.');
      error.status = 400;
      throw error;
    }
    if (body.mediaKey !== undefined && body.mediaKey && !mediaKey(body.mediaKey)) {
      const error = new Error('ملف الوسائط غير صالح.');
      error.status = 400;
      throw error;
    }

    const previous = banner;
    const next = normalize({
      mediaType: body.mediaType === undefined ? banner.mediaType : body.mediaType,
      mediaKey: body.mediaKey === undefined ? banner.mediaKey : body.mediaKey,
      updatedAt: new Date().toISOString()
    });

    try {
      if (!(await persist(next))) {
        const error = new Error('تعذر حفظ وسائط البانر في قاعدة البيانات.');
        error.status = 503;
        throw error;
      }
    } catch (error) {
      banner = previous;
      throw error;
    }

    banner = next;
    const obsolete = [...new Set([
      previous.mediaKey && previous.mediaKey !== next.mediaKey ? previous.mediaKey : '',
      legacyPosterKey && legacyPosterKey !== next.mediaKey ? legacyPosterKey : ''
    ].filter(Boolean))];
    legacyPosterKey = '';
    for (const key of obsolete) {
      const deleted = await deleteObject(key);
      if (!deleted) {
        logServiceFailure(new Error('Old hero banner media could not be removed.'), {
          service: 'hero-banner',
          operation: 'cleanupOldMedia'
        });
      }
    }
    return present(true);
  }

  function uploadPresign(body = {}) {
    if (!storageReady) {
      const error = new Error('رفع الوسائط غير متاح: يجب إعداد تخزين الملفات على الخادم أولًا.');
      error.status = 503;
      throw error;
    }
    const selectedMediaType = validMediaType(body.mediaType) ? body.mediaType : '';
    const fileName = cleanText(body.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(body.contentType, 100).toLowerCase();
    const size = Number(body.size);
    const allowed = selectedMediaType === 'video' ? VIDEO_TYPES : selectedMediaType === 'image' ? IMAGE_TYPES : new Set();
    const maxSize = selectedMediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (!fileName || !selectedMediaType || !allowed.has(contentType)) {
      const error = new Error('نوع الملف لا يطابق الاختيار. اختر صورة أو فيديو متوافقًا.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(size) || size < 1 || size > maxSize) {
      const error = new Error(selectedMediaType === 'video' ? 'الحد الأقصى للفيديو 120MB.' : 'الحد الأقصى للصورة 15MB.');
      error.status = 400;
      throw error;
    }

    const key = 'hero-banner/' + crypto.randomUUID() + '-' + fileName;
    return { key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 };
  }

  return {
    restore,
    getPublicBanner: () => present(false),
    getAdminBanner: () => present(true),
    update,
    uploadPresign,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: () => persist(banner)
  };
}
