import { request } from './api-client.js';

const $ = selector => document.querySelector(selector);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

let banner = null;
let localMediaUrl = '';
let localPosterUrl = '';
let loadedMediaType = 'image';

const fieldIds = [
  'hero-kicker-ar', 'hero-kicker-en', 'hero-title-ar', 'hero-accent-ar', 'hero-lead-ar',
  'hero-title-en', 'hero-accent-en', 'hero-lead-en', 'hero-primary-label-ar',
  'hero-primary-label-en', 'hero-primary-url', 'hero-secondary-label-ar',
  'hero-secondary-label-en', 'hero-secondary-url'
];

function setStatus(message, state = '') {
  const node = $('#hero-banner-save-status');
  if (node) node.textContent = message;
  const top = $('#hero-banner-status');
  if (top && state) {
    top.textContent = state;
    top.dataset.state = state === 'مفعل' ? 'on' : 'off';
  }
}

function setProgress(percent, label) {
  const root = $('#hero-banner-progress');
  if (!root) return;
  root.hidden = false;
  root.querySelector('span').style.width = percent + '%';
  root.querySelector('small').textContent = label + ' ' + percent + '%';
}

function endProgress() {
  const root = $('#hero-banner-progress');
  if (root) root.hidden = true;
}

function clearLocalUrl(name) {
  const key = name === 'poster' ? 'localPosterUrl' : 'localMediaUrl';
  if (key === 'localPosterUrl' && localPosterUrl) URL.revokeObjectURL(localPosterUrl);
  if (key === 'localMediaUrl' && localMediaUrl) URL.revokeObjectURL(localMediaUrl);
  if (key === 'localPosterUrl') localPosterUrl = '';
  else localMediaUrl = '';
}

function setMediaTypeControls() {
  const type = $('#hero-banner-media-type').value;
  const input = $('#hero-banner-media-file');
  input.accept = type === 'video'
    ? 'video/mp4,video/webm,video/quicktime'
    : 'image/jpeg,image/png,image/webp,image/avif';
  $('#hero-banner-media-help').textContent = type === 'video'
    ? 'MP4 أو WebM أو MOV — الحد الأقصى 120MB. سيعمل الفيديو تلقائيًا بدون صوت في واجهة الموقع.'
    : 'JPG أو PNG أو WebP أو AVIF — الحد الأقصى 15MB.';
  renderPreview();
}

function getPreviewMedia() {
  const selectedType = $('#hero-banner-media-type').value;
  const changedWithoutFile = banner && selectedType !== loadedMediaType && !$('#hero-banner-media-file').files[0];
  if (changedWithoutFile) return { type: selectedType, mediaUrl: '', posterUrl: '' };
  return {
    type: selectedType,
    mediaUrl: localMediaUrl || (banner?.mediaUrl || ''),
    posterUrl: localPosterUrl || (banner?.posterUrl || '')
  };
}

function renderPreview() {
  if (!$('#hero-banner-preview')) return;
  const draft = getPreviewMedia();
  const image = $('#hero-banner-preview-image');
  const video = $('#hero-banner-preview-video');
  if (draft.type === 'video' && draft.mediaUrl) {
    image.hidden = !draft.posterUrl;
    image.src = draft.posterUrl || '';
    video.hidden = false;
    if (video.src !== draft.mediaUrl) {
      video.src = draft.mediaUrl;
      video.poster = draft.posterUrl || '';
      video.load();
    }
  } else {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    image.hidden = !(draft.mediaUrl || (draft.type === 'video' && draft.posterUrl));
    image.src = draft.type === 'image' ? draft.mediaUrl : (draft.posterUrl || '');
  }
  $('#hero-banner-preview').classList.toggle('is-disabled', !$('#hero-banner-enabled').checked);
  $('#hero-preview-kicker').textContent = $('#hero-kicker-ar').value;
  $('#hero-preview-title').textContent = $('#hero-title-ar').value;
  $('#hero-preview-accent').textContent = $('#hero-accent-ar').value;
  $('#hero-preview-lead').textContent = $('#hero-lead-ar').value;
  $('#hero-preview-primary').textContent = $('#hero-primary-label-ar').value;
  $('#hero-preview-secondary').textContent = $('#hero-secondary-label-ar').value;
}

