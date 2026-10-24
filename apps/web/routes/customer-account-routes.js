import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
import { normalizePhone } from '../utils/phone.js';
import {
  createCustomerAccountSession,
  registerCustomerAccount,
  getCustomerAccountPasswordHash,
  createSessionForCustomer,
  getCustomerAccountFromSession,
  listCustomerFavoriteIds,
  revokeCustomerAccountSession,
  setCustomerFavorite,
  setCustomerMarketingConsent,
  updateCustomerAccountName
} from '../db.js';

const COOKIE_NAME = '__Host-zorona_account_session';
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function readSessionToken(req) {
  const cookieHeader = String(req.headers.cookie || '');
  const entry = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE_NAME + '='));
  return entry ? entry.slice(COOKIE_NAME.length + 1) : '';
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + token + '; Path=/; Max-Age=' + SESSION_MAX_AGE_SECONDS + '; HttpOnly; Secure; SameSite=Lax');
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) {
    if (req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ code: 'CROSS_ORIGIN_BLOCKED', message: 'الطلب غير مسموح من موقع آخر.' });
    }
    return next();
  }
  try {
    if (new URL(origin).host.toLowerCase() !== String(req.get('host') || '').toLowerCase()) {
      return res.status(403).json({ code: 'CROSS_ORIGIN_BLOCKED', message: 'الطلب غير مسموح من موقع آخر.' });
    }
  } catch {
    return res.status(403).json({ code: 'INVALID_ORIGIN', message: 'مصدر الطلب غير صالح.' });
  }
  return next();
}

function getTwilioConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    serviceSid: String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim()
  };
}

function otpConfigured(config) {
  return Boolean(config.accountSid && config.authToken && /^VA[0-9a-fA-F]{32}$/.test(config.serviceSid));
}

async function twilioVerifyRequest(config, resource, formValues) {
  const endpoint = 'https://verify.twilio.com/v2/Services/' + config.serviceSid + '/' + resource;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(config.accountSid + ':' + config.authToken).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams(formValues),
    signal: AbortSignal.timeout(10000)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, payload };
}

function publicCustomer(customer) {
  return {
    id: Number(customer.id),
    name: customer.name,
    phone: customer.phone,
    smsMarketingConsent: customer.sms_marketing_consent === true,
    whatsappMarketingConsent: customer.whatsapp_marketing_consent === true,
    firstSeenAt: customer.first_seen_at,
    lastSeenAt: customer.last_seen_at
  };
}

function safeProduct(product) {
  return {
    id: String(product.id),
    categoryId: String(product.categoryId || ''),
    nameAr: String(product.nameAr || ''),
    nameEn: String(product.nameEn || ''),
    descriptionAr: String(product.descriptionAr || ''),
    price: Number(product.price || 0),
    imageUrl: String(product.imageUrl || ''),
    available: product.available !== false
  };
}

function publicReservation(reservation) {
  return {
    id: String(reservation.id),
    name: String(reservation.name || ''),
    date: String(reservation.date || ''),
    time: String(reservation.time || ''),
    guests: Number(reservation.guests || 0),
    notes: String(reservation.notes || ''),
    status: String(reservation.status || 'pending'),
    createdAt: reservation.createdAt || null
  };
}


