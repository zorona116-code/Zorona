import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoryService } from '../apps/web/services/category-service.js';
import { createPromotionService } from '../apps/web/services/promotion-service.js';

const failingReader = async () => ({
  ok: false,
  found: false,
  value: null,
  reason: 'read_failed'
});

const noop = async () => true;

const categoryRepository = () => ({
  all: () => [],
  find: () => undefined,
  filter: () => [],
  some: () => false,
  replaceAll: () => []
});

test('persistent domain restores fail closed on category storage read errors', async () => {
  const service = createCategoryService({
    categoriesRepository: categoryRepository(),
    productsRepository: { filter: () => [] },
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: failingReader,
    writeJson: noop,
    deleteObject: noop,
    isAdminApiKeyValid: () => false
  });

  await assert.rejects(service.restore, /Category state could not be restored from storage/i);
});

test('promotion restore fails closed on storage read errors', async () => {
  const service = createPromotionService({
    storageReady: true,
    readJsonWithStatus: failingReader,
    writeJson: noop
  });

  await assert.rejects(service.restore, /Promotion state could not be restored from storage/i);
});