function fillForm(data) {
  banner = data;
  loadedMediaType = data.mediaType === 'video' ? 'video' : 'image';
  $('#hero-banner-enabled').checked = data.enabled !== false;
  $('#hero-banner-media-type').value = loadedMediaType;
  for (const id of fieldIds) {
    const key = id.replace('hero-', '').replaceAll('-', '');
    const values = {
      'hero-kicker-ar': data.kickerAr,
      'hero-kicker-en': data.kickerEn,
      'hero-title-ar': data.titleAr,
      'hero-accent-ar': data.accentAr,
      'hero-lead-ar': data.leadAr,
      'hero-title-en': data.titleEn,
      'hero-accent-en': data.accentEn,
      'hero-lead-en': data.leadEn,
      'hero-primary-label-ar': data.primaryLabelAr,
      'hero-primary-label-en': data.primaryLabelEn,
      'hero-primary-url': data.primaryUrl,
      'hero-secondary-label-ar': data.secondaryLabelAr,
      'hero-secondary-label-en': data.secondaryLabelEn,
      'hero-secondary-url': data.secondaryUrl
    };
    $(`#${id}`).value = values[id] || '';
  }
  $('#hero-banner-media-file').value = '';
  $('#hero-banner-poster-file').value = '';
  $('#hero-banner-media-selected').textContent = data.mediaUrl ? 'الوسائط الحالية محفوظة. اختر ملفًا جديدًا لاستبدالها.' : 'لم يتم رفع وسائط بعد.';
  $('#hero-banner-poster-selected').textContent = data.posterUrl ? 'صورة الغلاف الحالية محفوظة. اختر صورة جديدة لاستبدالها.' : 'صورة الغلاف اختيارية.';
  $('#hero-banner-remove-media').checked = false;
  $('#hero-banner-remove-poster').checked = false;
  clearLocalUrl('media');
  clearLocalUrl('poster');
  setMediaTypeControls();
  setStatus('', data.enabled ? 'مفعل' : 'متوقف');
}

async function load() {
  $('#hero-banner-status').textContent = 'جارٍ تحميل إعدادات البانر…';
  try {
    const data = await request('/api/admin/hero-banner');
    fillForm(data);
  } catch (error) {
    setStatus(error.message || 'تعذر تحميل إعدادات البانر.');
    $('#hero-banner-status').textContent = 'تعذر التحميل';
  }
}

function uploadFile(file, purpose, mediaType) {
  return new Promise(async (resolve, reject) => {
    try {
      const prepared = await request('/api/admin/hero-banner/upload-presign', {
        method: 'POST',
        body: JSON.stringify({
          purpose,
          mediaType,
          fileName: file.name,
          contentType: file.type,
          size: file.size
        })
      });
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', prepared.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100), purpose === 'poster' ? 'جارٍ رفع صورة الغلاف…' : 'جارٍ رفع وسائط البانر…');
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve(prepared.key)
        : reject(new Error('فشل رفع الملف إلى تخزين الوسائط.'));
      xhr.onerror = () => reject(new Error('تعذر الاتصال بتخزين الوسائط.'));
      xhr.onabort = () => reject(new Error('تم إلغاء رفع الملف.'));
      xhr.send(file);
    } catch (error) {
      reject(error);
    }
  });
}

$('#hero-banner-media-type').addEventListener('change', () => {
  $('#hero-banner-media-file').value = '';
  $('#hero-banner-media-selected').textContent = 'لم يتم اختيار ملف جديد.';
  clearLocalUrl('media');
  setMediaTypeControls();
});
$('#hero-banner-media-file').addEventListener('change', () => {
  const file = $('#hero-banner-media-file').files[0];
  clearLocalUrl('media');
  if (!file) {
    $('#hero-banner-media-selected').textContent = 'لم يتم اختيار ملف جديد.';
    renderPreview();
    return;
  }
  localMediaUrl = URL.createObjectURL(file);
  $('#hero-banner-media-selected').textContent = file.name + ' — ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
  $('#hero-banner-remove-media').checked = false;
  renderPreview();
});
$('#hero-banner-poster-file').addEventListener('change', () => {
  const file = $('#hero-banner-poster-file').files[0];
  clearLocalUrl('poster');
  if (!file) {
    $('#hero-banner-poster-selected').textContent = 'صورة الغلاف اختيارية.';
    renderPreview();
    return;
  }
  localPosterUrl = URL.createObjectURL(file);
  $('#hero-banner-poster-selected').textContent = file.name + ' — ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
  $('#hero-banner-remove-poster').checked = false;
  renderPreview();
});
$('#hero-banner-remove-media').addEventListener('change', renderPreview);
$('#hero-banner-remove-poster').addEventListener('change', renderPreview);
$('#hero-banner-enabled').addEventListener('change', renderPreview);
for (const id of fieldIds) $('#' + id).addEventListener('input', renderPreview);

