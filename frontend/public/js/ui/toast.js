const stack = () => document.getElementById('toast-stack');

/**
 * Notificacion emergente. Si se pasa `title`, se muestra en negrita arriba
 * del mensaje (usado para "Nuevo mensaje de <usuario>"). Si se pasa
 * `onClick`, el toast completo se vuelve clicable (p. ej. para saltar
 * directo a la conversacion donde llego el mensaje) y muestra un cursor de
 * mano para indicarlo.
 */
export function toast(message, { error = false, duration = 4000, title = null, onClick = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}${onClick ? ' clickable' : ''}`;

  if (title) {
    const titleEl = document.createElement('strong');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    el.appendChild(titleEl);
  }
  const bodyEl = document.createElement('div');
  bodyEl.className = 'toast-body';
  bodyEl.textContent = message;
  el.appendChild(bodyEl);

  if (onClick) {
    el.addEventListener('click', () => {
      onClick();
      el.remove();
    });
  }

  stack().appendChild(el);
  setTimeout(() => el.remove(), duration);
  return el;
}
