import QRCode from 'qrcode';
import { normalizePhone } from '../utils/phone.js';
import {
  getCustomerAccountFromSession,
  getOrCreateCustomerAppCoupon,
  getCustomerAppCouponByCode,
  listCustomerAppCoupons,
  redeemCustomerAppCoupon,
  createCouponCampaign,
  listCouponCampaigns,
  getCouponCampaignByCode,
  setCouponCampaignEnabled,
  redeemCouponCampaign
} from '../db.js';

const ACCOUNT_COOKIE = '__Host-zorona_account_session';
const COUPON_CODE_PATTERN = /^[A-Za-z0-9_-]{30,64}$/;

function readCustomerToken(req) {
  const header = String(req.headers.cookie || '');
  const entry = header.split(';').map(value => value.trim()).find(value => value.startsWith(ACCOUNT_COOKIE + '='));
  return entry ? entry.slice(ACCOUNT_COOKIE.length + 1) : '';
}

function presentCoupon(coupon) {
  return {
    id: coupon.id, code: coupon.code, discountPercent: coupon.discountPercent,
    issuedAt: coupon.issuedAt, redeemedAt: coupon.redeemedAt, redeemedBy: coupon.redeemedBy,
    customerName: coupon.customerName, customerPhone: coupon.customerPhone
  };
}

function presentCampaign(campaign) {
  return {
    id: campaign.id,
    campaignId: campaign.id,
    customerId: campaign.customerId,
    couponKind: 'campaign',
    code: campaign.code,
    title: campaign.title,
    discountPercent: campaign.discountPercent,
    issuedAt: campaign.createdAt,
    redeemedAt: campaign.lastRedeemedAt,
    customerName: campaign.customerName,
    customerPhone: campaign.customerPhone,
    expiresAt: campaign.expiresAt,
    minimumOrderAmount: campaign.minimumOrderAmount,
    maxUses: campaign.maxUses,
    usageCount: campaign.usageCount,
    enabled: campaign.enabled,
    isExpired: campaign.isExpired,
    isExhausted: campaign.isExhausted,
    redeemable: campaign.enabled && !campaign.isExpired && !campaign.isExhausted
  };
}

async function qrDataUrl(code) {
  return QRCode.toDataURL(code, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#17130f', light: '#ffffff' }
  });
}

function readConfiguredDiscount() {
  return 20;
}

