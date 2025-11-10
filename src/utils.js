// src/utils.js
const dom = require('./dom');
const state = require('./state');

let toastTimer;

const utils = {
  /**
   * Reproduce un efecto de sonido si están habilitados.
   */
  playSound: (soundName) => {
    if (!state.appSettings.soundEffects) return;
    const audio = dom.audioElements[soundName];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.error("Error al reproducir sonido:", e));
    }
  },

  /**
   * Inicializa los listeners de sonido globales.
   */
  initUtils: () => {
    window.addEventListener('mousedown', () => utils.playSound('down'));
    window.addEventListener('mouseup', () => utils.playSound('up'));
  },
  
  /**
   * Convierte un path de archivo local a una URL file://
   */
  getFileUrl: (filePath) => {
    const { path, __dirname } = state.getNodeDeps();
    if (!filePath) return state.defaultIconUrl;
    try {
      const resolvedPath = path.resolve(__dirname, filePath);
      const fileURL = new URL('file:');
      fileURL.pathname = resolvedPath;
      return fileURL.href;
    } catch (e) {
      console.error('Error creando file URL:', e, filePath);
      return state.defaultIconUrl;
    }
  },

  /**
   * Formatea bytes a un string legible (KB, MB, GB).
   */
  formatBytes: (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    if (isNaN(bytes) || bytes === null) return '\u00A0'; // Non-breaking space
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Muestra un mensaje toast.
   */
  showToast: (message, isError = false) => {
    clearTimeout(toastTimer);
    dom.toastMessage.textContent = message;
    
    const icon = dom.toast.querySelector('i');
    if (isError) {
      icon.className = 'fas fa-exclamation-circle';
      dom.toast.style.borderColor = 'var(--color-red-hover)';
      icon.style.color = 'var(--color-red-hover)';
    } else {
      icon.className = 'fas fa-check-circle';
      dom.toast.style.borderColor = 'var(--color-accent)';
      icon.style.color = 'var(--color-toast-icon)';
    }

    dom.toast.classList.add('show');
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 2900);
  },

  /**
   * Abre un elemento modal.
   */
  openModal: (modalElement) => {
    utils.playSound('open');
    modalElement.classList.remove('hidden');
  },

  /**
   * Cierra un elemento modal con animación.
   */
  closeModal: (modalElement) => {
    if (modalElement.classList.contains('hidden')) return;
    utils.playSound('close');
    modalElement.classList.add('closing');
    setTimeout(() => {
      modalElement.classList.add('hidden');
      modalElement.classList.remove('closing');
    }, 200);
  }
};

module.exports = utils;