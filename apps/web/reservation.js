(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  const strings = {
    ar: {
      title: 'احجز طاولتك',
      lead: 'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.',
      name: 'الاسم', phone: 'رقم الهاتف', date: 'التاريخ', time: 'الوقت', guests: 'عدد الأشخاص', notes: 'ملاحظات',
      notesPlaceholder: 'مثلاً: طاولة داخلية، مناسبة خاصة…',
      submit: 'إرسال طلب الحجز',
      success: 'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.',
      error: 'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.',
      offline: 'الحجز يحتاج إلى اتصال بالإنترنت. أعد المحاولة عند عودة الاتصال.',
      pageTitle: 'حجز طاولة — ZORONA'
    },
    en: {
      title: 'Book Your Table',
      lead: 'Choose the date, time and number of guests. We will contact you to confirm your reservation.',
      name: 'Name', phone: 'Phone number', date: 'Date', time: 'Time', guests: 'Guests', notes: 'Notes',
      notesPlaceholder: 'e.g. indoor table, special occasion…',
      submit: 'Send reservation request',
      success: 'Your reservation request was received. We will contact you to confirm.',
      error: 'Unable to submit the reservation right now. Please try again.',
      offline: 'Reservations require an internet connection. Please try again when you are back online.',
      pageTitle: 'Book a Table — ZORONA'
    }
  };

  let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';
  let fingerprint = '';
  let idempotencyKey = '';

  const newKey = () => {
    try { return crypto.randomUUID(); } catch { return 'reservation-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  };
  const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function applyLanguage() {
    language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';
    const dict = strings[language];
    document.title = dict.pageTitle;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = dict[node.dataset.i18n] ?? node.textContent; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = dict[node.dataset.i18nPlaceholder] ?? node.placeholder; });
  }

  function syncConnectivity() {
    const button = $('#reservation-form button[type="submit"]');
    const message = $('#reservation-message');
    const offline = navigator.onLine === false;
    if (button) button.disabled = offline;
    if (offline && message && !message.textContent.trim()) message.textContent = strings[language].offline;
    else if (!offline && message?.textContent === strings[language].offline) message.textContent = '';
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('#reservation-message');
    const button = form.querySelector('button[type="submit"]');
    const dict = strings[language];
    if (navigator.onLine === false) { message.textContent = dict.offline; return; }
    message.textContent = '';
    button.disabled = true;
    try {
      const payload = {
        name: $('#reservation-name').value,
        phone: $('#reservation-phone').value,
        date: $('#reservation-date').value,
        time: $('#reservation-time').value,
        guests: Number($('#reservation-guests').value || 0),
        notes: $('#reservation-notes').value
      };
      const current = JSON.stringify(payload);
      if (current !== fingerprint || !idempotencyKey) { fingerprint = current; idempotencyKey = newKey(); }
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey })
      });
      if (!response.ok) throw new Error('reservation request failed');
      message.textContent = dict.success;
      form.reset();
      $('#reservation-guests').value = '2';
      fingerprint = '';
      idempotencyKey = '';
      $('#reservation-date').min = localToday();
    } catch (error) {
      console.error('ZORONA reservation error:', error);
      message.textContent = dict.error;
    } finally {
      button.disabled = navigator.onLine === false;
    }
  }

  const guests = $('#reservation-guests');
  for (let count = 1; count <= 20; count += 1) guests.add(new Option(String(count), String(count), count === 2, count === 2));
  $('#reservation-date').min = localToday();
  $('#reservation-form').addEventListener('submit', submit);
  window.addEventListener('online', syncConnectivity);
  window.addEventListener('offline', syncConnectivity);
  window.addEventListener('arabisk:language-updated', () => { applyLanguage(); syncConnectivity(); });
  applyLanguage();
  syncConnectivity();
})();