export function registerCouponRoutes(app, { requireAdminApiKey }) {
  app.get('/api/account/coupon', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const customer = await getCustomerAccountFromSession(readCustomerToken(req));
      if (!customer) {
        return res.status(401).json({
          code: 'NOT_SIGNED_IN',
          message: 'سجّل الدخول إلى تطبيق ZORONA لعرض قسيمة الخصم.'
        });
      }

      const coupon = await getOrCreateCustomerAppCoupon(customer.id, readConfiguredDiscount());
      const qr = !coupon.redeemedAt ? await qrDataUrl(coupon.code) : '';
      return res.json({ coupon: presentCoupon(coupon), qrDataUrl: qr });
    } catch {
      return res.status(503).json({
        code: 'COUPON_UNAVAILABLE',
        message: 'تعذر تحميل قسيمة الخصم الآن. حاول مرة أخرى.'
      });
    }
  });

  app.get('/api/account/campaign-coupons', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const customer = await getCustomerAccountFromSession(readCustomerToken(req));
      if (!customer) {
        return res.status(401).json({ code: 'NOT_SIGNED_IN', message: 'سجّل الدخول لعرض قسائمك.' });
      }
      const campaigns = await listCouponCampaigns({ customerId: customer.id, includeInactive: false, limit: 100 });
      const coupons = await Promise.all(campaigns.map(async campaign => ({
        ...presentCampaign(campaign),
        qrDataUrl: await qrDataUrl(campaign.code)
      })));
      return res.json({ coupons });
    } catch {
      return res.status(503).json({ code: 'CAMPAIGN_COUPONS_UNAVAILABLE', message: 'تعذر تحميل قسائم العروض الآن.' });
    }
  });

  app.get('/api/admin/coupons/lookup', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = String(req.query?.code || '').trim();
    if (!COUPON_CODE_PATTERN.test(code)) {
      return res.status(400).json({ code: 'INVALID_COUPON_CODE', message: 'كود القسيمة غير صالح.' });
    }
    try {
      const existingCoupon = await getCustomerAppCouponByCode(code);
      if (existingCoupon) {
        return res.json({
          coupon: { ...presentCoupon(existingCoupon), couponKind: 'app' },
          redeemable: !existingCoupon.redeemedAt
        });
      }
      const campaign = await getCouponCampaignByCode(code);
      if (!campaign) {
        return res.status(404).json({ code: 'COUPON_NOT_FOUND', message: 'لم يتم العثور على قسيمة بهذا الكود.' });
      }
      const coupon = presentCampaign(campaign);
      return res.json({
        coupon,
        redeemable: coupon.redeemable,
        reason: !campaign.enabled ? 'disabled' : campaign.isExpired ? 'expired' : campaign.isExhausted ? 'exhausted' : ''
      });
    } catch {
      return res.status(503).json({ code: 'COUPON_LOOKUP_FAILED', message: 'تعذر التحقق من القسيمة الآن.' });
    }
  });

  app.post('/api/admin/coupons/redeem', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = String(req.body?.code || '').trim();
    if (!COUPON_CODE_PATTERN.test(code)) {
      return res.status(400).json({ code: 'INVALID_COUPON_CODE', message: 'كود القسيمة غير صالح.' });
    }
    try {
      const existingCoupon = await getCustomerAppCouponByCode(code);
      if (existingCoupon) {
        const result = await redeemCustomerAppCoupon(code, 'admin');
        if (result.status === 'already_redeemed') {
          return res.status(409).json({
            code: 'COUPON_ALREADY_REDEEMED',
            message: 'تم استخدام هذه القسيمة من قبل ولا يمكن استخدامها مرة أخرى.',
            coupon: { ...presentCoupon(result.coupon), couponKind: 'app' }
          });
        }
        if (result.status === 'not_found') {
          return res.status(404).json({ code: 'COUPON_NOT_FOUND', message: 'لم يتم العثور على القسيمة.' });
        }
        return res.json({ ok: true, coupon: { ...presentCoupon(result.coupon), couponKind: 'app' } });
      }

      const result = await redeemCouponCampaign(code, {
        redeemedBy: 'admin',
        orderTotal: req.body?.orderTotal
      });
      if (result.status === 'not_found') {
        return res.status(404).json({ code: 'COUPON_NOT_FOUND', message: 'لم يتم العثور على قسيمة بهذا الكود.' });
      }
      if (result.status === 'disabled' || result.status === 'expired' || result.status === 'exhausted') {
        const messages = {
          disabled: 'تم إيقاف هذه القسيمة من لوحة التحكم.',
          expired: 'انتهت صلاحية هذه القسيمة.',
          exhausted: 'تم استنفاد عدد مرات الاستخدام المسموح به لهذه القسيمة.'
        };
        return res.status(409).json({ code: 'COUPON_UNAVAILABLE', message: messages[result.status], coupon: presentCampaign(result.coupon) });
      }
      if (result.status === 'minimum_order') {
        return res.status(400).json({
          code: 'MINIMUM_ORDER_NOT_MET',
          message: 'هذه القسيمة تتطلب حدًا أدنى للطلب بقيمة ' + Number(result.minimumOrderAmount || 0).toFixed(2) + ' د.إ. أدخل إجمالي الطلب الصحيح.',
          minimumOrderAmount: result.minimumOrderAmount
        });
      }
      return res.json({ ok: true, coupon: presentCampaign(result.coupon) });
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ code: 'INVALID_ORDER_TOTAL', message: error.message });
      return res.status(503).json({ code: 'COUPON_REDEEM_FAILED', message: 'تعذر صرف الخصم الآن. حاول مرة أخرى.' });
    }
  });

  app.get('/api/admin/coupons', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await listCustomerAppCoupons(100);
      return res.json({ coupons: result.coupons.map(presentCoupon), stats: result.stats });
    } catch {
      return res.status(503).json({ code: 'COUPON_LIST_FAILED', message: 'تعذر تحميل سجل القسائم الآن.' });
    }
  });

  app.get('/api/admin/campaign-coupons', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const campaigns = await listCouponCampaigns({ includeInactive: true, limit: 300 });
      return res.json({ campaigns: campaigns.map(presentCampaign) });
    } catch {
      return res.status(503).json({ code: 'CAMPAIGN_LIST_FAILED', message: 'تعذر تحميل قسائم الحملات.' });
    }
  });

  app.post('/api/admin/campaign-coupons', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const title = String(req.body?.title || '').trim();
    const discountPercent = Number(req.body?.discountPercent);
    const minimumOrderAmount = Number(req.body?.minimumOrderAmount || 0);
    const maxUses = req.body?.maxUses === '' || req.body?.maxUses === null || req.body?.maxUses === undefined
      ? null : Number(req.body.maxUses);
    const targetMode = req.body?.targetMode === 'customer' ? 'customer' : 'public';
    const rawExpiresAt = String(req.body?.expiresAt || '').trim();
    const expiresAt = rawExpiresAt ? new Date(rawExpiresAt) : null;
    if (title.length < 2 || title.length > 100) {
      return res.status(400).json({ code: 'INVALID_COUPON_TITLE', message: 'اكتب اسم القسيمة من حرفين إلى 100 حرف.' });
    }
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) {
      return res.status(400).json({ code: 'INVALID_DISCOUNT', message: 'نسبة الخصم يجب أن تكون من 1 إلى 100%.' });
    }
    if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      return res.status(400).json({ code: 'INVALID_MINIMUM_ORDER', message: 'الحد الأدنى للطلب غير صالح.' });
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) {
      return res.status(400).json({ code: 'INVALID_MAX_USES', message: 'عدد مرات الاستخدام يجب أن يكون 1 على الأقل أو فارغًا بلا حد.' });
    }
    if (rawExpiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
      return res.status(400).json({ code: 'INVALID_EXPIRY', message: 'اختَر تاريخ انتهاء في المستقبل.' });
    }
    let customerPhone = null;
    if (targetMode === 'customer') {
      customerPhone = normalizePhone(req.body?.customerPhone);
      if (!/^\+[1-9]\d{7,14}$/.test(customerPhone)) {
        return res.status(400).json({ code: 'INVALID_CUSTOMER_PHONE', message: 'اكتب رقم العميل مع مفتاح الدولة مثل +971.' });
      }
    }
    try {
      const campaign = await createCouponCampaign({
        title, discountPercent, minimumOrderAmount, maxUses,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        customerPhone,
        createdBy: 'admin'
      });
      return res.status(201).json({ ok: true, campaign: presentCampaign(campaign) });
    } catch (error) {
      if (error.status === 400 || error.status === 404) {
        return res.status(error.status).json({ code: 'CAMPAIGN_VALIDATION_FAILED', message: error.message });
      }
      return res.status(503).json({ code: 'CAMPAIGN_CREATE_FAILED', message: 'تعذر إنشاء القسيمة الآن.' });
    }
  });

  app.patch('/api/admin/campaign-coupons/:id', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ code: 'INVALID_CAMPAIGN_UPDATE', message: 'بيانات تعديل القسيمة غير صالحة.' });
    }
    try {
      const campaign = await setCouponCampaignEnabled(id, req.body.enabled);
      if (!campaign) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND', message: 'لم يتم العثور على القسيمة.' });
      return res.json({ ok: true, campaign: presentCampaign(campaign) });
    } catch {
      return res.status(503).json({ code: 'CAMPAIGN_UPDATE_FAILED', message: 'تعذر تحديث القسيمة.' });
    }
  });
}
