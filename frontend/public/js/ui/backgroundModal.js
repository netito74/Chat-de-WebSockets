import { api } from '../api.js';
import { toast } from './toast.js';

export async function initSettingsModal({ onBackgroundChanged }) {
  const grid = document.getElementById('gradient-grid');
  const { gradients } = await api.getGradients();
  const { background } = await api.getBackground();

  grid.innerHTML = '';
  for (const [key, css] of Object.entries(gradients)) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `gradient-swatch${background.type === 'gradient' && background.value === key ? ' is-selected' : ''}`;
    swatch.style.backgroundImage = css;
    swatch.title = key.replace('agora_', '');
    swatch.addEventListener('click', async () => {
      try {
        const { background: updated } = await api.setBackground({ type: 'gradient', value: key });
        onBackgroundChanged(updated, gradients);
        document.querySelectorAll('.gradient-swatch').forEach((s) => s.classList.remove('is-selected'));
        swatch.classList.add('is-selected');
      } catch (err) {
        toast(err.message, { error: true });
      }
    });
    grid.appendChild(swatch);
  }

  document.getElementById('btn-bg-url').onclick = async () => {
    const input = document.getElementById('bg-url-input');
    const url = input.value.trim();
    const errorEl = document.getElementById('settings-error');
    errorEl.textContent = '';
    if (!url) return;
    try {
      const { background: updated } = await api.setBackground({ type: 'url', value: url });
      onBackgroundChanged(updated, gradients);
      input.value = '';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };

  document.getElementById('bg-file-input').onchange = async (e) => {
    const file = e.target.files[0];
    const errorEl = document.getElementById('settings-error');
    errorEl.textContent = '';
    if (!file) return;
    try {
      const { url } = await api.uploadBackground(file);
      const { background: updated } = await api.setBackground({ type: 'upload', value: url });
      onBackgroundChanged(updated, gradients);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      e.target.value = '';
    }
  };

  return gradients;
}
