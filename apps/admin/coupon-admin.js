import { request } from './api-client.js';
import jsQR from 'jsqr';

const $ = selector => document.querySelector(selector);
const video = $('#coupon-camera');
const cameraPlaceholder = $('#coupon-camera-placeholder');
const cameraStart = $('#coupon-camera-start');
const cameraStop = $('#coupon-camera-stop');
const cameraStatus = $('#coupon-camera-status');
const codeForm = $('#coupon-code-form');
const codeInput = $('#coupon-code-input');
const checkButton = $('#coupon-check-button');
const resultPanel = $('#coupon-result');
const redeemButton = $('#coupon-redeem-button');

let currentCoupon = null;
let couponRows = [];
let couponStats = { total: 0, available: 0, redeemed: 0 };
let cameraStream = null;
let scanning = false;
let detector = null;
let scanFrameId = 0;
let lastScanValue = '';
const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-AE', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function setCameraStatus(message, kind = '') {
  cameraStatus.textContent = message || '';
  cameraStatus.className = 'coupon-admin-status' + (kind ? ' is-' + kind : '');
}

function stopCamera() {
  scanning = false;
  if (scanFrameId) cancelAnimationFrame(scanFrameId);
  scanFrameId = 0;
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  if (cameraPlaceholder) cameraPlaceholder.hidden = false;
  if (cameraStart) cameraStart.hidden = false;
  if (cameraStop) cameraStop.hidden = true;
}

function renderCoupon(coupon, message = '') {
  currentCoupon = coupon || null;
  resultPanel.hidden = false;
  if (!coupon) {
    $('#coupon-result-badge').className = 'status off';
    $('#coupon-result-badge').textContent = 'غير صالح';
    $('#coupon-result-discount').textContent = '—';
    $('#coupon-result-name').textContent = '—';
    $('#coupon-result-phone').textContent = '—';
    $('#coupon-result-issued').textContent = '—';
    $('#coupon-result-redeemed').textContent = '—';
    $('#coupon-result-message').textContent = message || 'لم يتم العثور على القسيمة.';
    redeemButton.hidden = true;
    return;
  }

  const redeemed = Boolean(coupon.redeemedAt);
  $('#coupon-result-badge').className = 'status ' + (redeemed ? 'off' : 'on');
  $('#coupon-result-badge').textContent = redeemed ? 'مستخدمة بالفعل' : 'صالحة للاستخدام';
  $('#coupon-result-discount').textContent = 'خصم ' + Number(coupon.discountPercent || 0) + '%';
  $('#coupon-result-name').textContent = coupon.customerName || '—';
  $('#coupon-result-phone').textContent = coupon.customerPhone || '—';
  $('#coupon-result-issued').textContent = formatDate(coupon.issuedAt);
  $('#coupon-result-redeemed').textContent = formatDate(coupon.redeemedAt);
  $('#coupon-result-message').textContent = message || (redeemed
    ? 'هذه القسيمة صُرفت من قبل ولا يمكن استخدامها مرة ثانية.'
    : 'القسيمة سليمة. اضغط «تأكيد صرف الخصم» بعد تطبيق الخصم للعميل.');
  redeemButton.hidden = redeemed;
  redeemButton.disabled = redeemed;
}


