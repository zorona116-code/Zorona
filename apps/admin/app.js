const $=(selector)=>document.querySelector(selector);
import { request, apiBase } from './api-client.js';

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}
function categoryName(categoryId){
  return categories.find(category => category.id === categoryId)?.nameAr || '—';
}
const dashboardState = {
  products: [],
  categories: [],
  reservations: [],
  customers: [],
  editingId: null
};

let { products, categories, reservations, customers } = dashboardState;
let editingId = dashboardState.editingId;
function renderStats(){$('#count-products').textContent=products.length;$('#count-categories').textContent=categories.length;$('#count-available').textContent=products.filter(p=>p.available).length;$('#count-reservations').textContent=reservations.length;document.querySelectorAll('[data-sidebar-count="reservations"]').forEach(node=>node.textContent=reservations.length);}
function renderProducts(){const query=$('#search').value.trim().toLowerCase();const filtered=products.filter(p=>!query||`${p.nameAr} ${p.nameEn}`.toLowerCase().includes(query));$('#products-body').innerHTML=filtered.map(p=>`<tr><td>${p.imageUrl?`<img class="product-thumb" src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy">`:''}<strong>${escapeHtml(p.nameAr)}</strong><small>${escapeHtml(p.nameEn)}</small></td><td>${escapeHtml(categoryName(p.categoryId))}</td><td class="price">AED ${Number(p.price).toFixed(0)}</td><td>${p.videoKey?'<span class="status on">متوفر</span>':'<span class="status off">غير مضاف</span>'}</td><td><span class="status ${p.available?'on':'off'}">${p.available?'متاح':'مخفي'}</span></td><td class="actions"><button data-video="${p.id}">فيديو</button><button data-edit="${p.id}">تعديل</button><button data-delete="${p.id}" class="danger">حذف</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">لا توجد أصناف</td></tr>';}
function renderCategories(){$('#categories-body').innerHTML=categories.map((c,index)=>`<tr><td>${index+1}</td><td><strong>${escapeHtml(c.nameAr)}</strong></td><td>${escapeHtml(c.nameEn)}</td><td><span class="status ${c.active?'on':'off'}">${c.active?'نشط':'مخفي'}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد أقسام</td></tr>';}
function renderReservations(){const rows=reservations.map(r=>`<tr><td><strong>${escapeHtml(r.name)}</strong><small>${r.notes?escapeHtml(r.notes):'—'}</small></td><td>${escapeHtml(r.date)}<small>${escapeHtml(r.time)}</small></td><td>${Number(r.guests)}</td><td dir="ltr">${escapeHtml(r.phone)}</td><td><span class="status ${r.status==='confirmed'?'on':r.status==='cancelled'?'off':'pending'}">${r.status==='confirmed'?'مؤكد':r.status==='cancelled'?'ملغي':'قيد المراجعة'}</span></td><td class="actions"><button data-res-status="confirmed" data-id="${r.id}">تأكيد</button><button data-res-status="cancelled" data-id="${r.id}" class="danger">إلغاء</button></td></tr>`).join('');$('#reservations-body').innerHTML=rows||'<tr><td colspan="6" class="empty">لا توجد حجوزات حاليًا.</td></tr>';}
function customerDate(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('ar-AE');}
function renderCustomers(){
  const rows=(customers||[]).map(customer=>{
    const whatsapp=customer.whatsapp_marketing_consent===true;
    return '<tr>' +
      '<td><strong>'+escapeHtml(customer.name)+'</strong><small>عميل منذ '+escapeHtml(customerDate(customer.first_seen_at))+'</small></td>' +
      '<td dir="ltr">'+escapeHtml(customer.phone)+'</td>' +
      '<td>'+Number(customer.reservation_count||0)+'</td>' +
      '<td><span class="status '+(whatsapp?'on':'off')+'">'+(whatsapp?'موافق على واتساب':'غير موافق')+'</span></td>' +
      '<td>'+escapeHtml(customerDate(customer.last_reservation_at))+'</td>' +
      '<td class="actions">'+(whatsapp?'<button data-customer-unsubscribe="whatsapp" data-id="'+Number(customer.id)+'" class="danger">إيقاف WhatsApp</button>':'')+'</td>' +
      '</tr>';
  }).join('');
  $('#customers-body').innerHTML=rows||'<tr><td colspan="6" class="empty">لا توجد سجلات عملاء في قاعدة البيانات بعد.</td></tr>';
  document.querySelectorAll('[data-sidebar-count="customers"]').forEach(node=>node.textContent=(customers||[]).length);
}
function openModal(product=null){editingId=product?.id||null;$('#modal-title').textContent=editingId?'تعديل الصنف':'إضافة صنف جديد';$('#name-ar').value=product?.nameAr||'';$('#name-en').value=product?.nameEn||'';$('#price').value=product?.price??'';$('#image-url').value=product?.imageUrl&&!product.imageKey?product.imageUrl:'';$('#description-ar').value=product?.descriptionAr||'';$('#category').innerHTML=categories.map(c=>`<option value="${escapeHtml(c.id)}" ${product?.categoryId===c.id?'selected':''}>${escapeHtml(c.nameAr)}</option>`).join('');$('#available').checked=product?.available??true;$('#video-file').value='';$('#selected-file').textContent='';$('#remove-video').hidden=!product?.videoKey;updateVideoPreview(product?.videoUrl||'');$('#image-file').value='';$('#selected-image').textContent='';$('#remove-image').hidden=!product?.imageKey;updateImagePreview(product?.imageUrl||'');$('#modal').classList.add('show');$('#modal').setAttribute('aria-hidden','false');$('#name-ar').focus();}
function closeModal(){$('#modal').classList.remove('show');$('#modal').setAttribute('aria-hidden','true');editingId=null;}
function updateVideoPreview(url){const wrap=$('#video-preview'),player=$('#video-preview-player');if(!url){wrap.hidden=true;player.removeAttribute('src');player.load();return}player.src=url;wrap.hidden=false;}
function updateImagePreview(url){const wrap=$('#image-preview'),image=$('#image-preview-player');if(!url){wrap.hidden=true;image.removeAttribute('src');return}image.src=url;wrap.hidden=false;}
function syncSidebarState(){
  const collapsed=localStorage.getItem('ARABISK_SIDEBAR_COLLAPSED')==='1';
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  const toggle=$('#sidebar-toggle');
  if(toggle){
    toggle.setAttribute('aria-expanded',String(!collapsed));
    toggle.setAttribute('aria-label',collapsed?'توسيع القائمة':'طي القائمة');
    toggle.title=collapsed?'توسيع القائمة':'طي القائمة';
    toggle.querySelector('span').textContent=collapsed?'›':'‹';
  }
}
function showSection(sectionId){document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('section-visible'));document.querySelectorAll('[data-section]').forEach(link=>link.classList.toggle('active',link.dataset.section===sectionId));const titleMap={dashboard:'نظرة عامة',products:'إدارة الأصناف',categories:'إدارة الأقسام',offers:'عروض اليوم',reservations:'حجوزات الطاولات',customers:'العملاء والإشعارات',marketing:'حملات واتساب',coupons:'قسائم خصم التطبيق',settings:'إعدادات الموقع'};$('#page-title').textContent=titleMap[sectionId]||'إدارة ZORONA';$('#dashboard-stats').style.display=sectionId==='dashboard'?'':'none';if(sectionId==='dashboard')return;const section=document.getElementById(sectionId);if(section)section.classList.add('section-visible');}
async function load(){
  $('#connection').textContent='جارٍ الاتصال…';
  const resources=[
    ['categories','/api/categories'],
    ['products','/api/products'],
    ['reservations','/api/reservations'],
    ['customers','/api/customers']
  ];
  const results=await Promise.allSettled(resources.map(([,path])=>request(path)));
  const failures=[];
  results.forEach((result,index)=>{
    const [key]=resources[index];
    if(result.status==='fulfilled'){
      const value=result.value;
      if(key==='categories')categories=Array.isArray(value)?value:[];
      if(key==='products')products=Array.isArray(value)?value:[];
      if(key==='reservations')reservations=Array.isArray(value)?value:[];
      if(key==='customers')customers=Array.isArray(value)?value:[];
    }else failures.push(resources[index][0]+': '+(result.reason?.message||'تعذر تحميل البيانات'));
  });
  dashboardState.products=products;
  renderTodayOfferProductOptions($('#today-offer-product')?.value||'');
  dashboardState.categories=categories;
  dashboardState.reservations=reservations;
  dashboardState.customers=customers;
  renderStats();renderProducts();renderCategories();renderReservations();renderCustomers();
  $('#connection').textContent=failures.length?'متصل جزئيًا':'متصل';
  $('#connection').className='connected';
  $('#error').textContent=failures.length?'تعذر تحميل: '+failures.join(' — '):'';
}
function loadSettings(){$('#api-base').value=apiBase();$('#site-name').value=localStorage.getItem('ARABISK_SITE_NAME')||'ZORONA';$('#site-description').value=localStorage.getItem('ARABISK_SITE_DESCRIPTION')||'مطعم وكافيه بطابع عربي عصري.';}
function localDateTimeToIso(value){
  if(!value)return '';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():'';
}
function isoToLocalDateTime(value){
  if(!value)return '';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}

function renderTodayOfferProductOptions(selectedId=''){
  const select=$('#today-offer-product');
  if(!select)return;
  const items=(products||[]).filter(item=>item?.available!==false).slice().sort((a,b)=>String(a.nameAr||a.nameEn||'').localeCompare(String(b.nameAr||b.nameEn||''),'ar'));
  select.innerHTML='<option value="">بدون صنف محدد</option>'+items.map(item=>'<option value="'+escapeHtml(String(item.id))+'">'+escapeHtml(String(item.nameAr||item.nameEn||item.id))+' — AED '+Number(item.price||0).toFixed(2)+'</option>').join('');
  select.value=selectedId||'';
}
async function loadTodayOfferSettings(){
  const status=$('#today-offer-status');
  try{
    const data=await request('/api/admin/promotions/today');
    renderTodayOfferProductOptions(data.productId||'');
    if($('#today-offer-enabled'))$('#today-offer-enabled').checked=data.configuredEnabled===true;
    if($('#today-offer-product'))$('#today-offer-product').value=data.productId||'';
    if($('#today-offer-badge'))$('#today-offer-badge').value=data.badge||'عرض اليوم';
    if($('#today-offer-start'))$('#today-offer-start').value=isoToLocalDateTime(data.startsAt);
    if($('#today-offer-end'))$('#today-offer-end').value=isoToLocalDateTime(data.endsAt);
    if($('#today-offer-title'))$('#today-offer-title').value=data.title||'اختيار اليوم من ZORONA';
    if($('#today-offer-message'))$('#today-offer-message').value=data.message||'اختيار مميز من القائمة متاح اليوم.';
    if($('#today-offer-cta'))$('#today-offer-cta').value=data.ctaLabel||'اكتشف المنيو';
    if(status)status.textContent=data.enabled?'العرض ظاهر للزوار الآن':'العرض غير مفعل';
    const previewTitle=$('#today-offer-preview-title'); if(previewTitle)previewTitle.textContent=data.title||'اختيار اليوم من ZORONA';
    const previewMessage=$('#today-offer-preview-message'); if(previewMessage)previewMessage.textContent=data.message||'اختيار مميز من القائمة متاح اليوم.';
    const previewStatus=$('#today-offer-preview-status'); if(previewStatus)previewStatus.textContent=data.enabled?'مفعل الآن':'غير مفعل';
    const previewProduct=$('#today-offer-preview-product'); if(previewProduct){const product=(products||[]).find(item=>String(item.id)===String(data.productId||'')); previewProduct.textContent=product?(product.nameAr||product.nameEn||product.id):'بدون صنف محدد';}
  }catch(error){if(status)status.textContent='تعذر تحميل إعدادات عرض اليوم';}
}

async function uploadFile(endpoint,productId,file,onProgress,errorText){const prepared=await request(endpoint,{method:'POST',body:JSON.stringify({productId,fileName:file.name,contentType:file.type,size:file.size})});await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',prepared.uploadUrl);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.upload.onprogress=event=>{if(event.lengthComputable&&onProgress)onProgress(Math.round(event.loaded/event.total*100))};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(errorText));xhr.onerror=()=>reject(new Error('تعذر الاتصال بتخزين الوسائط.'));xhr.send(file)});return prepared.key;}
async function deleteVideo(productId){const prepared=await request('/api/videos/delete-presign',{method:'POST',body:JSON.stringify({productId})});if(prepared.url){const response=await fetch(prepared.url,{method:'DELETE'});if(!response.ok)throw new Error('تعذر حذف الفيديو من التخزين.')}await request(`/api/products/${productId}`,{method:'PATCH',body:JSON.stringify({videoKey:''})});}
async function deleteImage(productId){const prepared=await request('/api/images/delete-presign',{method:'POST',body:JSON.stringify({productId})});if(prepared.url){const response=await fetch(prepared.url,{method:'DELETE'});if(!response.ok)throw new Error('تعذر حذف الصورة من التخزين.')}await request(`/api/products/${productId}`,{method:'PATCH',body:JSON.stringify({imageKey:''})});}
document.querySelectorAll('[data-section]').forEach(link=>link.addEventListener('click',()=>setTimeout(()=>showSection(link.dataset.section),0)));
$('#add-product').addEventListener('click',()=>openModal());$('#cancel').addEventListener('click',closeModal);$('#search').addEventListener('input',renderProducts);$('#refresh-reservations').addEventListener('click',load);$('#modal').addEventListener('click',event=>{if(event.target.id==='modal')closeModal()});
$('#video-file').addEventListener('change',()=>{const file=$('#video-file').files[0];if(!file){$('#selected-file').textContent='';return}$('#selected-file').textContent=`${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`;if($('#video-preview-player').src.startsWith('blob:'))URL.revokeObjectURL($('#video-preview-player').src);updateVideoPreview(URL.createObjectURL(file));$('#remove-video').hidden=false});
$('#image-file').addEventListener('change',()=>{const file=$('#image-file').files[0];if(!file){$('#selected-image').textContent='';return}$('#selected-image').textContent=`${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`;updateImagePreview(URL.createObjectURL(file));$('#remove-image').hidden=false});
$('#remove-video').addEventListener('click',async()=>{if(!editingId||!confirm('حذف فيديو التحضير لهذا المنتج؟'))return;try{await deleteVideo(editingId);const p=products.find(x=>x.id===editingId);if(p){p.videoKey='';p.videoUrl=''}$('#video-file').value='';$('#selected-file').textContent='';$('#remove-video').hidden=true;updateVideoPreview('');renderProducts()}catch(error){alert(error.message)}});
$('#remove-image').addEventListener('click',async()=>{if(!editingId||!confirm('حذف صورة هذا المنتج؟'))return;try{await deleteImage(editingId);const p=products.find(x=>x.id===editingId);if(p){p.imageKey='';p.imageUrl=''}$('#image-file').value='';$('#selected-image').textContent='';$('#remove-image').hidden=true;updateImagePreview('');renderProducts()}catch(error){alert(error.message)}});
$('#products-body').addEventListener('click',async(event)=>{const edit=event.target.dataset.edit,del=event.target.dataset.delete,video=event.target.dataset.video;if(edit)return openModal(products.find(p=>p.id===edit));if(video){const product=products.find(p=>p.id===video);if(!product?.videoUrl)return alert('لا يوجد فيديو تحضير مضاف لهذا الصنف.');window.open(product.videoUrl,'_blank','noopener');return}if(del){const product=products.find(p=>p.id===del);if(!product||!confirm(`حذف «${product.nameAr}»؟`))return;try{await request(`/api/products/${del}`,{method:'DELETE'});await load()}catch(error){alert(error.message)}}});
$('#reservations-body').addEventListener('click',async event=>{const id=event.target.dataset.id,status=event.target.dataset.resStatus;if(!id||!status)return;try{await request(`/api/reservations/${id}`,{method:'PATCH',body:JSON.stringify({status})});await load()}catch(error){alert(error.message)}});
$('#refresh-customers')?.addEventListener('click',()=>void load());
$('#customers-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-customer-unsubscribe]');
  if(!button)return;
  const id=button.dataset.id,channel=button.dataset.customerUnsubscribe;
  const label=channel==='sms'?'رسائل SMS':'رسائل WhatsApp';
  if(!id||!channel||!confirm(`إيقاف موافقة ${label} لهذا العميل؟`))return;
  try{await request(`/api/customers/${id}/consent`,{method:'PATCH',body:JSON.stringify({channel,enabled:false})});await load();}
  catch(error){alert(error.message||'تعذر تحديث موافقة العميل.');}
});
$('#product-form').addEventListener('submit',async event=>{event.preventDefault();const submit=$('#product-form .submit'),progress=$('#upload-progress');submit.disabled=true;try{const payload={categoryId:$('#category').value,nameAr:$('#name-ar').value,nameEn:$('#name-en').value,descriptionAr:$('#description-ar').value,imageUrl:$('#image-url').value.trim(),price:Number($('#price').value),available:$('#available').checked};let saved=editingId?await request(`/api/products/${editingId}`,{method:'PATCH',body:JSON.stringify(payload)}):await request('/api/products',{method:'POST',body:JSON.stringify(payload)});const imageFile=$('#image-file').files[0];if(imageFile){if(imageFile.size>15*1024*1024)throw new Error('الحد الأقصى للصورة 15MB.');if(!['image/jpeg','image/png','image/webp','image/avif'].includes(imageFile.type))throw new Error('الصيغ المسموحة: JPG وPNG وWebP وAVIF.');progress.hidden=false;progress.querySelector('span').style.width='0%';progress.querySelector('small').textContent='جاري رفع الصورة… 0%';const key=await uploadFile('/api/images/presign',saved.id,imageFile,percent=>{progress.querySelector('span').style.width=`${percent}%`;progress.querySelector('small').textContent=`جاري رفع الصورة… ${percent}%`},'فشل رفع الصورة إلى التخزين.');saved=await request(`/api/products/${saved.id}`,{method:'PATCH',body:JSON.stringify({imageKey:key,imageUrl:''})})}const file=$('#video-file').files[0];if(file){if(file.size>120*1024*1024)throw new Error('الحد الأقصى للفيديو 120MB.');if(!['video/mp4','video/webm','video/quicktime'].includes(file.type))throw new Error('الصيغ المسموحة: MP4 وWebM وMOV.');progress.hidden=false;progress.querySelector('span').style.width='0%';progress.querySelector('small').textContent='جاري رفع الفيديو… 0%';const key=await uploadFile('/api/videos/presign',saved.id,file,percent=>{progress.querySelector('span').style.width=`${percent}%`;progress.querySelector('small').textContent=`جاري رفع الفيديو… ${percent}%`},'فشل رفع الفيديو إلى التخزين.');await request(`/api/products/${saved.id}`,{method:'PATCH',body:JSON.stringify({videoKey:key})})}progress.hidden=true;closeModal();await load()}catch(error){progress.hidden=true;alert(error.message)}finally{submit.disabled=false}});
$('#settings-form').addEventListener('submit',event=>{event.preventDefault();localStorage.setItem('ARABISK_API_BASE',$('#api-base').value.trim().replace(/\/$/,''));localStorage.setItem('ARABISK_SITE_NAME',$('#site-name').value.trim());localStorage.setItem('ARABISK_SITE_DESCRIPTION',$('#site-description').value.trim());$('#settings-message').textContent='تم حفظ الإعدادات.';setTimeout(()=>$('#settings-message').textContent='',2500);load()});
$('#today-offer-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#today-offer-save'),status=$('#today-offer-message-status');
  if(button)button.disabled=true;
  if(status)status.textContent='جارٍ حفظ عرض اليوم…';
  try{
    const data=await request('/api/admin/promotions/today',{method:'PATCH',body:JSON.stringify({
      enabled:$('#today-offer-enabled')?.checked===true,
      productId:$('#today-offer-product')?.value||'',
      badge:$('#today-offer-badge')?.value||'عرض اليوم',
      startsAt:localDateTimeToIso($('#today-offer-start')?.value||''),
      endsAt:localDateTimeToIso($('#today-offer-end')?.value||''),
      title:$('#today-offer-title')?.value||'اختيار اليوم من ZORONA',
      message:$('#today-offer-message')?.value||'اختيار مميز من القائمة متاح اليوم.',
      ctaLabel:$('#today-offer-cta')?.value||'اكتشف المنيو'
    })});
    if(status)status.textContent=data.enabled?'تم حفظ عرض اليوم وتفعيله.':'تم حفظ عرض اليوم.';
    if($('#today-offer-status'))$('#today-offer-status').textContent=data.enabled?'العرض ظاهر للزوار الآن':'العرض غير مفعل';
    setTimeout(()=>{if(status)status.textContent='';},2500);
  }catch(error){if(status)status.textContent=error.message||'تعذر حفظ عرض اليوم.';}
  finally{if(button)button.disabled=false;}
});
$('#today-offer-refresh')?.addEventListener('click',()=>void loadTodayOfferSettings());
syncSidebarState();void loadTodayOfferSettings();$('#sidebar-toggle')?.addEventListener('click',()=>{const collapsed=!document.body.classList.contains('sidebar-collapsed');localStorage.setItem('ARABISK_SIDEBAR_COLLAPSED',collapsed?'1':'0');syncSidebarState();});loadSettings();showSection(location.hash.replace('#','')||'dashboard');void load().catch(error=>{console.error('Dashboard initialization failed:',error);const connection=$('#connection');if(connection){connection.textContent='تعذر الاتصال';connection.className='disconnected';}const banner=$('#error');if(banner)banner.textContent=error?.message||'تعذر تحميل لوحة التحكم.';});

window.ARABISK_ADMIN_RELOAD = async () => {
  if (document.querySelector('.modal.show')) return;
  await load();
};