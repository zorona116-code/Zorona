import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromotionService } from '../apps/web/services/promotion-service.js';

function createFixture({ saved = null, writeJson = async () => true } = {}) {
  const writes = [];
  const service = createPromotionService({
    storageReady: true,
    readJsonWithStatus: async () => saved
      ? { ok: true, found: true, value: saved }
      : { ok: true, found: false, value: null },
    writeJson: async (key, value) => { writes.push({ key, value }); return writeJson(key, value); }
  });
  return { service, writes };
}

test('today offer is disabled by default', () => {
  const { service } = createFixture();
  assert.equal(service.getPublicTodayOffer().enabled, false);
});

test('updating the today offer persists it and makes it public', async () => {
  const { service, writes } = createFixture();
  const offer = await service.updateTodayOffer({ enabled: true, productId: 'P001', title: 'عرض خاص' });
  assert.equal(offer.enabled, true);
  assert.equal(service.getPublicTodayOffer().productId, 'P001');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value.today.title, 'عرض خاص');
});

test('today offer respects its start and end window', async () => {
  const { service } = createFixture();
  const past = new Date(Date.now() - 2 * 3600e3).toISOString();
  const earlier = new Date(Date.now() - 3600e3).toISOString();
  await service.updateTodayOffer({ enabled: true, startsAt: past, endsAt: earlier });
  assert.equal(service.getPublicTodayOffer().enabled, false);
  assert.equal(service.getAdminTodayOffer().configuredEnabled, true);
});

test('today offer rejects an end time before its start time', async () => {
  const { service } = createFixture();
  await assert.rejects(
    () => service.updateTodayOffer({
      startsAt: '2030-01-02T10:00:00.000Z',
      endsAt: '2030-01-01T10:00:00.000Z'
    }),
    error => error.status === 400
  );
});

test('today offer update fails when persistence fails', async () => {
  const { service } = createFixture({ writeJson: async () => false });
  await assert.rejects(() => service.updateTodayOffer({ enabled: true }), error => error.status === 503);
});

test('restore loads a saved today offer and ignores legacy install-reward data', async () => {
  const { service } = createFixture({
    saved: { version: 2, today: { enabled: true, title: 'محفوظ' }, install: { claims: [{ code: 'X' }] } }
  });
  await service.restore();
  assert.equal(service.getPublicTodayOffer().title, 'محفوظ');
  assert.equal(service.claimInstallReward, undefined);
});


test('promotion updates fail without configured persistence unless ephemeral mode is explicit', async () => {
  const service = createPromotionService({
    storageReady: false,
    persistenceReady: false,
    allowEphemeral: false,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => true
  });
  await assert.rejects(() => service.updateTodayOffer({ enabled: true }), error => error.status === 503);

  const localService = createPromotionService({
    storageReady: false,
    persistenceReady: false,
    allowEphemeral: true,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => true
  });
  assert.equal((await localService.updateTodayOffer({ enabled: true })).enabled, true);
});