function renderCouponHistory() {
  const body = $('#admin-coupons-body');
  if (!body) return;
  const filter = $('#admin-coupon-filter')?.value || 'all';
  const visible = couponRows.filter(coupon => filter === 'all' || (filter === 'redeemed' ? Boolean(coupon.redeemedAt) : !coupon.redeemedAt));
  body.replaceChildren();
  if (!visible.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = filter === 'redeemed' ? 'لا توجد قسائم مستخدمة ضمن السجل المعروض.' : filter === 'unused' ? 'لا توجد قسائم متاحة ضمن السجل المعروض.' : 'لم تصدر أي قسائم حتى الآن.';
    row.append(cell); body.append(row); return;
  }
  for (const coupon of visible) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = coupon.customerName || '—';
    const phone = document.createElement('td'); phone.textContent = coupon.customerPhone || '—'; phone.dir = 'ltr';
    const discount = document.createElement('td'); discount.textContent = Number(coupon.discountPercent || 0) + '%';
    const issued = document.createElement('td'); issued.textContent = formatDate(coupon.issuedAt);
    const state = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'coupon-history-status ' + (coupon.redeemedAt ? 'is-used' : 'is-available');
    badge.textContent = coupon.redeemedAt ? 'مستخدمة' : 'متاحة'; state.append(badge);
    const redeemed = document.createElement('td'); redeemed.textContent = formatDate(coupon.redeemedAt);
    row.append(name, phone, discount, issued, state, redeemed); body.append(row);
  }
}

async function refreshCouponList() {
  const button = $('#admin-coupons-refresh');
  const status = $('#admin-coupons-status');
  if (button) button.disabled = true;
  if (status) status.textContent = 'جارٍ تحميل سجل القسائم…';
  try {
    const result = await request('/api/admin/coupons');
    couponRows = Array.isArray(result.coupons) ? result.coupons : [];
    couponStats = result.stats || { total: couponRows.length, available: 0, redeemed: 0 };
    $('#coupon-stat-total').textContent = String(couponStats.total || 0);
    $('#coupon-stat-available').textContent = String(couponStats.available || 0);
    $('#coupon-stat-redeemed').textContent = String(couponStats.redeemed || 0);
    const total = Number(couponStats.total || 0);
    const redeemedCount = Number(couponStats.redeemed || 0);
    $('#coupon-stat-rate').textContent = (total ? Math.round((redeemedCount / total) * 100) : 0) + '%';
    renderCouponHistory();
    if (status) status.textContent = total > couponRows.length
      ? 'يعرض السجل آخر ' + couponRows.length + ' قسيمة من إجمالي ' + total + '.'
      : 'تم تحديث السجل. عدد القسائم: ' + total + '.';
  } catch (error) {
    if (status) status.textContent = error.message || 'تعذر تحميل سجل القسائم.';
  } finally {
    if (button) button.disabled = false;
  }
}
async function lookupCoupon(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) {
    setCameraStatus('اكتب كود القسيمة أو امسح رمز QR.', 'error');
    codeInput.focus();
    return;
  }
  stopCamera();
  codeInput.value = code;
  checkButton.disabled = true;
  checkButton.textContent = 'جارٍ التحقق…';
  setCameraStatus('جارٍ التحقق من القسيمة في قاعدة البيانات…');
  resultPanel.hidden = true;
  try {
    const response = await request('/api/admin/coupons/lookup?code=' + encodeURIComponent(code));
    renderCoupon(response.coupon, response.redeemable
      ? 'القسيمة صالحة. لا يتم تسجيل الصرف إلا بعد التأكيد.'
      : 'القسيمة مستخدمة بالفعل.');
    setCameraStatus(response.redeemable ? 'تم العثور على قسيمة صالحة.' : 'القسيمة سبق صرفها.', response.redeemable ? 'success' : 'error');
  } catch (error) {
    renderCoupon(null, error.message || 'لم نتمكن من التحقق من القسيمة.');
    setCameraStatus(error.message || 'لم نتمكن من التحقق من القسيمة.', 'error');
  } finally {
    checkButton.disabled = false;
    checkButton.textContent = 'التحقق من القسيمة';
  }
}

