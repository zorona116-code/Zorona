(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const loginPanel = $('#account-login');
  const dashboard = $('#account-dashboard');
  const loginMessage = $('#account-login-message');
  let pendingPhone = '';
  let accountData = null;
  let couponPayload = null;
  let couponRequest = null;
  let campaignCoupons = [];
  let campaignCouponsRequest = null;
  let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

  const strings = {
    ar: {
      heroTitle: 'حسابك، زيارتك القادمة',
      heroLead: 'تابع حجوزاتك واحتفظ بالأصناف اللي بتحبها في مكان واحد.',
      secureAccess: 'دخول آمن', loginTitle: 'ادخل حسابك برقم الهاتف',
      loginLead: 'هنرسل لك كود تحقق لمرة واحدة للتأكد إن رقم الهاتف يخصك.',
      phoneLabel: 'رقم الهاتف مع مفتاح الدولة', sendCode: 'إرسال كود التحقق',
      codeLabel: 'كود التحقق', verifyCode: 'تأكيد الدخول', changePhone: 'تغيير رقم الهاتف',
      privacyNote: 'حجوزاتك خاصة بحسابك، ولن تظهر إلا بعد التحقق من رقم هاتفك.',
      welcomeBack: 'أهلًا بعودتك', hello: 'أهلًا', logout: 'تسجيل الخروج',
      upcomingBookings: 'حجوزات قادمة', favoriteItems: 'أصناف مفضلة', totalBookings: 'إجمالي الحجوزات',
      yourVisits: 'زياراتك', reservationsTitle: 'حجوزات الطاولات', newBooking: 'حجز جديد ←',
      saveForLater: 'احتفظ بها', favoritesTitle: 'أصنافك المفضلة', viewMenu: 'تصفح المنيو ←',
      favoritesEmpty: 'لسه ما أضفتش أصناف للمفضلة. اختار من القائمة بالأسفل.',
      discoverMore: 'اكتشف المزيد', suggestionsTitle: 'أصناف من المنيو',
      catalogEmpty: 'لا توجد أصناف متاحة للعرض حاليًا.', yourDetails: 'تفاصيلك',
      profileTitle: 'بيانات الحساب', nameLabel: 'الاسم',
      whatsappPreference: 'أوافق على تلقي عروض تسويقية من ZORONA عبر WhatsApp. الموافقة اختيارية ويمكن إلغاؤها في أي وقت.',
      consentHelp: 'التسويق عبر واتساب فقط. يمكنك إلغاء الموافقة في أي وقت، ولن نرسل عروضًا تسويقية عبر SMS.',
      saveProfile: 'حفظ الاسم', savePreferences: 'حفظ تفضيلات الرسائل', addFavorite: 'أضف للمفضلة', removeFavorite: 'إزالة من المفضلة',
      noReservations: 'ما عندكش حجوزات مسجلة حتى الآن.', reservation: 'حجز', guests: 'أشخاص',
      pending: 'قيد المراجعة', confirmed: 'مؤكد', cancelled: 'ملغي',
      otpNotConfigured: 'صفحة الحساب جاهزة، لكن تسجيل الدخول لم يُفعّل بعد. يلزم إعداد خدمة Twilio Verify لإرسال كود الهاتف.',
      signedOut: 'تم تسجيل الخروج بأمان.', profileSaved: 'تم حفظ الاسم.',
      error: 'تعذر إكمال الطلب الآن. حاول مرة أخرى.', loading: 'جارٍ تحميل حسابك…',
      enterPhone: 'اكتب رقم الهاتف مع مفتاح الدولة، مثل +971.',
      enterCode: 'أدخل الكود الذي وصلك على الهاتف.',
      signInRequired: 'سجّل الدخول لعرض الحجوزات والمفضلة الخاصة بك.',
      otpSent: 'إذا كان الرقم قادرًا على استقبال الرسائل، فسيصلك كود التحقق.',
      couponKicker: 'امتياز خاص بحسابك', couponTitle: 'قسيمة خصمك', couponDescription: 'قسيمتك محفوظة في حسابك، وهتفضل موجودة حتى لو خرجت ورجعت تسجّل دخول.', couponLoading: 'جارٍ تحميل قسيمتك…', couponRetry: 'إعادة تحميل القسيمة', couponCode: 'كود القسيمة', couponAvailable: 'صالحة للاستخدام', couponUsed: 'تم استخدام القسيمة', couponUseNote: 'اعرض رمز QR للموظف عند طلبك. القسيمة صالحة مرة واحدة فقط.', couponUsedNote: 'تم صرف هذه القسيمة بالفعل، ولا يمكن استخدامها مرة أخرى.', couponLoadError: 'تعذر تحميل القسيمة. حاول مرة أخرى.', couponIssued: 'تاريخ الإصدار', couponQrAlt: 'رمز QR لقسيمة الخصم', campaignCouponsKicker: 'عروض مخصصة ليك', campaignCouponsTitle: 'قسائم وعروض إضافية', campaignCouponsIntro: 'احتفظ بالقسائم المتاحة لحسابك واعرض رمز QR للموظف عند الاستخدام. كل قسيمة تخضع لشروطها الموضحة.', campaignCouponsLoading: 'جارٍ تحميل عروضك…', campaignCouponsEmpty: 'لا توجد قسائم إضافية متاحة لحسابك حاليًا.', campaignCouponsError: 'تعذر تحميل القسائم الإضافية.', campaignCouponsRetry: 'إعادة تحميل القسائم', campaignMinOrder: 'الحد الأدنى للطلب', campaignExpires: 'صالحة حتى', campaignUses: 'عدد الاستخدامات', campaignUnlimited: 'بلا حد', campaignCode: 'كود القسيمة', campaignPublic: 'عرض متاح للعملاء', campaignPersonal: 'قسيمة مخصصة لحسابك',
      saving: 'جارٍ الحفظ…', pricePrefix: 'د.إ'
    },
    en: {
      heroTitle: 'Your account, your next visit',
      heroLead: 'Keep your reservations and favourite dishes in one place.',
      secureAccess: 'Secure access', loginTitle: 'Sign in with your phone number',
      loginLead: 'We will send a one-time verification code to confirm your number.',
      phoneLabel: 'Phone number with country code', sendCode: 'Send verification code',
      codeLabel: 'Verification code', verifyCode: 'Verify and sign in', changePhone: 'Change phone number',
      privacyNote: 'Your reservations are private and appear only after your phone number is verified.',
      welcomeBack: 'Welcome back', hello: 'Hello', logout: 'Sign out',
      upcomingBookings: 'Upcoming bookings', favoriteItems: 'Favourite dishes', totalBookings: 'Total bookings',
      yourVisits: 'Your visits', reservationsTitle: 'Table reservations', newBooking: 'New reservation →',
      saveForLater: 'Saved for later', favoritesTitle: 'Your favourites', viewMenu: 'Browse menu →',
      favoritesEmpty: 'You have not saved any dishes yet. Choose from the menu below.',
      discoverMore: 'Discover more', suggestionsTitle: 'From the menu',
      catalogEmpty: 'No dishes are available right now.', yourDetails: 'Your details',
      profileTitle: 'Account profile', nameLabel: 'Name',
      whatsappPreference: 'I agree to receive marketing offers from ZORONA through WhatsApp. This is optional and can be withdrawn at any time.',
      consentHelp: 'Marketing is via WhatsApp only. You can withdraw consent at any time; we do not send SMS marketing offers.',
      saveProfile: 'Save name', savePreferences: 'Save messaging preferences', addFavorite: 'Add to favourites', removeFavorite: 'Remove favourite',
      noReservations: 'You do not have any reservations yet.', reservation: 'Reservation', guests: 'guests',
      pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled',
      otpNotConfigured: 'Your account page is ready, but phone sign-in is not enabled yet. Configure Twilio Verify to send phone codes.',
      signedOut: 'You have signed out securely.', profileSaved: 'Name saved.',
      error: 'We could not complete this request. Please try again.', loading: 'Loading your account…',
      enterPhone: 'Enter your phone number with country code, such as +971.',
      enterCode: 'Enter the code sent to your phone.',
      signInRequired: 'Sign in to see your private reservations and favourites.',
      otpSent: 'If this number can receive messages, a verification code will arrive shortly.',
      couponKicker: 'A benefit for your account', couponTitle: 'Your discount coupon', couponDescription: 'Your coupon is saved to your account and will still be here when you sign in again.', couponLoading: 'Loading your coupon…', couponRetry: 'Reload coupon', couponCode: 'Coupon code', couponAvailable: 'Ready to use', couponUsed: 'Coupon redeemed', couponUseNote: 'Show this QR code to staff when ordering. This coupon can be used once only.', couponUsedNote: 'This coupon has already been redeemed and cannot be used again.', couponLoadError: 'Could not load your coupon. Please try again.', couponIssued: 'Issued', couponQrAlt: 'Discount coupon QR code', campaignCouponsKicker: 'Offers selected for you', campaignCouponsTitle: 'More coupons and offers', campaignCouponsIntro: 'Keep eligible offers in your account and show their QR code to staff. Each coupon has its own terms.', campaignCouponsLoading: 'Loading your offers…', campaignCouponsEmpty: 'There are no additional coupons available for your account right now.', campaignCouponsError: 'Could not load your additional coupons.', campaignCouponsRetry: 'Reload coupons', campaignMinOrder: 'Minimum order', campaignExpires: 'Valid until', campaignUses: 'Uses', campaignUnlimited: 'Unlimited', campaignCode: 'Coupon code', campaignPublic: 'Offer for customers', campaignPersonal: 'Assigned to your account',
      saving: 'Saving…', pricePrefix: 'AED'
    }
  };

  function t(key) { return strings[language][key] || strings.ar[key] || key; }

  function applyLanguage() {
    language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const value = t(node.dataset.i18n);
      if (value) node.textContent = value;
    });
    document.title = language === 'ar' ? 'حسابي — ZORONA' : 'My Account — ZORONA';
    if (accountData) renderAccount(accountData);
    if (couponPayload) renderAccountCoupon(couponPayload);
    if (campaignCoupons.length) renderCampaignCoupons();
  }

  function setMessage(element, message, kind) {
    element.textContent = message || '';
    element.className = 'account-message' + (kind ? ' is-' + kind : '');
  }

  async function api(url, options) {
    const settings = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    settings.headers = Object.assign({ Accept: 'application/json' }, settings.headers || {});
    if (settings.body && typeof settings.body !== 'string') {
      settings.headers['Content-Type'] = 'application/json';
      settings.body = JSON.stringify(settings.body);
    }
    const response = await fetch(url, settings);
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.message || t('error'));
      error.code = payload.code || '';
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function showLogin(message, kind) {
    dashboard.hidden = true;
    if (loginPanel) loginPanel.hidden = true;
    const notice = $('#account-app-only-notice');
    if (notice) notice.hidden = false;
    if (message && message !== t('loading') && message !== t('signInRequired') && loginMessage) {
      setMessage(loginMessage, message, kind || 'error');
    }
  }

  function showOtpNotConfigured() {
    showLogin(t('otpNotConfigured'), 'warning');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(String(value).slice(0, 10) + 'T12:00:00+04:00');
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai'
    });
  }

  function statusLabel(status) {
    return t(status === 'confirmed' ? 'confirmed' : status === 'cancelled' ? 'cancelled' : 'pending');
  }

  function renderReservations(items) {
    const target = $('#account-reservations');
    target.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'account-empty';
      empty.textContent = t('noReservations');
      target.append(empty);
      return;
    }
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'account-reservation';
      const calendar = document.createElement('div');
      calendar.className = 'account-date-mark';
      const day = document.createElement('strong');
      day.textContent = String(item.date || '—').slice(-2);
      const month = document.createElement('small');
      month.textContent = formatDate(item.date).split(' ').slice(0, 2).join(' ');
      calendar.append(day, month);
      const details = document.createElement('div');
      details.className = 'account-reservation-details';
      const title = document.createElement('h3');
      title.textContent = t('reservation') + ' ' + (item.id || '');
      const meta = document.createElement('p');
      meta.textContent = formatDate(item.date) + ' · ' + (item.time || '—') + ' · ' + Number(item.guests || 0) + ' ' + t('guests');
      details.append(title, meta);
      if (item.notes) {
        const notes = document.createElement('small');
        notes.textContent = item.notes;
        details.append(notes);
      }
      const state = document.createElement('span');
      state.className = 'account-status account-status-' + (item.status || 'pending');
      state.textContent = statusLabel(item.status);
      card.append(calendar, details, state);
      target.append(card);
    });
  }

  function createProductCard(product, favorite, allowToggle) {
    const card = document.createElement('article');
    card.className = 'account-product-card';
    if (product.imageUrl) {
      const image = document.createElement('img');
      image.className = 'account-product-image';
      image.loading = 'lazy';
      image.alt = product.nameAr || product.nameEn || '';
      image.src = product.imageUrl;
      card.append(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'account-product-placeholder';
      placeholder.textContent = 'Z';
      card.append(placeholder);
    }
    const body = document.createElement('div');
    body.className = 'account-product-body';
    const name = document.createElement('h3');
    name.textContent = language === 'ar' ? (product.nameAr || product.nameEn) : (product.nameEn || product.nameAr);
    const price = document.createElement('p');
    price.className = 'account-product-price';
    price.textContent = t('pricePrefix') + ' ' + Number(product.price || 0).toFixed(2);
    body.append(name, price);
    if (allowToggle) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'account-favorite-button' + (favorite ? ' is-saved' : '');
      button.dataset.favoriteId = product.id;
      button.dataset.favoriteState = favorite ? 'true' : 'false';
      button.textContent = favorite ? '♥ ' + t('removeFavorite') : '♡ ' + t('addFavorite');
      body.append(button);
    }
    card.append(body);
    return card;
  }

  function renderProducts() {
    if (!accountData) return;
    const favoriteIds = new Set((accountData.favorites || []).map(item => String(item.id)));
    const favorites = $('#account-favorites');
    favorites.replaceChildren();
    (accountData.favorites || []).forEach(item => favorites.append(createProductCard(item, true, true)));
    $('#favorites-empty').hidden = (accountData.favorites || []).length > 0;

    const catalog = $('#account-catalog');
    catalog.replaceChildren();
    (accountData.catalog || []).forEach(item => {
      catalog.append(createProductCard(item, favoriteIds.has(String(item.id)), true));
    });
    $('#catalog-empty').hidden = (accountData.catalog || []).length > 0;
    $('#favorite-count').textContent = String((accountData.favorites || []).length);
  }


  function renderAccountCoupon(payload) {
    const coupon = payload?.coupon;
    if (!coupon) return;
    const used = Boolean(coupon.redeemedAt);
    const status = $('#account-coupon-status');
    const qrWrap = $('#account-coupon-qr-wrap');
    const qrImage = $('#account-coupon-qr');
    const retry = $('#account-coupon-retry');
    $('#account-coupon-discount').textContent = (language === 'ar' ? 'خصم ' : '') + Number(coupon.discountPercent || 20) + '%' + (language === 'en' ? ' discount' : '');
    $('#account-coupon-code').textContent = coupon.code || '—';
    status.textContent = t(used ? 'couponUsed' : 'couponAvailable');
    status.className = 'account-coupon-status' + (used ? ' is-used' : ' is-available');
    qrImage.alt = t('couponQrAlt');
    if (!used && payload.qrDataUrl) { qrImage.src = payload.qrDataUrl; qrWrap.hidden = false; }
    else { qrImage.removeAttribute('src'); qrWrap.hidden = true; }
    const issued = coupon.issuedAt ? new Date(coupon.issuedAt) : null;
    $('#account-coupon-issued').textContent = issued && !Number.isNaN(issued.getTime())
      ? t('couponIssued') + ': ' + issued.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' })
      : '';
    const message = $('#account-coupon-message');
    message.textContent = t(used ? 'couponUsedNote' : 'couponUseNote');
    message.className = 'account-coupon-message' + (used ? ' is-used' : '');
    retry.hidden = true;
  }

  async function loadAccountCoupon(force = false) {
    if (couponPayload && !force) { renderAccountCoupon(couponPayload); return; }
    if (couponRequest && !force) return couponRequest;
    $('#account-coupon-status').textContent = t('couponLoading');
    $('#account-coupon-message').textContent = '';
    $('#account-coupon-retry').hidden = true;
    couponRequest = (async () => {
      try {
        couponPayload = await api('/api/account/coupon');
        renderAccountCoupon(couponPayload);
      } catch (error) {
        couponPayload = null;
        $('#account-coupon-status').textContent = t('couponLoadError');
        $('#account-coupon-status').className = 'account-coupon-status is-used';
        $('#account-coupon-qr-wrap').hidden = true;
        $('#account-coupon-message').textContent = error.message || t('couponLoadError');
        $('#account-coupon-message').className = 'account-coupon-message is-used';
        $('#account-coupon-retry').hidden = false;
      } finally {
        couponRequest = null;
      }
    })();
    return couponRequest;
  }

  function renderCampaignCoupons() {
    const target = $('#account-campaign-coupons-list');
    if (!target) return;
    target.replaceChildren();
    if (!campaignCoupons.length) {
      const empty = document.createElement('p');
      empty.className = 'account-empty';
      empty.textContent = t('campaignCouponsEmpty');
      target.append(empty);
      return;
    }
    for (const coupon of campaignCoupons) {
      const card = document.createElement('article');
      card.className = 'account-campaign-coupon-card';
      const qr = document.createElement('div');
      qr.className = 'account-campaign-coupon-qr';
      const img = document.createElement('img');
      img.src = coupon.qrDataUrl;
      img.alt = t('couponQrAlt');
      img.loading = 'lazy';
      qr.append(img);

      const details = document.createElement('div');
      details.className = 'account-campaign-coupon-details';
      const title = document.createElement('h3');
      title.textContent = coupon.title || t('campaignPublic');
      const badge = document.createElement('span');
      badge.className = 'account-campaign-coupon-badge';
      badge.textContent = coupon.customerId ? t('campaignPersonal') : t('campaignPublic');
      const discount = document.createElement('strong');
      discount.className = 'account-campaign-coupon-discount';
      discount.textContent = (language === 'ar' ? 'خصم ' : '') + Number(coupon.discountPercent || 0) + '%' + (language === 'en' ? ' off' : '');
      const codeLabel = document.createElement('small');
      codeLabel.textContent = t('campaignCode');
      const code = document.createElement('code');
      code.textContent = coupon.code || '—';
      const terms = document.createElement('div');
      terms.className = 'account-campaign-coupon-terms';
      const minimum = document.createElement('span');
      minimum.textContent = t('campaignMinOrder') + ': ' + Number(coupon.minimumOrderAmount || 0).toFixed(2) + ' ' + (language === 'ar' ? 'د.إ' : 'AED');
      terms.append(minimum);
      if (coupon.expiresAt) {
        const expiry = document.createElement('span');
        const date = new Date(coupon.expiresAt);
        expiry.textContent = t('campaignExpires') + ': ' + (Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' }));
        terms.append(expiry);
      }
      const uses = document.createElement('span');
      uses.textContent = t('campaignUses') + ': ' + Number(coupon.usageCount || 0) + ' / ' + (coupon.maxUses === null ? t('campaignUnlimited') : String(coupon.maxUses));
      terms.append(uses);
      details.append(title, badge, discount, codeLabel, code, terms);
      card.append(qr, details);
      target.append(card);
    }
  }

  async function loadAccountCampaignCoupons(force = false) {
    if (campaignCouponsRequest && !force) return campaignCouponsRequest;
    const target = $('#account-campaign-coupons-list');
    const retry = $('#account-campaign-coupons-retry');
    if (target) target.replaceChildren(Object.assign(document.createElement('p'), { className: 'account-empty', textContent: t('campaignCouponsLoading') }));
    if (retry) retry.hidden = true;
    campaignCouponsRequest = (async () => {
      try {
        const response = await api('/api/account/campaign-coupons');
        campaignCoupons = Array.isArray(response.coupons) ? response.coupons : [];
        if ($('#account-campaign-coupons-message')) $('#account-campaign-coupons-message').textContent = '';
        renderCampaignCoupons();
      } catch (error) {
        campaignCoupons = [];
        if (target) target.replaceChildren();
        if ($('#account-campaign-coupons-message')) $('#account-campaign-coupons-message').textContent = error.message || t('campaignCouponsError');
        if (retry) retry.hidden = false;
      } finally {
        campaignCouponsRequest = null;
      }
    })();
    return campaignCouponsRequest;
  }

  function renderAccount(data) {
    accountData = data;
    if (loginPanel) loginPanel.hidden = true;
    const notice = $('#account-app-only-notice');
    if (notice) notice.hidden = true;
    dashboard.hidden = false;
    $('#customer-name-heading').textContent = data.customer?.name || 'ZORONA';
    $('#customer-phone-heading').textContent = data.customer?.phone || '';
    $('#account-profile-name').value = data.customer?.name || '';
    $('#account-whatsapp-consent').checked = data.customer?.whatsappMarketingConsent === true;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const upcoming = (data.reservations || []).filter(item => item.date >= today && item.status !== 'cancelled');
    $('#upcoming-count').textContent = String(upcoming.length);
    $('#total-booking-count').textContent = String((data.reservations || []).length);
    renderReservations(data.reservations || []);
    renderProducts();
    void loadAccountCoupon();
    void loadAccountCampaignCoupons();
  }

  async function refreshAccount() {
    try {
      const data = await api('/api/account/me');
      renderAccount(data);
    } catch (error) {
      if (error.code === 'NOT_SIGNED_IN' || error.code === 'SESSION_EXPIRED') return showLogin(t('signInRequired'));
      if (error.code === 'NOT_SIGNED_IN' || error.code === 'SESSION_EXPIRED') return showLogin(t('signInRequired'));
      showLogin(error.message || t('error'), 'error');
    }
  }


  $('#account-logout').addEventListener('click', async () => {
    try { await api('/api/account/logout', { method: 'POST', body: {} }); } catch {}
    accountData = null;
    couponPayload = null;
    campaignCoupons = [];
    $('#account-campaign-coupons-list')?.replaceChildren();
    $('#account-coupon-qr-wrap').hidden = true;
    $('#account-coupon-code').textContent = '—';
    showLogin(t('signedOut'), 'success');
  });

  $('#account-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#account-profile-form button[type="submit"]');
    button.disabled = true;
    button.textContent = t('saving');
    setMessage($('#account-profile-message'), '', '');
    try {
      const result = await api('/api/account/profile', {
        method: 'PATCH',
        body: { name: $('#account-profile-name').value.trim() }
      });
      if (accountData) accountData.customer = result.customer;
      $('#customer-name-heading').textContent = result.customer.name;
      setMessage($('#account-profile-message'), t('profileSaved'), 'success');
    } catch (error) {
      setMessage($('#account-profile-message'), error.message || t('error'), 'error');
    } finally {
      button.disabled = false;
      button.textContent = t('saveProfile');
    }
  });

  $('#account-consent-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#account-consent-form button[type="submit"]');
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = t('saving');
    setMessage($('#account-consent-message'), '', '');
    try {
      const result = await api('/api/account/marketing-preferences', {
        method: 'PATCH',
        body: {
          whatsapp: $('#account-whatsapp-consent').checked,
          language
        }
      });
      if (accountData) accountData.customer = result.customer;
      setMessage($('#account-consent-message'), language === 'ar' ? 'تم حفظ تفضيلات الرسائل.' : 'Messaging preferences saved.', 'success');
    } catch (error) {
      setMessage($('#account-consent-message'), error.message || t('error'), 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel || t('savePreferences');
    }
  });

  async function toggleFavorite(button) {
    const productId = button.dataset.favoriteId;
    const willEnable = button.dataset.favoriteState !== 'true';
    button.disabled = true;
    try {
      await api('/api/account/favorites', {
        method: 'POST',
        body: { productId, enabled: willEnable }
      });
      const data = await api('/api/account/me');
      renderAccount(data);
    } catch (error) {
      setMessage($('#account-profile-message'), error.message || t('error'), 'error');
    } finally {
      button.disabled = false;
    }
  }

  $('#account-coupon-retry')?.addEventListener('click', () => void loadAccountCoupon(true));
  $('#account-campaign-coupons-retry')?.addEventListener('click', () => void loadAccountCampaignCoupons(true));

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-favorite-id]');
    if (button) void toggleFavorite(button);
  });

  window.addEventListener('arabisk:language-updated', applyLanguage);
  applyLanguage();
  showLogin();
  void refreshAccount();
})();
