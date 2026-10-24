(() => {
  'use strict';
  const html = document.documentElement;
  if (!html.classList.contains('pwa-installed')) return;

  const overlay = document.getElementById('pwa-auth-overlay');
  const registerForm = document.getElementById('pwa-register-form');
  const loginForm = document.getElementById('pwa-login-form');
  const message = document.getElementById('pwa-auth-message');
  const modeButtons = Array.from(document.querySelectorAll('[data-pwa-mode]'));
  if (!overlay || !registerForm || !loginForm || !message) return;

  function setMessage(value, isError = true) {
    message.textContent = value || '';
    message.style.color = isError ? '#f0c5a8' : '#c9ddb6';
  }

  function setMode(mode) {
    const isRegister = mode === 'register';
    registerForm.hidden = !isRegister;
    loginForm.hidden = isRegister;
    modeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.pwaMode === mode));
    });
    setMessage('');
  }

  async function readJson(response) {
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  async function unlockIfSignedIn() {
    try {
      const response = await fetch('/api/account/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return false;
      html.classList.add('pwa-authenticated');
      overlay.setAttribute('aria-hidden', 'true');
      return true;
    } catch {
      return false;
    }
  }

  async function submitCredentials(form, endpoint, body, buttonLabel) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const previousLabel = button.textContent;
    button.textContent = 'جارٍ التنفيذ…';
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await readJson(response);
      if (await unlockIfSignedIn()) {
        form.reset();
        return;
      }
      throw new Error('تم إرسال البيانات لكن تعذر تأكيد الدخول. حاول مرة أخرى.');
    } catch (error) {
      setMessage(error.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
      if (error.code === 'PHONE_ALREADY_REGISTERED') setMode('login');
    } finally {
      button.disabled = false;
      button.textContent = previousLabel || buttonLabel;
    }
  }

  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.pwaMode)));

  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCredentials(registerForm, '/api/account/register', {
      name: document.getElementById('pwa-register-name').value.trim(),
      phone: document.getElementById('pwa-register-phone').value.replace(/[\s().-]/g, ''),
      password: document.getElementById('pwa-register-password').value
    }, 'إنشاء الحساب');
  });

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCredentials(loginForm, '/api/account/login', {
      phone: document.getElementById('pwa-login-phone').value.replace(/[\s().-]/g, ''),
      password: document.getElementById('pwa-login-password').value
    }, 'تسجيل الدخول');
  });

  setMode('register');
  unlockIfSignedIn().then(signedIn => {
    if (!signedIn) {
      overlay.setAttribute('aria-hidden', 'false');
      document.getElementById('pwa-register-name').focus({ preventScroll: true });
    }
  });
})();
