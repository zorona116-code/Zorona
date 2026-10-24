export function createSmartMenuService({
  normalizeList,
  presign,
  storageReady,
  smartNewWindowMs
}) {
  const MEDIA_URL_CACHE_MS = 60 * 1000;
  const MAX_MEDIA_URL_CACHE = 1000;
  const SMART_TAGS = new Set(['spicy']);
  const DIETARY_TAGS = new Set(['vegetarian', 'vegan', 'gluten-free']);

  const mediaUrlCache = new Map();

  const smartSnapshot = () => null;
  const invalidateSmartSnapshot = () => {};

  const smartMeta = (product, snapshot) => {
    const tags = normalizeList(product.tags, SMART_TAGS);
    const dietary = normalizeList(product.dietary, DIETARY_TAGS);
    const created = Date.parse(product.createdAt || '');
    const isNew = Boolean(product.isNew) || (Number.isFinite(created) && Date.now() - created <= smartNewWindowMs);
    const spiceLevel = Math.max(0, Math.min(3, Number(product.spiceLevel) || 0));
    return {
      isNew,
      chefChoice: Boolean(product.chefChoice),
      spicy: tags.includes('spicy') || spiceLevel > 0,
      vegetarian: dietary.includes('vegetarian'),
      vegan: dietary.includes('vegan'),
      glutenFree: dietary.includes('gluten-free'),
      spiceLevel,
      tags,
      dietary
    };
  };

  const cachedMediaUrl = (method, key) => {
    const cacheKey = method + ':' + key;
    const now = Date.now();
    const cached = mediaUrlCache.get(cacheKey);
    if (cached && now - cached.createdAt < MEDIA_URL_CACHE_MS) return cached.url;
    const url = presign(method, key, 900);
    if (!cached && mediaUrlCache.size >= MAX_MEDIA_URL_CACHE) {
      const oldestKey = mediaUrlCache.keys().next().value;
      if (oldestKey !== undefined) mediaUrlCache.delete(oldestKey);
    }
    mediaUrlCache.set(cacheKey, { createdAt: now, url });
    return url;
  };

  const withMediaUrls = (product, snapshot = smartSnapshot()) => ({
    ...product,
    imageUrl: product.imageKey && storageReady ? cachedMediaUrl('GET', product.imageKey) : (product.imageUrl || ''),
    videoUrl: product.videoKey && storageReady ? cachedMediaUrl('GET', product.videoKey) : '',
    smart: smartMeta(product, snapshot)
  });

  return { smartSnapshot, smartMeta, withMediaUrls, invalidateSmartSnapshot };
}
