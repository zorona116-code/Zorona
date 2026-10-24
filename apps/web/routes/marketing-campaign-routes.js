import {
  countWhatsAppMarketingRecipients,
  createMarketingCampaign,
  listMarketingCampaigns,
  getMarketingCampaignById,
  prepareMarketingCampaignRecipients,
  claimMarketingCampaignRecipients,
  updateMarketingCampaignRecipient,
  finishMarketingCampaignIfDone
} from '../db.js';

function whatsappConfig() {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  const testRecipientPhone = String(process.env.WHATSAPP_TEST_RECIPIENT_PHONE || '').trim();
  const missing = [];
  if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!/^\d{5,30}$/.test(phoneNumberId)) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!/^v\d+\.\d+$/.test(graphVersion)) missing.push('WHATSAPP_GRAPH_API_VERSION');
  return { accessToken, phoneNumberId, graphVersion, testRecipientPhone, testRecipientConfigured: /^\+[1-9]\d{7,14}$/.test(testRecipientPhone), missing, configured: missing.length === 0 };
}

function publicConfig(config) {
  return {
    configured: config.configured,
    missing: config.missing,
    endpoint: config.configured ? 'WhatsApp Business Platform Cloud API' : null,
    batchSize: 5,
    testRecipientConfigured: config.testRecipientConfigured,
    templateRequirements: 'Approved marketing template with exactly five body variables in this order: customer name, offer title, discount percent, coupon code, expiry date.'
  };
}

function campaignError(res, error, fallback) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  return res.status(status).json({
    code: error?.code || 'MARKETING_CAMPAIGN_ERROR',
    message: status < 500 ? error.message : fallback
  });
}

function firstName(name) {
  const value = String(name || '').trim().replace(/\s+/g, ' ');
  return (value.split(' ')[0] || 'عميلنا').slice(0, 80);
}

function expiryLabel(value) {
  if (!value) return 'حتى نفاد الكمية';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'حتى نفاد الكمية';
  return date.toLocaleDateString('ar-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

async function sendWhatsAppTemplate(config, campaign, recipient) {
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(recipient.phone || '').replace(/\D/g, ''),
    type: 'template',
    template: {
      name: campaign.templateName,
      language: { code: campaign.languageCode },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: firstName(recipient.customerName) },
          { type: 'text', text: String(campaign.couponTitle || '').slice(0, 1000) },
          { type: 'text', text: String(campaign.couponDiscountPercent) },
          { type: 'text', text: String(campaign.couponCode || '').slice(0, 1000) },
          { type: 'text', text: expiryLabel(campaign.couponExpiresAt) }
        ]
      }]
    }
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const providerError = payload?.error || {};
    const error = new Error(String(providerError.message || 'WhatsApp rejected this message.').slice(0, 450));
    error.code = String(providerError.code || response.status).slice(0, 80);
    throw error;
  }
  return String(payload?.messages?.[0]?.id || '');
}

