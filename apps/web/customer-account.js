(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const loginPanel = $('#account-login');
  const dashboard = $('#account-dashboard');
  const loginMessage = $('#account-login-message');
  let pendingPhone = '';
  let accountData = null;
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
      profileTitle: 'بيانات الحساب', nameLabel: 'الاسم', smsPreference: 'موافقة رسائل SMS التسويقية',
      whatsappPreference: 'موافقة WhatsApp التسويقية',
      consentHelp: 'إدارة الموافقات من هنا ستتوفر في خطوة لاحقة. يمكنك طلب إيقاف الرسائل من فريق ZORONA في أي وقت.',
      saveProfile: 'حفظ الاسم', addFavorite: 'أضف للمفضلة', removeFavorite: 'إزالة من المفضلة',
      noReservations: 'ما عندكش حجوزات مسجلة حتى الآن.', reservation: 'حجز', guests: 'أشخاص',
      pending: 'قيد المراجعة', confirmed: 'مؤكد', cancelled: 'ملغي',
      otpNotConfigured: 'صفحة الحساب جاهزة، لكن تسجيل الدخول لم يُفعّل بعد. يلزم إعداد خدمة Twilio Verify لإرسال كود الهاتف.',
      signedOut: 'تم تسجيل الخروج بأمان.', profileSaved: 'تم حفظ الاسم.',
      error: 'تعذر إكمال الطلب الآن. حاول مرة أخرى.', loading: 'جارٍ تحميل حسابك…',
      enterPhone: 'اكتب رقم الهاتف مع مفتاح الدولة، مثل +971.',
      enterCode: 'أدخل الكود الذي وصلك على الهاتف.',
      signInRequired: 'سجّل الدخول لعرض الحجوزات والمفضلة الخاصة بك.',
      otpSent: 'إذا كان الرقم قادرًا على استقبال الرسائل، فسيصلك كود التحقق.',
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
      profileTitle: 'Account profile', nameLabel: 'Name', smsPreference: 'Marketing SMS consent',
      whatsappPreference: 'Marketing WhatsApp consent',
      consentHelp: 'Consent management will be available here in a later step. You can ask ZORONA to stop messages at any time.',
      saveProfile: 'Save name', addFavorite: 'Add to favourites', removeFavorite: 'Remove favourite',
      noReservations: 'You do not have any reservations yet.', reservation: 'Reservation', guests: 'guests',
      pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled',
      otpNotConfigured: 'Your account page is ready, but phone sign-in is not enabled yet. Configure Twilio Verify to send phone codes.',
      signedOut: 'You have signed out securely.', profileSaved: 'Name saved.',
      error: 'We could not complete this request. Please try again.', loading: 'Loading your account…',
      enterPhone: 'Enter your phone number with country code, such as +971.',
      enterCode: 'Enter the code sent to your phone.',
      signInRequired: 'Sign in to see your private reservations and favourites.',
      otpSent: 'If this number can receive messages, a verification code will arrive shortly.',
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
    loginPanel.hidden = false;
    if (message !== undefined) setMessage(loginMessage, message, kind);
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

  function renderAccount(data) {
    accountData = data;
    loginPanel.hidden = true;
    dashboard.hidden = false;
    $('#customer-name-heading').textContent = data.customer?.name || 'ZORONA';
    $('#customer-phone-heading').textContent = data.customer?.phone || '';
    $('#account-profile-name').value = data.customer?.name || '';
    $('#account-sms-consent').checked = data.customer?.smsMarketingConsent === true;
    $('#account-whatsapp-consent').checked = data.customer?.whatsappMarketingConsent === true;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const upcoming = (data.reservations || []).filter(item => item.date >= today && item.status !== 'cancelled');
    $('#upcoming-count').textContent = String(upcoming.length);
    $('#total-booking-count').textContent = String((data.reservations || []).length);
    renderReservations(data.reservations || []);
    renderProducts();
  }

  async function refreshAccount() {
    try {
      const data = await api('/api/account/me');
      renderAccount(data);
    } catch (error) {
      if (error.code === 'OTP_NOT_CONFIGURED') return showOtpNotConfigured();
      if (error.code === 'NOT_SIGNED_IN' || error.code === 'SESSION_EXPIRED') return showLogin(t('signInRequired'));
      showLogin(error.message || t('error'), 'error');
    }
  }

  $('#account-phone-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#send-code');
    const phone = $('#account-phone').value.trim();
    if (!phone) return setMessage(loginMessage, t('enterPhone'), 'error');
    button.disabled = true;
    setMessage(loginMessage, '', '');
    try {
      const result = await api('/api/account/otp/start', { method: 'POST', body: { phone } });
      pendingPhone = phone;
      $('#account-phone-form').hidden = true;
      $('#account-code-form').hidden = false;
      $('#account-code-target').textContent = phone;
      $('#account-code').focus();
      setMessage(loginMessage, result.message || t('otpSent'), 'success');
    } catch (error) {
      if (error.code === 'OTP_NOT_CONFIGURED') showOtpNotConfigured();
      else setMessage(loginMessage, error.message || t('error'), error.code === 'OTP_RATE_LIMITED' ? 'warning' : 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#account-code-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#verify-code');
    const code = $('#account-code').value.trim();
    if (!pendingPhone || !code) return setMessage(loginMessage, t('enterCode'), 'error');
    button.disabled = true;
    setMessage(loginMessage, '', '');
    try {
      await api('/api/account/otp/verify', { method: 'POST', body: { phone: pendingPhone, code } });
      $('#account-code').value = '';
      await refreshAccount();
    } catch (error) {
      setMessage(loginMessage, error.message || t('error'), 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#change-phone').addEventListener('click', () => {
    pendingPhone = '';
    $('#account-code-form').hidden = true;
    $('#account-phone-form').hidden = false;
    $('#account-code').value = '';
    setMessage(loginMessage, '', '');
    $('#account-phone').focus();
  });

  $('#account-logout').addEventListener('click', async () => {
    try { await api('/api/account/logout', { method: 'POST', body: {} }); } catch {}
    accountData = null;
    pendingPhone = '';
    $('#account-code-form').hidden = true;
    $('#account-phone-form').hidden = false;
    $('#account-code').value = '';
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

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-favorite-id]');
    if (button) void toggleFavorite(button);
  });

  window.addEventListener('arabisk:language-updated', applyLanguage);
  applyLanguage();
  showLogin(t('loading'));
  void refreshAccount();
})();
