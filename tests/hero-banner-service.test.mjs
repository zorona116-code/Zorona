import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeroBannerService } from '../apps/web/services/hero-banner-service.js';

function makeService(options = {}) {
  const calls = { writes: [], deleted: [], signed: [] };
  let stored = options.stored ?? null;
  const service = createHeroBannerService({
    readJsonWithStatus: async () => ({ ok: true, found: stored !== null, value: stored }),
    writeJson: async (key, value) => {
      calls.writes.push({ key, value });
      if (options.writeResult === false) return false;
      stored = value;
      return true;
    },
    storageReady: options.storageReady ?? true,
    persistenceReady: options.persistenceReady ?? true,
    allowEphemeral: false,
    presign: (method, key, expires) => {
      calls.signed.push({ method, key, expires });
      return `signed:${method}:${key}:${expires}`;
    },
    deleteObject: async key => {
      calls.deleted.push(key);
      return true;
    }
  });
  return { service, calls, readStored: () => stored };
}

test('hero banner restores a durable configuration and provides signed media URLs', async () => {
  const { service } = makeService({
    stored: { version: 1, banner: { enabled: true, mediaType: 'image', mediaKey: 'hero-banner/current.webp', titleAr: 'عنوان الاختبار' } }
  });
  await service.restore();
  const publicBanner = service.getPublicBanner();
  assert.equal(publicBanner.titleAr, 'عنوان الاختبار');
  assert.equal(publicBanner.mediaUrl, 'signed:GET:hero-banner/current.webp:3600');
  assert.equal('mediaKey' in publicBanner, false);
  assert.equal(service.getAdminBanner().mediaKey, 'hero-banner/current.webp');
});

test('hero media upload URL validates MIME type, size, and selected media type', async () => {
  const { service } = makeService();
  await service.restore();
  const prepared = service.uploadPresign({
    purpose: 'media', mediaType: 'video', fileName: 'banner.mp4',
    contentType: 'video/mp4', size: 1024
  });
  assert.match(prepared.key, /^hero-banner\//);
  assert.match(prepared.uploadUrl, /^signed:PUT:/);
  assert.throws(() => service.uploadPresign({
    purpose: 'media', mediaType: 'video', fileName: 'banner.jpg',
    contentType: 'image/jpeg', size: 1024
  }), /صيغة/);
  assert.throws(() => service.uploadPresign({
    purpose: 'poster', mediaType: 'image', fileName: 'poster.jpg',
    contentType: 'image/jpeg', size: 16 * 1024 * 1024
  }), /15MB/);
});

test('saving a new banner persists settings and removes replaced media', async () => {
  const { service, calls, readStored } = makeService({
    stored: { version: 1, banner: { enabled: true, mediaType: 'image', mediaKey: 'hero-banner/old.webp', posterKey: 'hero-banner/old-poster.jpg' } }
  });
  await service.restore();
  const saved = await service.update({
    enabled: true,
    mediaType: 'video',
    mediaKey: 'hero-banner/new.mp4',
    posterKey: '',
    titleAr: 'عنوان جديد',
    primaryUrl: '/menu'
  });
  assert.equal(saved.mediaKey, 'hero-banner/new.mp4');
  assert.equal(saved.titleAr, 'عنوان جديد');
  assert.equal(readStored().banner.mediaType, 'video');
  assert.deepEqual(calls.deleted, ['hero-banner/old.webp', 'hero-banner/old-poster.jpg']);
});

test('failed persistence does not replace the active banner configuration', async () => {
  const { service } = makeService({ writeResult: false });
  await service.restore();
  const before = service.getAdminBanner();
  await assert.rejects(service.update({ titleAr: 'لا تحفظ' }), /تعذر حفظ/);
  assert.equal(service.getAdminBanner().titleAr, before.titleAr);
});
