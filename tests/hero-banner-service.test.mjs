import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeroBannerService } from '../apps/web/services/hero-banner-service.js';

function makeService(options = {}) {
  const calls = { writes: [], deleted: [], deletedStored: [], signed: [] };
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
    },
    deleteStoredMedia: async key => {
      calls.deletedStored.push(key);
      return options.storedDeleteResult !== false;
    }
  });
  return { service, calls, readStored: () => stored };
}

test('banner restores one media item and does not expose a text-editing schema', async () => {
  const { service } = makeService({
    stored: { version: 1, banner: { mediaType: 'image', mediaKey: 'hero-banner/current.webp', titleAr: 'ignored old text' } }
  });
  await service.restore();
  const publicBanner = service.getPublicBanner();
  assert.equal(publicBanner.hasMedia, true);
  assert.equal(publicBanner.mediaUrl, 'signed:GET:hero-banner/current.webp:3600');
  assert.equal('titleAr' in publicBanner, false);
  assert.equal('posterUrl' in publicBanner, false);
  assert.equal(service.getAdminBanner().mediaKey, 'hero-banner/current.webp');
});

test('upload URL validates selected image/video MIME type and size', async () => {
  const { service } = makeService();
  await service.restore();
  const prepared = service.uploadPresign({
    mediaType: 'video', fileName: 'banner.mp4', contentType: 'video/mp4', size: 1024
  });
  assert.match(prepared.key, /^hero-banner\//);
  assert.match(prepared.uploadUrl, /^signed:PUT:/);
  assert.throws(() => service.uploadPresign({
    mediaType: 'video', fileName: 'banner.jpg', contentType: 'image/jpeg', size: 1024
  }), /نوع الملف/);
  assert.throws(() => service.uploadPresign({
    mediaType: 'image', fileName: 'poster.jpg', contentType: 'image/jpeg', size: 16 * 1024 * 1024
  }), /15MB/);
  assert.throws(() => service.uploadPresign({
    mediaType: 'video', fileName: 'banner.mp4', contentType: 'video/mp4', size: 121 * 1024 * 1024
  }), /120MB/);
});

test('saving one replacement persists media and removes the previous file', async () => {
  const { service, calls, readStored } = makeService({
    stored: { version: 1, banner: { mediaType: 'image', mediaKey: 'hero-banner/old.webp', posterKey: 'hero-banner/old-poster.jpg' } }
  });
  await service.restore();
  const saved = await service.update({ mediaType: 'video', mediaKey: 'hero-banner/new.mp4', titleAr: 'ignored new text' });
  assert.equal(saved.mediaKey, 'hero-banner/new.mp4');
  assert.equal(saved.mediaType, 'video');
  assert.equal('titleAr' in saved, false);
  assert.equal(readStored().banner.mediaType, 'video');
  assert.deepEqual(calls.deleted, ['hero-banner/old.webp', 'hero-banner/old-poster.jpg']);
  assert.deepEqual(Object.keys(readStored().banner).sort(), ['mediaKey', 'mediaType', 'updatedAt']);
});

test('removing media persists empty media key and deletes previous file', async () => {
  const { service, calls } = makeService({
    stored: { version: 2, banner: { mediaType: 'video', mediaKey: 'hero-banner/current.mp4' } }
  });
  await service.restore();
  const saved = await service.update({ mediaKey: '' });
  assert.equal(saved.hasMedia, false);
  assert.deepEqual(calls.deleted, ['hero-banner/current.mp4']);
});

test('failed persistence does not replace the active banner configuration', async () => {
  const { service } = makeService({ writeResult: false });
  await service.restore();
  const before = service.getAdminBanner();
  await assert.rejects(service.update({ mediaKey: 'hero-banner/new.webp' }), /تعذر حفظ/);
  assert.equal(service.getAdminBanner().mediaKey, before.mediaKey);
});


test('database-backed banner media remains visible when external storage is not configured', async () => {
  const { service, calls } = makeService({ storageReady: false });
  await service.restore();
  const key = 'hero-banner/db/123e4567-e89b-12d3-a456-426614174000';
  const saved = await service.update({ mediaType: 'video', mediaKey: key });
  assert.equal(saved.hasMedia, true);
  assert.match(saved.mediaUrl, /\/api\/hero-banner\/media\/123e4567-e89b-12d3-a456-426614174000$/);
  assert.deepEqual(calls.deletedStored, []);
  await service.update({ mediaKey: '' });
  assert.deepEqual(calls.deletedStored, [key]);
  assert.deepEqual(calls.deleted, []);
});
