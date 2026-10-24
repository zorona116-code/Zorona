(() => {
  'use strict';
  const html = document.documentElement;
  if (!html.classList.contains('pwa-installed')) return;

  const overlay = document.getElementById('pwa-auth-overlay');
  const registerForm = document.getElementById('pwa-register-form');
  const loginForm = document.getElementById('pwa-login-form');
  const message = document.getElementById('pwa-auth-message');
  const couponOverlay = document.getElementById('pwa-coupon-overlay');
  const couponTitle = document.getElementById('pwa-coupon-title');
  const couponMessage = document.getElementById('pwa-coupon-message');
  const couponImage = document.getElementById('pwa-coupon-qr');
  const couponCode = document.getElementById('pwa-coupon-code');
  const campaignSection = document.getElementById('pwa-campaign-coupons');
  const campaignList = document.getElementById('pwa-campaign-coupons-list');
  const whatsappConsent = document.getElementById('pwa-register-whatsapp-consent');
  const notificationOverlay = document.getElementById('pwa-notification-overlay');
  const notificationAllow = document.getElementById('pwa-notification-allow');
  const notificationDeny = document.getElementById('pwa-notification-deny');
  const notificationStatus = document.getElementById('pwa-notification-status');
  const notificationChoiceKey = 'ZORONA_NOTIFICATION_PERMISSION_CHOICE_V1';
  const modeButtons = Array.from(document.querySelectorAll('[data-pwa-mode]'));
  if (!overlay || !registerForm || !loginForm || !message) return;

  function setMessage(value, isError = true) {
    message.textContent = value || '';
    message.style.color = isError ? '#f0c5a8' : '#c9ddb6';
  }

  function setMode(mode) {
    const isRegister = mode === 'register';
    registerForm.hidden = !isRegister;
    loginForm.hidden = isRegister;
    modeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.pwaMode === mode));
    });
    setMessage('');
  }


  function finishNotificationPrompt(choice) {
    try { localStorage.setItem(notificationChoiceKey, choice); } catch {}
    notificationOverlay?.classList.remove('is-open');
    notificationOverlay?.setAttribute('aria-hidden', 'true');
    if (notificationAllow) notificationAllow.disabled = false;
    if (notificationDeny) notificationDeny.disabled = false;
  }

  function maybeShowNotificationPrompt() {
    if (!notificationOverlay || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    let previousChoice = '';
    try { previousChoice = localStorage.getItem(notificationChoiceKey) || ''; } catch {}
    if (previousChoice) return;
    notificationOverlay.classList.add('is-open');
    notificationOverlay.setAttribute('aria-hidden', 'false');
  }

  function decodeApplicationServerKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function ensurePushSubscription() {
    if (!window.isSecureContext || !('serviceWorker' in navigator) ||
        !('PushManager' in window) || !('Notification' in window) ||
        Notification.permission !== 'granted') return false;

    const configResponse = await fetch('/api/push/config', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!configResponse.ok) throw new Error('تعذر تحميل إعدادات الإشعارات.');
    const config = await configResponse.json();
    if (config.enabled !== true || !config.publicKey) return false;

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const applicationServerKey = decodeApplicationServerKey(config.publicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const existingKey = subscription.options?.applicationServerKey;
      if (existingKey && (
        existingKey.byteLength !== applicationServerKey.byteLength ||
        !existingKey.every((byte, index) => byte === applicationServerKey[index])
      )) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    if (!response.ok) throw new Error('تعذر حفظ اشتراك الإشعارات.');
    return true;
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      if (notificationStatus) notificationStatus.textContent = 'هذا المتصفح لا يدعم إشعارات التطبيق.';
      finishNotificationPrompt('unsupported');
      return;
    }
    if (!window.isSecureContext) {
      if (notificationStatus) notificationStatus.textContent = 'الإشعارات تحتاج إلى اتصال آمن HTTPS.';
      finishNotificationPrompt('unsupported');
      return;
    }

    if (notificationAllow) notificationAllow.disabled = true;
    if (notificationDeny) notificationDeny.disabled = true;
    if (notificationStatus) notificationStatus.textContent = 'جارٍ فتح نافذة إذن الإشعارات…';
    try {
      // This must be called directly from the allow-button click for browsers to show permission UI.
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission === 'granted') {
        try {
          await ensurePushSubscription();
        } catch {
          if (notificationStatus) notificationStatus.textContent = 'تم السماح بالإشعارات، لكن تعذر تفعيلها الآن. سيحاول التطبيق مرة أخرى عند فتحه.';
        }
      }
      finishNotificationPrompt(permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'prompted');
    } catch {
      if (notificationStatus) notificationStatus.textContent = 'تعذر طلب الإذن. يمكنك تغييره من إعدادات المتصفح.';
      finishNotificationPrompt('prompted');
    }
  }

  function closeCoupon() {
    couponOverlay?.classList.remove('is-open');
    couponOverlay?.setAttribute('aria-hidden', 'true');
  }


  async function showCampaignCoupons() {
    if (!campaignSection || !campaignList) return;
    campaignSection.hidden = false;
    campaignList.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'pwa-campaign-loading';
    loading.textContent = 'جارٍ تحميل القسائم الإضافية…';
    campaignList.append(loading);
    try {
      const response = await fetch('/api/account/campaign-coupons', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok) throw new Error(payload.message || 'تعذر تحميل القسائم الإضافية.');
      const coupons = Array.isArray(payload.coupons) ? payload.coupons : [];
      campaignList.replaceChildren();
      if (!coupons.length) {
        campaignSection.hidden = true;
        return;
      }
      for (const coupon of coupons) {
        const card = document.createElement('article');
        card.className = 'pwa-campaign-coupon';
        const image = document.createElement('img');
        image.className = 'pwa-campaign-coupon-qr';
        image.src = coupon.qrDataUrl;
        image.alt = 'رمز QR لقسيمة ' + (coupon.title || 'ZORONA');
        image.loading = 'lazy';
        const details = document.createElement('div');
        details.className = 'pwa-campaign-coupon-details';
        const title = document.createElement('strong');
        title.textContent = coupon.title || 'قسيمة ZORONA';
        const discount = document.createElement('b');
        discount.textContent = 'خصم ' + Number(coupon.discountPercent || 0) + '%';
        const code = document.createElement('code');
        code.textContent = coupon.code || '';
        const terms = document.createElement('small');
        const parts = ['الحد الأدنى للطلب: ' + Number(coupon.minimumOrderAmount || 0).toFixed(2) + ' د.إ'];
        if (coupon.expiresAt) {
          const date = new Date(coupon.expiresAt);
          if (!Number.isNaN(date.getTime())) parts.push('صالحة حتى ' + date.toLocaleDateString('ar-AE', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' }));
        }
        parts.push('الاستخدامات: ' + Number(coupon.usageCount || 0) + ' / ' + (coupon.maxUses === null ? 'بلا حد' : String(coupon.maxUses)));
        terms.textContent = parts.join(' · ');
        details.append(title, discount, code, terms);
        card.append(image, details);
        campaignList.append(card);
      }
      campaignSection.hidden = false;
    } catch (error) {
      campaignList.replaceChildren();
      campaignSection.hidden = true;
    }
  }

  async function showCoupon() {
    if (!couponOverlay) return;
    couponOverlay.classList.add('is-open');
    couponOverlay.setAttribute('aria-hidden', 'false');
    couponTitle.textContent = 'جارٍ تجهيز قسيمة الخصم…';
    couponMessage.textContent = 'لحظة من فضلك.';
    couponImage.hidden = true;
    couponImage.removeAttribute('src');
    couponCode.hidden = true;
    couponCode.textContent = '';
    try {
      const response = await fetch('/api/account/coupon', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok) throw new Error(payload.message || 'تعذر تحميل القسيمة.');
      const coupon = payload.coupon || {};
      couponTitle.textContent = coupon.redeemedAt
        ? 'تم استخدام قسيمتك بالفعل'
        : 'قسيمة خصم ' + Number(coupon.discountPercent || 20) + '%';
      couponMessage.textContent = coupon.redeemedAt
        ? 'هذه القسيمة صُرفت من قبل، ولا يمكن استخدامها مرة أخرى.'
        : 'اعرض رمز QR للموظف عند الدفع. القسيمة صالحة للاستخدام مرة واحدة.';
      if (!coupon.redeemedAt && payload.qrDataUrl) {
        couponImage.src = payload.qrDataUrl;
        couponImage.hidden = false;
        couponCode.textContent = coupon.code || '';
        couponCode.hidden = !coupon.code;
      }
    } catch (error) {
      couponTitle.textContent = 'قسيمة خصم ZORONA';
      couponMessage.textContent = error.message || 'تعذر تحميل القسيمة الآن. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
    }
    await showCampaignCoupons();
  }

  async function readJson(response) {
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  async function unlockIfSignedIn(showRewards = false) {
    try {
      const response = await fetch('/api/account/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return false;
      html.classList.add('pwa-authenticated');
      overlay.setAttribute('aria-hidden', 'true');
      if (showRewards) await showCoupon();
      return true;
    } catch {
      return false;
    }
  }

  async function submitCredentials(form, endpoint, body, buttonLabel) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const previousLabel = button.textContent;
    button.textContent = 'جارٍ التنفيذ…';
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await readJson(response);
      if (await unlockIfSignedIn(true)) {
        form.reset();
        return;
      }
      throw new Error('تم إرسال البيانات لكن تعذر تأكيد الدخول. حاول مرة أخرى.');
    } catch (error) {
      if (error.code === 'PHONE_ALREADY_REGISTERED') {
        setMode('login');
        setMessage(error.message || 'رقم الهاتف مسجل بالفعل. سجّل الدخول.');
      } else {
        setMessage(error.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
      }
    } finally {
      button.disabled = false;
      button.textContent = previousLabel || buttonLabel;
    }
  }

  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.pwaMode)));
  notificationAllow?.addEventListener('click', () => { void requestNotificationPermission(); });
  notificationDeny?.addEventListener('click', () => finishNotificationPrompt('declined'));
  document.getElementById('pwa-coupon-close')?.addEventListener('click', closeCoupon);
  document.getElementById('pwa-coupon-dismiss')?.addEventListener('click', closeCoupon);
  couponOverlay?.addEventListener('click', event => {
    if (event.target === couponOverlay) closeCoupon();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCoupon();
  });

  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCredentials(registerForm, '/api/account/register', {
      name: document.getElementById('pwa-register-name').value.trim(),
      phone: document.getElementById('pwa-register-phone').value.replace(/[\s().-]/g, ''),
      password: document.getElementById('pwa-register-password').value,
      whatsappMarketingConsent: whatsappConsent?.checked === true,
      consentLanguage: html.lang === 'en' ? 'en' : 'ar'
    }, 'إنشاء الحساب');
  });

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCredentials(loginForm, '/api/account/login', {
      phone: document.getElementById('pwa-login-phone').value.replace(/[\s().-]/g, ''),
      password: document.getElementById('pwa-login-password').value
    }, 'تسجيل الدخول');
  });

  setMode('register');
  maybeShowNotificationPrompt();
  if ('Notification' in window && Notification.permission === 'granted') {
    void ensurePushSubscription().catch(() => {});
  }
  unlockIfSignedIn(false).then(signedIn => {
    if (!signedIn) {
      overlay.setAttribute('aria-hidden', 'false');
      document.getElementById('pwa-register-name').focus({ preventScroll: true });
    }
  });
})();
