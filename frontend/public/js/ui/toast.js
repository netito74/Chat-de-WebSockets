const stack = () => document.getElementById('toast-stack');

export function toast(message, { error = false, duration = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  stack().appendChild(el);
  setTimeout(() => el.remove(), duration);
}