export function registerMarketingCampaignRoutes(app, { requireAdminApiKey }) {
  app.get('/api/admin/marketing/config', requireAdminApiKey, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(publicConfig(whatsappConfig()));
  });

  app.get('/api/admin/marketing/audience', requireAdminApiKey, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return res.json({ eligibleCount: await countWhatsAppMarketingRecipients() });
    } catch {
      return res.status(503).json({ code: 'AUDIENCE_COUNT_FAILED', message: 'تعذر حساب العملاء الموافقين على التسويق.' });
    }
  });

  app.get('/api/admin/marketing/campaigns', requireAdminApiKey, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return res.json({ campaigns: await listMarketingCampaigns(100) });
    } catch {
      return res.status(503).json({ code: 'MARKETING_CAMPAIGNS_LIST_FAILED', message: 'تعذر تحميل سجل الحملات.' });
    }
  });

  app.post('/api/admin/marketing/campaigns', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const campaign = await createMarketingCampaign({
        title: req.body?.title,
        templateName: req.body?.templateName,
        languageCode: req.body?.languageCode,
        couponCampaignId: req.body?.couponCampaignId,
        createdBy: 'admin'
      });
      return res.status(201).json({ ok: true, campaign });
    } catch (error) {
      return campaignError(res, error, 'تعذر حفظ الحملة الآن.');
    }
  });


  app.post('/api/admin/marketing/campaigns/:id/send-test', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ code: 'INVALID_MARKETING_CAMPAIGN_ID', message: 'رقم الحملة غير صالح.' });
    }
    const config = whatsappConfig();
    if (!config.configured) {
      return res.status(503).json({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'الإرسال التجريبي غير جاهز حتى تكتمل إعدادات واتساب الرسمية.', missing: config.missing });
    }
    if (!config.testRecipientConfigured) {
      return res.status(503).json({ code: 'WHATSAPP_TEST_RECIPIENT_NOT_CONFIGURED', message: 'أضف رقم الاختبار الذي تملكه أو لديك تصريح صريح باستخدامه في WHATSAPP_TEST_RECIPIENT_PHONE داخل Render.' });
    }
    try {
      const campaign = await getMarketingCampaignById(id);
      if (!campaign) return res.status(404).json({ code: 'MARKETING_CAMPAIGN_NOT_FOUND', message: 'الحملة غير موجودة.' });
      if (campaign.status !== 'draft') {
        return res.status(409).json({ code: 'MARKETING_TEST_ONLY_DRAFT', message: 'الإرسال التجريبي متاح للمسودات فقط.' });
      }
      if (!campaign.couponEnabled || campaign.couponCustomerId !== null ||
          (campaign.couponExpiresAt && new Date(campaign.couponExpiresAt).getTime() <= Date.now())) {
        return res.status(409).json({ code: 'MARKETING_COUPON_UNAVAILABLE', message: 'القسيمة المرتبطة بالحملة ليست عامة ومفعّلة وصالحة.' });
      }
      await sendWhatsAppTemplate(config, campaign, { phone: config.testRecipientPhone, customerName: 'اختبار' });
      return res.json({ ok: true, message: 'قبلت واجهة واتساب طلب الرسالة التجريبية إلى رقم الاختبار المضبوط في Render.' });
    } catch (error) {
      return campaignError(res, error, 'تعذر إرسال الرسالة التجريبية. تحقق من اعتماد القالب ولغته وترتيب المتغيرات.');
    }
  });

  app.post('/api/admin/marketing/campaigns/:id/send-batch', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ code: 'INVALID_MARKETING_CAMPAIGN_ID', message: 'رقم الحملة غير صالح.' });
    }
    const config = whatsappConfig();
    if (!config.configured) {
      return res.status(503).json({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'الإرسال الفعلي غير جاهز. أضف إعدادات WhatsApp Business Platform المطلوبة في Render أولًا.',
        missing: config.missing
      });
    }
    try {
      let campaign = await getMarketingCampaignById(id);
      if (!campaign) return res.status(404).json({ code: 'MARKETING_CAMPAIGN_NOT_FOUND', message: 'الحملة غير موجودة.' });
      if (!campaign.couponEnabled || campaign.couponCustomerId !== null ||
          (campaign.couponExpiresAt && new Date(campaign.couponExpiresAt).getTime() <= Date.now())) {
        return res.status(409).json({ code: 'MARKETING_COUPON_UNAVAILABLE', message: 'القسيمة المرتبطة بالحملة ليست عامة ومفعّلة وصالحة.' });
      }
      if (campaign.status === 'draft') {
        const prepared = await prepareMarketingCampaignRecipients(id);
        if (prepared.status === 'no_recipients') {
          return res.status(409).json({ code: 'NO_ELIGIBLE_RECIPIENTS', message: 'لا يوجد عملاء حاليًا وافقوا على استقبال عروض واتساب.' });
        }
        if (prepared.status === 'coupon_unavailable') {
          return res.status(409).json({ code: 'MARKETING_COUPON_UNAVAILABLE', message: 'القسيمة المرتبطة بالحملة لم تعد صالحة.' });
        }
        if (prepared.status === 'not_found') {
          return res.status(404).json({ code: 'MARKETING_CAMPAIGN_NOT_FOUND', message: 'الحملة غير موجودة.' });
        }
        campaign = await getMarketingCampaignById(id);
      }
      if (!['sending'].includes(campaign.status)) {
        return res.status(409).json({ code: 'MARKETING_CAMPAIGN_NOT_SENDABLE', message: 'هذه الحملة ليست في حالة تسمح باستكمال الإرسال.' });
      }
      const recipients = await claimMarketingCampaignRecipients(id, 5);
      if (!recipients.length) {
        campaign = await finishMarketingCampaignIfDone(id);
        return res.json({ ok: true, batchSize: 0, campaign, done: campaign?.pendingCount === 0 });
      }
      const results = await Promise.all(recipients.map(async recipient => {
        try {
          const providerMessageId = await sendWhatsAppTemplate(config, campaign, recipient);
          await updateMarketingCampaignRecipient(recipient.id, 'sent', { providerMessageId });
          return { status: 'sent' };
        } catch (error) {
          await updateMarketingCampaignRecipient(recipient.id, 'failed', {
            errorCode: error?.code || 'WHATSAPP_SEND_FAILED',
            errorMessage: String(error?.message || 'WhatsApp send failed').slice(0, 450)
          });
          return { status: 'failed' };
        }
      }));
      campaign = await finishMarketingCampaignIfDone(id);
      return res.json({
        ok: true,
        batchSize: recipients.length,
        batchSent: results.filter(result => result.status === 'sent').length,
        batchFailed: results.filter(result => result.status === 'failed').length,
        campaign,
        done: campaign?.pendingCount === 0
      });
    } catch (error) {
      return campaignError(res, error, 'تعذر تنفيذ دفعة الإرسال. لم يتم تأكيد اكتمال الحملة.');
    }
  });
}
