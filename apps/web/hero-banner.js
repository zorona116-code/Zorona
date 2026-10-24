(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  let currentBanner = null;
  let refreshTimer = 0;

  const language = () => localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

  function clearMedia() {
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
      video.load();
    }
  }

  function setHeroTitle(main, accent) {
    const title = $('#hero-title');
    if (!title) return;
    const mainLine = document.createElement('span');
    mainLine.textContent = main || '';
    const accentLine = document.createElement('em');
    accentLine.textContent = accent || '';
    title.replaceChildren(mainLine, document.createElement('br'), accentLine);
  }

  function applyMedia(banner) {
    const image = $('#hero-banner-image');
    const video = $('#hero-banner-video');
    if (!image || !video) return;
    if (!banner.enabled) {
      clearMedia();
      return;
    }
    if (banner.mediaType === 'video' && banner.mediaUrl) {
      image.hidden = !banner.posterUrl;
      image.src = banner.posterUrl || '';
      video.hidden = false;
      video.poster = banner.posterUrl || '';
      if (video.src !== banner.mediaUrl) {
        video.src = banner.mediaUrl;
        video.load();
      }
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      return;
    }
    video.pause();
    video.hidden = true;
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
    if (banner.mediaType === 'image' && banner.mediaUrl) {
      image.src = banner.mediaUrl;
      image.hidden = false;
    } else if (banner.mediaType === 'video' && banner.posterUrl) {
      image.src = banner.posterUrl;
      image.hidden = false;
    } else {
      image.hidden = true;
      image.removeAttribute('src');
    }
  }

  function applyBanner() {
    if (!currentBanner) return;
    const banner = currentBanner;
    if (!banner.enabled) {
      clearMedia();
      return;
    }
    const en = language() === 'en';
    const suffix = en ? 'En' : 'Ar';
    const kicker = $('#hero-banner-kicker') || $('.app-hero-kicker');
    const lead = $('#hero-banner-lead') || $('.app-hero-lead');
    const primary = $('.app-primary-cta');
    const secondary = $('.app-secondary-cta');

    if (kicker) kicker.textContent = banner['kicker' + suffix] || '';
    setHeroTitle(banner['title' + suffix], banner['accent' + suffix]);
    if (lead) lead.textContent = banner['lead' + suffix] || '';
    if (primary) {
      primary.textContent = (banner['primaryLabel' + suffix] || '') + ' ←';
      primary.href = banner.primaryUrl || '/menu';
    }
    if (secondary) {
      secondary.textContent = (banner['secondaryLabel' + suffix] || '') + ' ←';
      secondary.href = banner.secondaryUrl || '/reservation';
    }
    applyMedia(banner);
  }

  async function loadBanner() {
    try {
      const response = await fetch('/api/hero-banner', { cache: 'no-store' });
      if (!response.ok) throw new Error('Hero banner unavailable');
      currentBanner = await response.json();
      applyBanner();
    } catch {
      // Keep the built-in bilingual hero content if banner settings cannot be loaded.
    }
  }

  window.addEventListener('arabisk:language-updated', applyBanner);
  void loadBanner();
  refreshTimer = window.setInterval(() => void loadBanner(), 50 * 60 * 1000);
  window.addEventListener('pagehide', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
  }, { once: true });
})();