async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return salt + ':' + Buffer.from(derived).toString('hex');
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const derived = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function registerCustomerAccountRoutes(app, {
  reservations,
  products,
  otpStartRateLimit,
  otpPhoneRateLimit,
  otpVerifyRateLimit
}) {
  const configured = () => otpConfigured(getTwilioConfig());
  app.post('/api/account/register', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    if (name.length < 2) return res.status(400).json({ code: 'INVALID_NAME', message: 'اكتب الاسم كاملًا.' });
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return res.status(400).json({ code: 'INVALID_PHONE', message: 'اكتب رقم الهاتف مع مفتاح الدولة مثل +971.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ code: 'INVALID_PASSWORD', message: 'كلمة السر لازم تكون 8 أحرف على الأقل.' });
    if (req.body?.whatsappMarketingConsent !== true) {
      return res.status(400).json({
        code: 'WHATSAPP_CONSENT_REQUIRED',
        message: 'لازم توافق على تلقي رسائل وعروض ZORONA عبر واتساب لإتمام التسجيل.'
      });
    }
    try {
      const passwordHash = await hashPassword(password);
      const token = randomBytes(32).toString('base64url');
      const consentLanguage = req.body?.consentLanguage === 'en' ? 'en' : 'ar';
      const customer = await registerCustomerAccount(name, phone, passwordHash, token, true, consentLanguage);
      setSessionCookie(res, token);
      return res.status(201).json({ ok: true, customer: publicCustomer(customer) });
    } catch (error) {
      if (error.code === 'PHONE_ALREADY_REGISTERED') return res.status(409).json({ code: error.code, message: 'رقم الهاتف مسجل بالفعل. جرّب تسجيل الدخول.' });
      return res.status(503).json({ code: 'REGISTER_FAILED', message: 'تعذر إنشاء الحساب الآن. تأكد من اتصال الموقع بقاعدة البيانات.' });
    }
  });

  app.post('/api/account/login', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !password || password.length > 128) {
      return res.status(400).json({ code: 'INVALID_LOGIN', message: 'اكتب رقم الهاتف وكلمة السر.' });
    }
    try {
      const account = await getCustomerAccountPasswordHash(phone);
      const valid = account && await verifyPassword(password, account.password_hash);
      if (!valid) return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'رقم الهاتف أو كلمة السر غير صحيحة.' });
      const token = randomBytes(32).toString('base64url');
      const customer = await createSessionForCustomer(account.id, token);
      setSessionCookie(res, token);
      return res.json({ ok: true, customer: publicCustomer(customer) });
    } catch {
      return res.status(503).json({ code: 'LOGIN_FAILED', message: 'تعذر تسجيل الدخول الآن. حاول مرة أخرى.' });
    }
  });



  app.post('/api/account/otp/start', requireSameOrigin, otpStartRateLimit, otpPhoneRateLimit, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const config = getTwilioConfig();
    if (!otpConfigured(config)) {
      return res.status(503).json({
        code: 'OTP_NOT_CONFIGURED',
        message: 'تسجيل الدخول برقم الهاتف لم يُفعّل بعد. يحتاج إلى إعداد خدمة Twilio Verify على الخادم.'
      });
    }
    const phone = normalizePhone(req.body?.phone);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return res.status(400).json({ code: 'INVALID_PHONE', message: 'اكتب رقم هاتف صحيحًا مع مفتاح الدولة.' });
    }

    try {
      const result = await twilioVerifyRequest(config, 'Verifications', { To: phone, Channel: 'sms' });
      if (!result.ok) {
        const errorCode = Number(result.payload?.code || 0);
        if (result.status === 429 || errorCode === 60203) {
          return res.status(429).json({ code: 'OTP_RATE_LIMITED', message: 'تم طلب أكواد كثيرة. انتظر قليلًا ثم حاول مرة أخرى.' });
        }
        return res.status(502).json({ code: 'OTP_SEND_FAILED', message: 'تعذر إرسال كود التحقق إلى هذا الرقم. راجع الرقم وحاول مرة أخرى.' });
      }
      return res.json({ ok: true, message: 'أرسلنا كود التحقق إذا كان الرقم قادرًا على استقبال الرسائل.' });
    } catch {
      return res.status(502).json({ code: 'OTP_PROVIDER_UNAVAILABLE', message: 'خدمة إرسال كود التحقق غير متاحة مؤقتًا. حاول مرة أخرى.' });
    }
  });

  app.post('/api/account/otp/verify', requireSameOrigin, otpVerifyRateLimit, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const config = getTwilioConfig();
    if (!otpConfigured(config)) {
      return res.status(503).json({
        code: 'OTP_NOT_CONFIGURED',
        message: 'تسجيل الدخول برقم الهاتف لم يُفعّل بعد. يحتاج إلى إعداد خدمة Twilio Verify على الخادم.'
      });
    }
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{4,10}$/.test(code)) {
      return res.status(400).json({ code: 'INVALID_VERIFICATION_INPUT', message: 'تأكد من رقم الهاتف وكود التحقق.' });
    }

    try {
      const result = await twilioVerifyRequest(config, 'VerificationCheck', { To: phone, Code: code });
      if (!result.ok || result.payload?.status !== 'approved') {
        const status = result.status === 429 ? 429 : 400;
        return res.status(status).json({ code: 'INVALID_OTP', message: 'الكود غير صحيح أو انتهت صلاحيته. اطلب كودًا جديدًا وحاول مرة أخرى.' });
      }

      const token = randomBytes(32).toString('base64url');
      const customer = await createCustomerAccountSession(phone, token);
      setSessionCookie(res, token);
      return res.json({ ok: true, customer: publicCustomer(customer) });
    } catch {
      return res.status(503).json({ code: 'ACCOUNT_SESSION_FAILED', message: 'تم التحقق من الرقم، لكن تعذر إنشاء الجلسة. حاول مرة أخرى.' });
    }
  });

  app.get('/api/account/me', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readSessionToken(req);
    if (!token) return res.status(401).json({ code: 'NOT_SIGNED_IN', message: 'سجّل الدخول لعرض حسابك.' });
    try {
      const customer = await getCustomerAccountFromSession(token);
      if (!customer) {
        clearSessionCookie(res);
        return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' });
      }

      const phone = customer.phone;
      const accountCreatedAt = customer.account_created_at ? new Date(customer.account_created_at).getTime() : 0;
      const customerReservations = reservations.all()
        .filter(item => normalizePhone(item.phone) === phone)
        .filter(item => {
          if (!accountCreatedAt) return true;
          const reservationCreatedAt = new Date(item.createdAt || item.created_at || 0).getTime();
          return Number.isFinite(reservationCreatedAt) && reservationCreatedAt >= accountCreatedAt;
        })
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map(publicReservation);
      const favoriteIds = await listCustomerFavoriteIds(customer.id);
      const favorites = favoriteIds
        .map(id => products.findById(id))
        .filter(item => item && item.available !== false)
        .map(safeProduct);
      const catalog = products.all().filter(item => item.available !== false).map(safeProduct);

      return res.json({
        ok: true,
        customer: publicCustomer(customer),
        reservations: customerReservations,
        favorites,
        catalog
      });
    } catch {
      return res.status(503).json({ code: 'ACCOUNT_LOAD_FAILED', message: 'تعذر تحميل بيانات حسابك الآن. حاول مرة أخرى.' });
    }
  });

  app.patch('/api/account/profile', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readSessionToken(req);
    if (!token) return res.status(401).json({ code: 'NOT_SIGNED_IN', message: 'سجّل الدخول أولًا.' });
    try {
      const customer = await getCustomerAccountFromSession(token);
      if (!customer) {
        clearSessionCookie(res);
        return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' });
      }
      const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!name) return res.status(400).json({ code: 'INVALID_NAME', message: 'اكتب اسمًا صحيحًا.' });
      const updated = await updateCustomerAccountName(customer.id, name);
      if (!updated) return res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'لم يتم العثور على الحساب.' });
      return res.json({ ok: true, customer: publicCustomer(updated) });
    } catch {
      return res.status(503).json({ code: 'PROFILE_UPDATE_FAILED', message: 'تعذر حفظ الاسم حاليًا.' });
    }
  });

  app.post('/api/account/favorites', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readSessionToken(req);
    if (!token) return res.status(401).json({ code: 'NOT_SIGNED_IN', message: 'سجّل الدخول أولًا.' });
    try {
      const customer = await getCustomerAccountFromSession(token);
      if (!customer) {
        clearSessionCookie(res);
        return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' });
      }
      const productId = String(req.body?.productId || '').trim().slice(0, 80);
      const enabled = req.body?.enabled !== false;
      const product = products.findById(productId);
      if (!product || product.available === false) {
        return res.status(404).json({ code: 'PRODUCT_NOT_FOUND', message: 'الصنف غير متاح للإضافة للمفضلة.' });
      }
      await setCustomerFavorite(customer.id, productId, enabled);
      return res.json({ ok: true, favoriteIds: await listCustomerFavoriteIds(customer.id) });
    } catch {
      return res.status(503).json({ code: 'FAVORITE_SAVE_FAILED', message: 'تعذر حفظ المفضلة الآن.' });
    }
  });

  app.patch('/api/account/marketing-preferences', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = readSessionToken(req);
    if (!token) return res.status(401).json({ code: 'NOT_SIGNED_IN', message: 'سجّل الدخول أولًا.' });
    if (typeof req.body?.whatsapp !== 'boolean') {
      return res.status(400).json({ code: 'INVALID_PREFERENCES', message: 'حدد تفضيل رسائل واتساب.' });
    }
    try {
      const customer = await getCustomerAccountFromSession(token);
      if (!customer) {
        clearSessionCookie(res);
        return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' });
      }
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      await setCustomerMarketingConsent(customer.id, 'sms', false, language);
      const updated = await setCustomerMarketingConsent(customer.id, 'whatsapp', req.body.whatsapp, language);
      return res.json({ ok: true, customer: publicCustomer(updated || customer) });
    } catch {
      return res.status(503).json({ code: 'PREFERENCES_SAVE_FAILED', message: 'تعذر حفظ تفضيلات الرسائل الآن.' });
    }
  });

  app.post('/api/account/logout', requireSameOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await revokeCustomerAccountSession(readSessionToken(req));
    } catch {}
    clearSessionCookie(res);
    return res.json({ ok: true });
  });
}
