import QRCode from 'qrcode';
import {
  getCustomerAccountFromSession,
  getOrCreateCustomerAppCoupon,
  getCustomerAppCouponByCode,
  listCustomerAppCoupons,
  redeemCustomerAppCoupon
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
    id: coupon.id,
    code: coupon.code,
    discountPercent: coupon.discountPercent,
    issuedAt: coupon.issuedAt,
    redeemedAt: coupon.redeemedAt,
    redeemedBy: coupon.redeemedBy,
    customerName: coupon.customerName,
    customerPhone: coupon.customerPhone
  };
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
      let qrDataUrl = '';
      if (!coupon.redeemedAt) {
        qrDataUrl = await QRCode.toDataURL(coupon.code, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
          color: { dark: '#17130f', light: '#ffffff' }
        });
      }

      return res.json({
        coupon: presentCoupon(coupon),
        qrDataUrl
      });
    } catch (error) {
      return res.status(503).json({
        code: 'COUPON_UNAVAILABLE',
        message: 'تعذر تحميل قسيمة الخصم الآن. حاول مرة أخرى.'
      });
    }
  });

  app.get('/api/admin/coupons/lookup', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = String(req.query?.code || '').trim();
    if (!COUPON_CODE_PATTERN.test(code)) {
      return res.status(400).json({ code: 'INVALID_COUPON_CODE', message: 'كود القسيمة غير صالح.' });
    }
    try {
      const coupon = await getCustomerAppCouponByCode(code);
      if (!coupon) {
        return res.status(404).json({ code: 'COUPON_NOT_FOUND', message: 'لم يتم العثور على قسيمة بهذا الكود.' });
      }
      return res.json({
        coupon: presentCoupon(coupon),
        redeemable: !coupon.redeemedAt
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
      const result = await redeemCustomerAppCoupon(code, 'admin');
      if (result.status === 'not_found') {
        return res.status(404).json({ code: 'COUPON_NOT_FOUND', message: 'لم يتم العثور على قسيمة بهذا الكود.' });
      }
      if (result.status === 'already_redeemed') {
        return res.status(409).json({
          code: 'COUPON_ALREADY_REDEEMED',
          message: 'تم استخدام هذه القسيمة من قبل ولا يمكن استخدامها مرة أخرى.',
          coupon: presentCoupon(result.coupon)
        });
      }
      return res.json({ ok: true, coupon: presentCoupon(result.coupon) });
    } catch {
      return res.status(503).json({ code: 'COUPON_REDEEM_FAILED', message: 'تعذر صرف الخصم الآن. حاول مرة أخرى.' });
    }
  });
  app.get('/api/admin/coupons', requireAdminApiKey, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await listCustomerAppCoupons(100);
      return res.json({
        coupons: result.coupons.map(presentCoupon),
        stats: result.stats
      });
    } catch {
      return res.status(503).json({ code: 'COUPON_LIST_FAILED', message: 'تعذر تحميل سجل القسائم الآن.' });
    }
  });

}