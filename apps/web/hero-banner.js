(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  let refreshTimer = 0;

  function clearMedia() {
    const wrap = $('#hero-banner-media-wrap');
    const image = $('#hero-banner-image');
    const video = $('#hero-banner-video');
    if (image) {
      image.hidden = true;
      image.removeAttribute('src');
    }
    if (video) {
      video.pause();
      video.hidden = true;
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.removeAttribute('controls');
      video.load();
    }
    if (wrap) wrap.hidden = true;
  }

  function applyMedia(banner) {
    const wrap = $('#hero-banner-media-wrap');
    const image = $('#hero-banner-image');
    const video = $('#hero-banner-video');
    if (!wrap || !image || !video) return;

    if (!banner?.hasMedia || !banner.mediaUrl) {
      clearMedia();
      return;
    }

    wrap.hidden = false;
    image.hidden = true;
    video.pause();
    video.hidden = true;
    video.removeAttribute('src');
    video.removeAttribute('controls');
    video.load();

    if (banner.mediaType === 'video') {
      video.src = banner.mediaUrl;
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.removeAttribute('controls');
      video.hidden = false;
      video.load();
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      return;
    }

    image.src = banner.mediaUrl;
    image.hidden = false;
  }

  async function loadBanner() {
    try {
      const response = await fetch('/api/hero-banner', { cache: 'no-store' });
      if (!response.ok) throw new Error('Hero media unavailable');
      applyMedia(await response.json());
    } catch {
      // The existing hero text remains visible even when media cannot be loaded.
    }
  }

  void loadBanner();
  refreshTimer = window.setInterval(() => void loadBanner(), 50 * 60 * 1000);
  window.addEventListener('pagehide', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
  }, { once: true });
})();
