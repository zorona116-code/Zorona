import { request } from './api-client.js';

const $ = selector => document.querySelector(selector);
const state = { configured: false, testRecipientConfigured: false, missing: [], audience: null, coupons: [], campaigns: [] };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-AE', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai'
  });
}

function campaignStatus(status) {
  const values = {
    draft: ['مسودة', 'pending'],
    sending: ['جاري الإرسال', 'pending'],
    completed: ['اكتملت', 'on'],
    partial: ['اكتملت مع أخطاء', 'off']
  };
  return values[status] || ['غير معروف', 'off'];
}

function renderConfig() {
  const status = $('#marketing-config-status');
  const note = $('#marketing-config-note');
  const count = $('#marketing-audience-count');
  if (count) count.textContent = state.audience === null ? '—' : state.audience.toLocaleString('ar-AE');
  if (!status || !note) return;
  if (state.configured) {
    status.textContent = 'جاهز';
    status.className = 'marketing-config-ready';
    note.className = state.testRecipientConfigured ? 'marketing-notice is-ready' : 'marketing-notice is-warning';
    note.textContent = state.testRecipientConfigured
      ? 'اتصال WhatsApp Business Platform مضبوط. الإرسال يتم باستخدام القوالب المعتمدة فقط.'
      : 'الإرسال الفعلي متاح بعد التأكيد. لاختبار القالب أولًا، اضبط رقم اختبار تملكه أو لديك تصريح صريح باستخدامه في WHATSAPP_TEST_RECIPIENT_PHONE داخل Render.';
  } else {
    status.textContent = 'غير مكتمل';
    status.className = 'marketing-config-missing';
    note.className = 'marketing-notice is-warning';
    const missing = state.missing.length ? state.missing.join('، ') : 'إعداد اتصال واتساب الرسمي';
    note.textContent = 'حفظ الحملات متاح، لكن الإرسال متوقف لحين ضبط المتغيرات التالية في Render: ' + missing;
  }
}

function renderCoupons() {
  const select = $('#marketing-coupon');
  if (!select) return;
  const eligible = state.coupons.filter(coupon =>
    coupon.customerId == null &&
    coupon.enabled === true &&
    coupon.isExpired !== true &&
    coupon.isExhausted !== true
  );
  const current = select.value;
  select.innerHTML = '<option value="">اختر قسيمة عامة مفعّلة</option>' + eligible.map(coupon =>
    '<option value="' + Number(coupon.id) + '">' +
    escapeHtml(coupon.title) + ' — خصم ' + Number(coupon.discountPercent) + '% — ' +
    escapeHtml(coupon.code) + '</option>'
  ).join('');
  if (eligible.some(coupon => String(coupon.id) === current)) select.value = current;
  if (!eligible.length) {
    select.innerHTML = '<option value="">لا توجد قسائم عامة صالحة — أنشئ قسيمة من قسم قسائم خصم التطبيق أولًا</option>';
  }
}

