import crypto from 'node:crypto';
import express from 'express';
import { HERO_BANNER_DATABASE_MEDIA_PREFIX } from '../services/hero-banner-service.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const SUPPORTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function streamMedia(req, res, file) {
  const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
  if (!data.length) return res.status(404).end();
  res.set({
    'Content-Type': file.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline'
  });

  const rangeHeader = req.headers.range;
  if (!rangeHeader) {
    res.set('Content-Length', String(data.length));
    return res.status(200).end(data);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) {
    res.set('Content-Range', `bytes */${data.length}`);
    return res.status(416).end();
  }
  let start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
  let end = match[1] ? (match[2] ? Number(match[2]) : data.length - 1) : data.length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= data.length || end < start) {
    res.set('Content-Range', `bytes */${data.length}`);
    return res.status(416).end();
  }
  end = Math.min(end, data.length - 1);
  res.set({
    'Content-Range': `bytes ${start}-${end}/${data.length}`,
    'Content-Length': String(end - start + 1)
  });
  return res.status(206).end(data.subarray(start, end + 1));
}

export function registerHeroBannerRoutes(app, {
  service,
  requireAdminApiKey,
  saveMedia,
  getMedia,
  deleteMedia
}) {
  app.get('/api/hero-banner', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(service.getPublicBanner());
  });

  app.get('/api/hero-banner/media/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(404).end();
      const file = await getMedia(HERO_BANNER_DATABASE_MEDIA_PREFIX + id);
      if (!file) return res.status(404).end();
      return streamMedia(req, res, file);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/hero-banner', requireAdminApiKey, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(service.getAdminBanner());
  });

  app.post(
    '/api/admin/hero-banner/upload',
    requireAdminApiKey,
    express.raw({ type: SUPPORTED_TYPES, limit: '120mb' }),
    async (req, res, next) => {
      let mediaKey = '';
      try {
        const mediaType = String(req.headers['x-hero-media-type'] || '');
        const contentType = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
        const data = req.body;
        const allowed = mediaType === 'video' ? VIDEO_TYPES : mediaType === 'image' ? IMAGE_TYPES : new Set();
        const maxSize = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (!allowed.has(contentType)) throw httpError(400, 'اختر صورة أو فيديو بصيغة مدعومة.');
        if (!Buffer.isBuffer(data) || data.length < 1 || data.length > maxSize) {
          throw httpError(400, mediaType === 'video' ? 'الحد الأقصى للفيديو 120MB.' : 'الحد الأقصى للصورة 15MB.');
        }
        let fileName = String(req.headers['x-file-name'] || 'hero-media');
        try { fileName = decodeURIComponent(fileName); } catch {}
        fileName = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, '-').slice(0, 180) || 'hero-media';
        mediaKey = HERO_BANNER_DATABASE_MEDIA_PREFIX + crypto.randomUUID();
        await saveMedia({ mediaKey, mediaType, contentType, fileName, data });
        const saved = await service.update({ mediaType, mediaKey });
        return res.json(saved);
      } catch (error) {
        if (mediaKey) {
          try { await deleteMedia(mediaKey); } catch {}
        }
        return next(error);
      }
    }
  );

  // Retained for compatibility with earlier admin clients; new uploads use the database route above.
  app.post('/api/admin/hero-banner/upload-presign', requireAdminApiKey, (req, res, next) => {
    try {
      return res.json(service.uploadPresign(req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/admin/hero-banner', requireAdminApiKey, async (req, res, next) => {
    try {
      return res.json(await service.update(req.body || {}));
    } catch (error) {
      return next(error);
    }
  });
}