$('#hero-banner-refresh').addEventListener('click', () => void load());
$('#hero-banner-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#hero-banner-save');
  if (button.disabled) return;
  const selectedType = $('#hero-banner-media-type').value;
  const mediaFile = $('#hero-banner-media-file').files[0];
  const posterFile = $('#hero-banner-poster-file').files[0];
  const currentMediaKey = banner?.mediaKey || '';
  if (currentMediaKey && selectedType !== loadedMediaType && !mediaFile && !$('#hero-banner-remove-media').checked) {
    setStatus('اختر ملفًا جديدًا متوافقًا مع النوع المختار، أو أزل الوسائط الحالية أولًا.');
    return;
  }
  if (mediaFile) {
    const allowed = selectedType === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
    const maxBytes = selectedType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!allowed.has(mediaFile.type)) {
      setStatus(selectedType === 'video' ? 'صيغة الفيديو غير مدعومة. استخدم MP4 أو WebM أو MOV.' : 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو AVIF.');
      return;
    }
    if (mediaFile.size > maxBytes || mediaFile.size < 1) {
      setStatus(selectedType === 'video' ? 'الحد الأقصى للفيديو 120MB.' : 'الحد الأقصى للصورة 15MB.');
      return;
    }
  }
  if (posterFile && (!IMAGE_TYPES.has(posterFile.type) || posterFile.size < 1 || posterFile.size > MAX_IMAGE_BYTES)) {
    setStatus('صورة الغلاف يجب أن تكون JPG أو PNG أو WebP أو AVIF وبحد أقصى 15MB.');
    return;
  }
  button.disabled = true;
  setStatus('جارٍ حفظ إعدادات البانر ورفع الوسائط…');
  let newMediaKey = '';
  let newPosterKey = '';
  try {
    let mediaKey = $('#hero-banner-remove-media').checked ? '' : currentMediaKey;
    let posterKey = $('#hero-banner-remove-poster').checked ? '' : (banner?.posterKey || '');
    if (mediaFile) {
      newMediaKey = await uploadFile(mediaFile, 'media', selectedType);
      mediaKey = newMediaKey;
    }
    if (posterFile) {
      newPosterKey = await uploadFile(posterFile, 'poster', 'image');
      posterKey = newPosterKey;
    }
    const payload = {
      enabled: $('#hero-banner-enabled').checked,
      mediaType: selectedType,
      mediaKey,
      posterKey,
      kickerAr: $('#hero-kicker-ar').value,
      kickerEn: $('#hero-kicker-en').value,
      titleAr: $('#hero-title-ar').value,
      accentAr: $('#hero-accent-ar').value,
      leadAr: $('#hero-lead-ar').value,
      titleEn: $('#hero-title-en').value,
      accentEn: $('#hero-accent-en').value,
      leadEn: $('#hero-lead-en').value,
      primaryLabelAr: $('#hero-primary-label-ar').value,
      primaryLabelEn: $('#hero-primary-label-en').value,
      primaryUrl: $('#hero-primary-url').value,
      secondaryLabelAr: $('#hero-secondary-label-ar').value,
      secondaryLabelEn: $('#hero-secondary-label-en').value,
      secondaryUrl: $('#hero-secondary-url').value
    };
    const saved = await request('/api/admin/hero-banner', { method: 'PATCH', body: JSON.stringify(payload) });
    fillForm(saved);
    setStatus('تم حفظ البانر ونشر إعداداته.', saved.enabled ? 'مفعل' : 'متوقف');
    if (!saved.enabled) setStatus('تم حفظ البانر لكنه متوقف ولن يظهر محتواه المخصص.');
  } catch (error) {
    setStatus(error.message || 'تعذر حفظ البانر.');
  } finally {
    endProgress();
    button.disabled = false;
  }
});

setMediaTypeControls();
void load();