function renderCampaigns() {
  const tbody = $('#marketing-campaigns-body');
  const statusNode = $('#marketing-campaign-list-status');
  if (!tbody) return;
  if (!state.campaigns.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">لا توجد حملات حتى الآن. أنشئ أول حملة من النموذج أعلاه.</td></tr>';
    if (statusNode) statusNode.textContent = '0 حملة';
    return;
  }
  tbody.innerHTML = state.campaigns.map(campaign => {
    const status = campaignStatus(campaign.status);
    const canSend = state.configured && campaign.status === 'draft';
    const canContinue = state.configured && campaign.status === 'sending' && Number(campaign.pendingCount) > 0;
    let action = '<span class="marketing-no-action">—</span>';
    if (canSend) action = '<div class="marketing-action-group"><button type="button" class="small-action marketing-test-button" data-marketing-test="' + Number(campaign.id) + '" ' + (state.testRecipientConfigured ? '' : 'disabled title="اضبط رقم الاختبار في Render"') + '>اختبار</button><button type="button" class="small-action marketing-send-button" data-marketing-send="' + Number(campaign.id) + '">إرسال الحملة</button></div>';
    else if (canContinue) action = '<button type="button" class="small-action marketing-send-button" data-marketing-send="' + Number(campaign.id) + '">إرسال الدفعة التالية</button>';
    else if ((campaign.status === 'draft' || campaign.status === 'sending') && !state.configured) {
      action = '<button type="button" class="small-action" disabled title="إعدادات واتساب غير مكتملة">الإرسال غير جاهز</button>';
    }
    return '<tr>' +
      '<td><strong>' + escapeHtml(campaign.title) + '</strong><small>أنشئت في ' + escapeHtml(formatDate(campaign.createdAt)) + '</small></td>' +
      '<td><strong>' + escapeHtml(campaign.couponTitle) + '</strong><small>' + Number(campaign.couponDiscountPercent) + '% · ' + escapeHtml(campaign.couponCode) + '</small></td>' +
      '<td><code dir="ltr">' + escapeHtml(campaign.templateName) + '</code><small>' + escapeHtml(campaign.languageCode) + '</small></td>' +
      '<td>' + Number(campaign.recipientCount).toLocaleString('ar-AE') + '</td>' +
      '<td>' + Number(campaign.sentCount).toLocaleString('ar-AE') + '<small>قُبلت من واتساب</small></td>' +
      '<td>' + (Number(campaign.failedCount) + Number(campaign.skippedCount)).toLocaleString('ar-AE') +
      '<small>فشل ' + Number(campaign.failedCount) + ' · تخطي ' + Number(campaign.skippedCount) + '</small></td>' +
      '<td><span class="status ' + status[1] + '">' + status[0] + '</span>' +
      (Number(campaign.pendingCount) ? '<small>متبقي ' + Number(campaign.pendingCount) + '</small>' : '') + '</td>' +
      '<td class="actions">' + action + '</td>' +
      '</tr>';
  }).join('');
  if (statusNode) statusNode.textContent = state.campaigns.length.toLocaleString('ar-AE') + ' حملة محفوظة';
}

async function loadConfigAndAudience() {
  const results = await Promise.allSettled([
    request('/api/admin/marketing/config'),
    request('/api/admin/marketing/audience')
  ]);
  if (results[0].status === 'fulfilled') {
    state.configured = results[0].value.configured === true;
    state.testRecipientConfigured = results[0].value.testRecipientConfigured === true;
    state.missing = Array.isArray(results[0].value.missing) ? results[0].value.missing : [];
  } else {
    state.configured = false;
    state.testRecipientConfigured = false;
    state.missing = [];
    const note = $('#marketing-config-note');
    if (note) {
      note.className = 'marketing-notice is-warning';
      note.textContent = results[0].reason?.message || 'تعذر التحقق من إعدادات واتساب.';
    }
  }
  state.audience = results[1].status === 'fulfilled'
    ? Number(results[1].value.eligibleCount || 0) : null;
  renderConfig();
}

async function loadCoupons() {
  try {
    const data = await request('/api/admin/campaign-coupons');
    state.coupons = Array.isArray(data.campaigns) ? data.campaigns : [];
    renderCoupons();
  } catch (error) {
    const select = $('#marketing-coupon');
    if (select) select.innerHTML = '<option value="">تعذر تحميل القسائم: ' + escapeHtml(error.message) + '</option>';
  }
}

