// Home page: shows today's offer when one is active.
(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  let timer = 0;

  const formatRemaining = endsAt => {
    const end = Date.parse(endsAt || '');
    if (!Number.isFinite(end) || end <= Date.now()) return '';
    const minutes = Math.max(0, Math.floor((end - Date.now()) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = String(Math.floor((minutes % 1440) / 60)).padStart(2, '0');
    const mins = String(minutes % 60).padStart(2, '0');
    return days > 0 ? `ينتهي خلال ${days} يوم ${hours}:${mins}` : `ينتهي خلال ${hours}:${mins}`;
  };

  async function load() {
    const section = $('#today-offer-section');
    if (!section) return;
    let offer = null;
    try {
      const response = await fetch('/api/promotions/today', { cache: 'no-store' });
      if (response.ok) offer = await response.json();
    } catch {}
    if (!offer || offer.enabled !== true) return;

    let product = null;
    if (offer.productId) {
      try {
        const response = await fetch('/api/products/' + encodeURIComponent(offer.productId), { cache: 'no-store' });
        if (response.ok) product = await response.json();
      } catch {}
    }

    const root = $('#today-offer');
    $('.today-offer-badge', root).textContent = offer.badge || 'عرض اليوم';
    $('.today-offer-title', root).textContent = offer.title || product?.nameAr || 'عرض اليوم';
    $('.today-offer-note', root).textContent = offer.message || product?.descriptionAr || 'عرض خاص متاح الآن في ZORONA.';
    if (product?.imageUrl) $('.today-offer-media img', root).src = product.imageUrl;

    const tick = () => {
      const node = $('.today-offer-timer', root);
      const text = formatRemaining(offer.endsAt);
      node.hidden = !text;
      node.textContent = text;
    };
    tick();
    if (offer.endsAt) timer = window.setInterval(tick, 30000);
    section.hidden = false;
  }

  window.addEventListener('pagehide', () => window.clearInterval(timer));
  void load();
})();