async function scanLoop() {
  if (!scanning || !video || video.readyState < 2) {
    if (scanning) scanFrameId = requestAnimationFrame(scanLoop);
    return;
  }
  let raw = '';
  if (detector) {
    try {
      const hits = await detector.detect(video);
      raw = String(hits?.[0]?.rawValue || '').trim();
    } catch {
      // The pixel-based decoder below also handles browsers without BarcodeDetector.
    }
  }
  if (!raw && scanContext && video.videoWidth && video.videoHeight) {
    try {
      const scale = Math.min(1, 720 / video.videoWidth);
      scanCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      scanCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
      const pixels = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
      raw = String(decoded?.data || '').trim();
    } catch {
      // Wait for the next frame if a camera frame cannot be decoded yet.
    }
  }
  if (raw && raw !== lastScanValue) {
    lastScanValue = raw;
    stopCamera();
    codeInput.value = raw;
    await lookupCoupon(raw);
    return;
  }
  if (scanning) scanFrameId = requestAnimationFrame(scanLoop);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setCameraStatus('الكاميرا تحتاج إلى فتح لوحة التحكم عبر HTTPS. استخدم الإدخال اليدوي مؤقتًا.', 'error');
    return;
  }
  try {
    if (!detector && 'BarcodeDetector' in window) {
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); }
      catch { detector = null; }
    }
    cameraStart.disabled = true;
    setCameraStatus('يرجى السماح للمتصفح باستخدام الكاميرا…');
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = cameraStream;
    await video.play();
    scanning = true;
    lastScanValue = '';
    cameraPlaceholder.hidden = true;
    cameraStart.hidden = true;
    cameraStop.hidden = false;
    setCameraStatus('وجّه الكاميرا إلى رمز QR حتى يظهر داخل الإطار.');
    scanFrameId = requestAnimationFrame(scanLoop);
  } catch (error) {
    stopCamera();
    setCameraStatus(error?.name === 'NotAllowedError'
      ? 'لم يتم السماح باستخدام الكاميرا. فعّل إذن الكاميرا من إعدادات المتصفح أو أدخل الكود يدويًا.'
      : 'تعذر تشغيل الكاميرا. يمكنك إدخال كود القسيمة يدويًا.', 'error');
  } finally {
    cameraStart.disabled = false;
  }
}

cameraStart?.addEventListener('click', () => void startCamera());
cameraStop?.addEventListener('click', () => {
  stopCamera();
  setCameraStatus('تم إيقاف الكاميرا.');
});

codeForm?.addEventListener('submit', event => {
  event.preventDefault();
  void lookupCoupon(codeInput.value);
});

redeemButton?.addEventListener('click', async () => {
  if (!currentCoupon?.code || currentCoupon.redeemedAt) return;
  if (!window.confirm('تأكيد صرف خصم ' + Number(currentCoupon.discountPercent) + '%؟ لا يمكن استخدام هذه القسيمة مرة أخرى.')) return;
  redeemButton.disabled = true;
  redeemButton.textContent = 'جارٍ تسجيل الصرف…';
  try {
    const response = await request('/api/admin/coupons/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: currentCoupon.code })
    });
    renderCoupon(response.coupon, 'تم صرف الخصم بنجاح. تم إغلاق القسيمة ولا يمكن استخدامها مرة أخرى.');
    setCameraStatus('نجاح: تم صرف القسيمة وتسجيلها كمستخدمة.', 'success');
    void refreshCouponList();
  } catch (error) {
    setCameraStatus(error.message || 'تعذر تسجيل صرف القسيمة.', 'error');
    try {
      const response = await request('/api/admin/coupons/lookup?code=' + encodeURIComponent(currentCoupon.code));
      renderCoupon(response.coupon, response.redeemable
        ? 'القسيمة ما زالت صالحة ولم يتم صرفها.'
        : 'القسيمة تم صرفها بالفعل ولا يمكن استخدامها مرة أخرى.');
    } catch {}
  } finally {
    redeemButton.disabled = false;
    redeemButton.textContent = 'تأكيد صرف الخصم';
  }
});

$('#admin-coupons-refresh')?.addEventListener('click', () => void refreshCouponList());
$('#admin-coupon-filter')?.addEventListener('change', renderCouponHistory);
void refreshCouponList();

window.addEventListener('pagehide', stopCamera);
window.addEventListener('hashchange', () => {
  if (location.hash !== '#coupons') stopCamera();
});