async function loadCampaigns() {
  const status = $('#marketing-campaign-list-status');
  if (status) status.textContent = 'جارٍ تحميل الحملات…';
  try {
    const data = await request('/api/admin/marketing/campaigns');
    state.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    renderCampaigns();
  } catch (error) {
    if (status) status.textContent = error.message || 'تعذر تحميل الحملات.';
    const tbody = $('#marketing-campaigns-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty">تعذر تحميل سجل الحملات.</td></tr>';
  }
}

async function refresh() {
  await Promise.all([loadConfigAndAudience(), loadCoupons(), loadCampaigns()]);
  renderCampaigns();
}

$('#marketing-refresh')?.addEventListener('click', () => void refresh());

$('#marketing-campaign-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#marketing-create-button');
  const status = $('#marketing-create-status');
  if (button) button.disabled = true;
  if (status) status.textContent = 'جارٍ حفظ الحملة…';
  try {
    const couponCampaignId = Number($('#marketing-coupon').value);
    if (!Number.isSafeInteger(couponCampaignId) || couponCampaignId < 1) {
      throw new Error('اختر قسيمة عامة مفعّلة أولًا.');
    }
    const result = await request('/api/admin/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        title: $('#marketing-title').value.trim(),
        couponCampaignId,
        templateName: $('#marketing-template').value.trim(),
        languageCode: $('#marketing-language').value
      })
    });
    if (status) status.textContent = 'تم حفظ الحملة كمسودة. لم يتم إرسال أي رسالة.';
    $('#marketing-title').value = '';
    await loadCampaigns();
    if (result.campaign?.id) {
      document.querySelector('#marketing-campaigns-body tr')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    if (status) status.textContent = error.message || 'تعذر حفظ الحملة.';
  } finally {
    if (button) button.disabled = false;
  }
});

$('#marketing-campaigns-body')?.addEventListener('click', async event => {
  const testButton = event.target.closest('[data-marketing-test]');
  if (testButton) {
    const testId = Number(testButton.dataset.marketingTest);
    const testCampaign = state.campaigns.find(item => Number(item.id) === testId);
    if (!testCampaign || !state.configured || !state.testRecipientConfigured) {
      alert('اضبط اتصال واتساب الرسمي ورقم الاختبار في Render أولًا.');
      return;
    }
    if (!confirm('سيتم إرسال رسالة اختبار فعلية إلى رقم الاختبار المضبوط في Render، وليس إلى قائمة العملاء. هل تريد المتابعة؟')) return;
    testButton.disabled = true;
    const oldLabel = testButton.textContent;
    testButton.textContent = 'جارٍ الاختبار…';
    try {
      const result = await request('/api/admin/marketing/campaigns/' + testId + '/send-test', {
        method: 'POST', body: JSON.stringify({})
      });
      alert(result.message || 'قبلت واجهة واتساب طلب الاختبار.');
    } catch (error) {
      alert(error.message || 'تعذر إرسال الاختبار. تحقق من القالب المعتمد ولغته ومتغيراته.');
    } finally {
      if (testButton.isConnected) {
        testButton.disabled = false;
        testButton.textContent = oldLabel;
      }
    }
    return;
  }
  const button = event.target.closest('[data-marketing-send]');
  if (!button) return;
  const id = Number(button.dataset.marketingSend);
  const campaign = state.campaigns.find(item => Number(item.id) === id);
  if (!campaign) return;
  if (!state.configured) {
    alert('اضبط اتصال واتساب الرسمي في Render أولًا.');
    return;
  }
  if (campaign.status === 'draft' && !confirm(
    'سيبدأ إرسال حملة "' + campaign.title + '" إلى العملاء الذين وافقوا على استقبال عروض واتساب فقط. سيتم إرسال 5 رسائل كحد أقصى في هذه الدفعة. هل تريد المتابعة؟'
  )) return;
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = 'جارٍ الإرسال…';
  try {
    const result = await request('/api/admin/marketing/campaigns/' + id + '/send-batch', {
      method: 'POST', body: JSON.stringify({})
    });
    const stats = result.campaign || {};
    const successText = result.batchSize
      ? 'انتهت الدفعة: قُبل ' + Number(result.batchSent || 0) + ' وفشل ' + Number(result.batchFailed || 0) +
        '. المتبقي: ' + Number(stats.pendingCount || 0) + '.'
      : (result.done ? 'انتهى الإرسال.' : 'لا توجد رسائل جاهزة في هذه الدفعة.');
    const status = $('#marketing-campaign-list-status');
    if (status) status.textContent = successText;
    await loadCampaigns();
    if (Number(stats.pendingCount || 0) > 0) {
      const row = [...document.querySelectorAll('#marketing-campaigns-body tr')].find(node => node.querySelector('[data-marketing-send="' + id + '"]'));
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    alert(error.message || 'تعذر إرسال الدفعة. راجع الإعدادات وسجل الحملة.');
    await loadCampaigns();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
});

void refresh();
