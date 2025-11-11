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
   * ¡CAMBIO! Inicializa los listeners de sonido globales Y el listener de 'Escape'.
   */
  initUtils: () => {
    window.addEventListener('mousedown', () => utils.playSound('down'));
    window.addEventListener('mouseup', () => utils.playSound('up'));

    // ¡NUEVO! Listener para la tecla Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 1. Cerrar el popup de versión si está abierto
        if (!dom.versionPopup.classList.contains('hidden')) {
          dom.versionPopup.classList.add('hidden');
          utils.playSound('close'); // Tocar sonido de cierre
          return; // Salir para no cerrar un modal también
        }

        // 2. Cerrar modales (el de confirmación tiene más prioridad)
        if (!dom.modalConfirm.classList.contains('hidden')) {
          utils.closeModal(dom.modalConfirm);
          // Si es un modal de confirmación, simular un "No"
          if (state.pendingDeleteData) {
            state.pendingDeleteData = null;
          }
          return;
        }
        if (!dom.modalConfig.classList.contains('hidden')) {
          utils.closeModal(dom.modalConfig);
          return;
        }
        if (!dom.manageVersionsModal.classList.contains('hidden')) {
          utils.closeModal(dom.manageVersionsModal);
          return;
        }
        // Opcional: Cerrar modal de carga (lo dejaremos comentado por ahora)
        // if (!dom.modalLoading.classList.contains('hidden')) {
        //   utils.closeModal(dom.modalLoading);
        //   return;
        // }
      }
    });
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
    utils.hideLoadingToast(); 
    
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
    dom.toast.classList.remove('loading'); // Asegurarse de que no sea un toast de carga
    
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 2900);
  },

  /**
   * Muestra un toast de carga persistente.
   */
  showLoadingToast: (message) => {
    clearTimeout(toastTimer);
    toastTimer = null; // Indicar que es un toast de carga
    
    dom.toastMessage.textContent = message;

    const icon = dom.toast.querySelector('i');
    icon.className = 'fas fa-spinner fa-spin'; 
    dom.toast.style.borderColor = 'var(--color-grey-light)'; 
    icon.style.color = 'var(--color-grey-light)'; 

    dom.toast.classList.add('show');
    dom.toast.classList.add('loading'); // Añadir clase 'loading'
  },

  /**
   * Oculta el toast (usado para el de carga).
   */
  hideLoadingToast: () => {
    if (dom.toast.classList.contains('loading')) {
      dom.toast.classList.remove('show');
      dom.toast.classList.remove('loading');
    }
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