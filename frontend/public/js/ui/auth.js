import { api } from '../api.js';
import { state, persistSessionFields } from '../state.js';

export function initAuthScreen({ onAuthenticated }) {
  const tabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      const isLogin = tab.dataset.tab === 'login';
      loginForm.classList.toggle('is-hidden', !isLogin);
      registerForm.classList.toggle('is-hidden', isLogin);
    });
  });

  function setError(form, message) {
    const el = document.querySelector(`[data-error-for="${form}"]`);
    if (el) el.textContent = message || '';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('login', '');
    const fd = new FormData(loginForm);
    try {
      const { token, user } = await api.login({
        username: fd.get('username').trim(),
        password: fd.get('password'),
      });
      state.token = token;
      state.user = user;
      persistSessionFields();
      onAuthenticated();
    } catch (err) {
      setError('login', err.message);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('register', '');
    const fd = new FormData(registerForm);
    try {
      const { token, user } = await api.register({
        username: fd.get('username').trim(),
        password: fd.get('password'),
        preferredLang: fd.get('preferredLang'),
      });
      state.token = token;
      state.user = user;
      persistSessionFields();
      onAuthenticated();
    } catch (err) {
      setError('register', err.message);
    }
  });
}
