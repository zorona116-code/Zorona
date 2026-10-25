import { request } from './api-client.js';

const $ = selector => document.querySelector(selector);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

let banner = { mediaType: 'video', mediaKey: '', mediaUrl: '', hasMedia: false };
let localMediaUrl = '';
let localMediaType = '';

function setStatus(message) {
  $('#hero-banner-save-status').textContent = message;
}

function setProgress(percent, label = 'جارٍ رفع الملف…') {
  const root = $('#hero-banner-progress');
  root.hidden = false;
  root.querySelector('span').style.width = percent + '%';
  root.querySelector('small').textContent = label + ' ' + percent + '%';
}

function endProgress() {
  $('#hero-banner-progress').hidden = true;
}

function clearLocalUrl() {
  if (localMediaUrl) URL.revokeObjectURL(localMediaUrl);
  localMediaUrl = '';
  localMediaType = '';
}

function setMediaTypeControls() {
  const type = $('#hero-banner-media-type').value;
  $('#hero-banner-media-file').accept = type === 'video'
    ? 'video/mp4,video/webm,video/quicktime'
    : 'image/jpeg,image/png,image/webp,image/avif';
  $('#hero-banner-media-help').textContent = type === 'video'
    ? 'MP4 أو WebM أو MOV — الحد الأقصى 120MB. سيعمل الفيديو تلقائيًا دون صوت.'
    : 'JPG أو PNG أو WebP أو AVIF — الحد الأقصى 15MB.';
}

function renderPreview() {
  const image = $('#hero-banner-preview-image');
  const video = $('#hero-banner-preview-video');
  const empty = $('#hero-banner-preview-empty');
  const mediaType = localMediaUrl ? localMediaType : banner.mediaType;
  const mediaUrl = localMediaUrl || banner.mediaUrl || '';
  const hasMedia = Boolean(mediaUrl);

  image.hidden = true;
  video.pause();
  video.hidden = true;
  video.removeAttribute('src');
  video.load();

  if (!hasMedia) {
    image.removeAttribute('src');
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  if (mediaType === 'video') {
    video.src = mediaUrl;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.removeAttribute('controls');
    video.hidden = false;
    video.load();
    const playback = video.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  } else {
    image.src = mediaUrl;
    image.hidden = false;
  }
}

function fillForm(data) {
  clearLocalUrl();
  banner = data || { mediaType: 'video', mediaKey: '', mediaUrl: '', hasMedia: false };
  $('#hero-banner-media-type').value = banner.hasMedia
    ? (banner.mediaType === 'video' ? 'video' : 'image')
    : 'video';
  $('#hero-banner-media-file').value = '';
  $('#hero-banner-media-selected').textContent = banner.hasMedia
    ? 'הקובץ הקיים נשמר. אפשר לבחור קובץ חדש להחלפה.'
    : 'لم يتم اختيار ملف جديد.';
  $('#hero-banner-remove-media').hidden = !banner.hasMedia;
  setMediaTypeControls();
  renderPreview();
}

async function load() {
  $('#hero-banner-save-status').textContent = 'جارٍ تحميل وسائط البانر…';
  try {
    const data = await request('/api/admin/hero-banner');
    fillForm(data);
    setStatus(banner.hasMedia ? 'الوسائط الحالية جاهزة.' : 'لا توجد وسائط محفوظة.');
  } catch (error) {
    setStatus(error.message || 'تعذر تحميل وسائط البانر.');
  }
}

async function uploadFile(file, mediaType) {
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/proxy/api/admin/hero-banner/upload');
    xhr.timeout = 180000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Hero-Media-Type', mediaType);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Request-Id', crypto.randomUUID());
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new Error(data.message || 'فشل رفع الملف وحفظه. حاول مرة أخرى.'));
    };
    xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم أثناء الرفع.'));
    xhr.ontimeout = () => reject(new Error('استغرق الرفع وقتًا طويلًا. جرّب ملفًا أصغر.'));
    xhr.onabort = () => reject(new Error('تم إلغاء رفع الملف.'));
    xhr.send(file);
  });
}

$('#hero-banner-media-type').addEventListener('change', () => {
  clearLocalUrl();
  $('#hero-banner-media-file').value = '';
  $('#hero-banner-media-selected').textContent = 'لم يتم اختيار ملف جديد.';
  setMediaTypeControls();
  renderPreview();
});

$('#hero-banner-media-file').addEventListener('change', () => {
  const file = $('#hero-banner-media-file').files[0];
  clearLocalUrl();
  if (!file) {
    $('#hero-banner-media-selected').textContent = 'لم يتم اختيار ملف جديد.';
    renderPreview();
    return;
  }
  const type = $('#hero-banner-media-type').value;
  const allowed = type === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
  const maxBytes = type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!allowed.has(file.type)) {
    $('#hero-banner-media-file').value = '';
    $('#hero-banner-media-selected').textContent = '';
    setStatus(type === 'video'
      ? 'صيغة الفيديو غير مدعومة. استخدم MP4 أو WebM أو MOV.'
      : 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو AVIF.');
    renderPreview();
    return;
  }
  if (file.size < 1 || file.size > maxBytes) {
    $('#hero-banner-media-file').value = '';
    $('#hero-banner-media-selected').textContent = '';
    setStatus(type === 'video' ? 'الحد الأقصى للفيديو 120MB.' : 'الحد الأقصى للصورة 15MB.');
    renderPreview();
    return;
  }
  localMediaUrl = URL.createObjectURL(file);
  localMediaType = type;
  $('#hero-banner-media-selected').textContent = file.name + ' — ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
  setStatus('');
  renderPreview();
});

$('#hero-banner-refresh').addEventListener('click', () => void load());

$('#hero-banner-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#hero-banner-save');
  const file = $('#hero-banner-media-file').files[0];
  if (button.disabled) return;
  if (!file) {
    setStatus('اختر صورة أو فيديو أولًا.');
    return;
  }

  const mediaType = $('#hero-banner-media-type').value;
  const allowed = mediaType === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
  const maxBytes = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!allowed.has(file.type) || file.size < 1 || file.size > maxBytes) {
    setStatus(mediaType === 'video' ? 'اختر فيديو MP4 أو WebM أو MOV بحجم لا يتجاوز 120MB.' : 'اختر صورة JPG أو PNG أو WebP أو AVIF بحجم لا يتجاوز 15MB.');
    return;
  }

  button.disabled = true;
  setStatus('جارٍ رفع الملف وحفظه…');
  try {
    const saved = await uploadFile(file, mediaType);
    fillForm(saved);
    setStatus('تم حفظ الوسائط. سيظهر الملف أسفل النص الحالي في البانر.');
  } catch (error) {
    setStatus(error.message || 'تعذر رفع الملف أو حفظه.');
  } finally {
    endProgress();
    button.disabled = false;
  }
});

$('#hero-banner-remove-media').addEventListener('click', async () => {
  if (!banner?.hasMedia || !confirm('هل تريد إزالة الصورة أو الفيديو الحالي من البانر؟')) return;
  const button = $('#hero-banner-remove-media');
  button.disabled = true;
  setStatus('جارٍ إزالة الوسائط الحالية…');
  try {
    const saved = await request('/api/admin/hero-banner', {
      method: 'PATCH',
      body: JSON.stringify({ mediaKey: '' })
    });
    fillForm(saved);
    setStatus('تمت إزالة الوسائط. سيظل نص البانر الحالي كما هو.');
  } catch (error) {
    setStatus(error.message || 'تعذرت إزالة الوسائط.');
  } finally {
    button.disabled = false;
  }
});

setMediaTypeControls();
void load();
