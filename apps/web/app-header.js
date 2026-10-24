// Shared ZORONA app-header behavior for inner pages (menu/category/product/cart/events/etc.).
// Pages that already load app.js (index.html, menu.html) handle this themselves and do not include this file.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  function ensureAccountLink() {
    const nav = $('#app-header-nav');
    if (!nav || nav.querySelector('a[href="/account"]')) return;
    const link = document.createElement('a');
    link.href = '/account';
    link.textContent = 'حسابي';
    nav.append(link);
  }

  function markActiveLink() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('#app-header-nav a').forEach(link => {
      const href = (link.getAttribute('href') || '').replace(/\/$/, '') || '/';
      const isActive = href === path || (href !== '/' && path.startsWith(href));
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setupHeaderMenu() {
  const button = $('#app-menu-button');
  const nav = $('#app-header-nav');
  if (!button || !nav || button.dataset.menuBound === 'true') return;

  const isMobile = () => window.matchMedia('(max-width:800px)').matches;
  const setOpen = open => {
    const value = Boolean(open);
    nav.classList.toggle('is-open', value);
    button.setAttribute('aria-expanded', String(value));
    button.setAttribute('aria-label', value ? 'إغلاق القائمة' : 'فتح القائمة');
    button.textContent = value ? '×' : '☰';
    document.body.classList.toggle('app-nav-open', value && isMobile());
  };

  button.dataset.menuBound = 'true';
  setOpen(false);

  button.addEventListener('click', event => {
    event.preventDefault();
    setOpen(!nav.classList.contains('is-open'));
  });

  nav.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', event => {
    if (!nav.classList.contains('is-open')) return;
    if (button.contains(event.target) || nav.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
  });

  window.addEventListener('resize', () => {
    if (!isMobile() && nav.classList.contains('is-open')) setOpen(false);
    else if (nav.classList.contains('is-open')) document.body.classList.add('app-nav-open');
  }, { passive: true });

  window.addEventListener('pageshow', () => setOpen(false), { passive: true });
}

  function setupLanguageToggle() {
    const toggle = $('#lang-toggle');
    if (!toggle) return;

    let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

    const apply = () => {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      toggle.textContent = language === 'ar' ? 'EN' : 'ع';
      window.dispatchEvent(new CustomEvent('arabisk:language-updated', { detail: { language } }));
    };

    apply();
    toggle.addEventListener('click', () => {
      language = language === 'ar' ? 'en' : 'ar';
      localStorage.setItem('ARABISK_LANG', language);
      apply();
    });
  }


  function setupPwaInstallPrompt() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.webmanifest';
      document.head.append(manifest);
    }

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true;
    if (isInstalled()) return;

    let deferredPrompt = null;
    const styles = document.createElement('style');
    styles.textContent = `
      .zorona-install-banner{position:fixed;z-index:9900;inset:auto 16px calc(14px + env(safe-area-inset-bottom,0px));margin:0 auto;width:min(980px,calc(100% - 32px));display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:15px;padding:13px 16px;border:1px solid rgba(224,193,133,.34);border-radius:18px;background:linear-gradient(115deg,#211a13,#100e0c);box-shadow:0 18px 50px rgba(0,0,0,.34);color:#fff5df;direction:rtl;font-family:Cairo,sans-serif}
      .zorona-install-banner[hidden]{display:none!important}
      .zorona-install-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#c59a5b;color:#17130f;font:700 21px Georgia,serif}
      .zorona-install-copy strong{display:block;margin-bottom:3px;color:#f5dcae;font-size:12px;font-weight:900}
      .zorona-install-copy span{display:block;color:#c6bbab;font-size:10px;line-height:1.7}
      .zorona-install-action{min-height:39px;padding:0 15px;border:0;border-radius:999px;background:#c59a5b;color:#17130f;font:900 10px Cairo,sans-serif;white-space:nowrap;cursor:pointer}
      .zorona-install-close{width:32px;height:32px;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:transparent;color:#e9dcc5;font-size:19px;cursor:pointer}
      html.pwa-installed .zorona-install-banner{display:none!important}
      @media(max-width:620px){.zorona-install-banner{inset:auto 9px calc(9px + env(safe-area-inset-bottom,0px));width:auto;grid-template-columns:auto 1fr auto;gap:10px;padding:11px;border-radius:16px}.zorona-install-mark{width:36px;height:36px}.zorona-install-copy strong{font-size:11px}.zorona-install-copy span{font-size:9px}.zorona-install-action{grid-column:2;justify-self:start;min-height:34px;margin-top:4px}.zorona-install-close{grid-column:3;grid-row:1;align-self:start}}
      @media (display-mode:standalone){.zorona-install-banner{display:none!important}}
    `;
    document.head.append(styles);

    const banner = document.createElement('aside');
    banner.className = 'zorona-install-banner';
    banner.setAttribute('aria-label', 'تثبيت تطبيق ZORONA');
    banner.innerHTML = `
      <span class="zorona-install-mark" aria-hidden="true">Z</span>
      <div class="zorona-install-copy"><strong>ثبّت تطبيق ZORONA واحصل على خصم 20%</strong><span>قسيمة QR خاصة بك — صالحة للاستخدام مرة واحدة.</span></div>
      <button class="zorona-install-action" type="button">تثبيت والحصول على الخصم</button>
      <button class="zorona-install-close" type="button" aria-label="إغلاق الإشعار">×</button>
    `;
    document.body.append(banner);
    const action = banner.querySelector('.zorona-install-action');
    const close = banner.querySelector('.zorona-install-close');

    const wasDismissed = () => {
      try { return localStorage.getItem('zorona-install-banner-dismissed') === '1'; } catch { return false; }
    };
    banner.hidden = wasDismissed();

    close.addEventListener('click', () => {
      banner.hidden = true;
      try { localStorage.setItem('zorona-install-banner-dismissed', '1'); } catch {}
    });

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      action.textContent = 'تثبيت الآن';
      if (!wasDismissed() && !isInstalled()) banner.hidden = false;
    });

    action.addEventListener('click', async () => {
      if (deferredPrompt) {
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        try {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice?.outcome === 'accepted') banner.hidden = true;
          else action.textContent = 'تثبيت والحصول على الخصم';
        } catch {
          showInstallInstructions();
        }
        return;
      }
      showInstallInstructions();
    });

    function showInstallInstructions() {
      const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const instructions = isAppleMobile
        ? 'لتثبيت ZORONA على iPhone: اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية». افتح التطبيق من الأيقونة لتحصل على قسيمة QR.'
        : 'لتثبيت ZORONA: افتح قائمة المتصفح (⋮ أو …) واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»، ثم افتحه من الأيقونة لتحصل على قسيمة QR.';
      window.alert(instructions);
    }

    window.addEventListener('appinstalled', () => {
      banner.hidden = true;
      deferredPrompt = null;
      try { localStorage.setItem('zorona-pwa-installed', '1'); } catch {}
    });
  }

  function init() {
    ensureAccountLink();
    setupHeaderMenu();
    setupLanguageToggle();
    setupPwaInstallPrompt();
    markActiveLink();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
