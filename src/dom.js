// src/dom.js

// --- ELEMENTOS DEL DOM ---
module.exports = {
  // Barra de título
  titleBarIcon: document.getElementById('title-bar-icon'),
  titleBarTitle: document.getElementById('title-bar-title'),
  minBtn: document.getElementById('min-btn'),
  maxBtn: document.getElementById('max-btn'),
  closeBtn: document.getElementById('close-btn'),

  // Footer
  playButton: document.getElementById('play-btn'),
  playButtonText: document.getElementById('play-button-text'),
  versionSelectorButton: document.getElementById('version-selector-button'),
  footerEngineIcon: document.getElementById('footer-engine-icon'),
  footerEngineName: document.getElementById('footer-engine-name'),
  footerVersionNumber: document.getElementById('footer-version-number'),
  osWarningIcon: document.getElementById('os-warning-icon'),
  
  // Popup de Versión
  versionPopup: document.getElementById('version-popup'),
  versionPopupList: document.getElementById('version-popup-list'),

  // Sidebar
  sidebar: document.getElementById('sidebar'),
  engineList: document.getElementById('engine-list'),
  configBtn: document.getElementById('config-btn'),
  manageVersionsBtn: document.getElementById('manage-versions-btn'),
  modsBtn: document.getElementById('mods-btn'), 
  
  // Contenido Principal
  newsContainer: document.getElementById('news-container'),
  modsContainer: document.getElementById('mods-container'), 
  
  // ¡NUEVO! Placeholder de Mods
  modsPlaceholder: document.getElementById('mods-placeholder'),
  noModsArrow: document.getElementById('no-mods-arrow'),
  
  // ¡NUEVO! Cabecera de Mods
  modsHeader: document.getElementById('mods-header'),
  searchInput: document.getElementById('search-input'),
  searchIcon: document.getElementById('search-icon'),
  addModHeaderBtn: document.getElementById('add-mod-header-btn'),
  
  // Otros
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
  resizer: document.getElementById('resizer'),
  
  // Modales
  modalLoading: document.getElementById('loading-overlay'),
  loadingStatus: document.getElementById('loading-status'),
  
  // Barra de Progreso
  downloadBar: document.getElementById('download-progress-bar-container'),
  downloadStatusText: document.getElementById('download-status-text'),
  downloadPercentText: document.getElementById('download-percent-text'),
  downloadSizeText: document.getElementById('download-size-text'),
  downloadProgressBarFill: document.getElementById('download-progress-bar-fill'),
  
  // Modal de Configuración
  modalConfig: document.getElementById('config-modal-overlay'),
  closeModalConfigBtn: document.getElementById('close-config-modal'),
  themeSelect: document.getElementById('theme-select'),
  languageSelect: document.getElementById('language-select'),
  launchToggle: document.getElementById('launch-toggle'),
  soundToggle: document.getElementById('sound-toggle'),
  cursorToggle: document.getElementById('cursor-toggle'),
  
  // Modal de Confirmación
  modalConfirm: document.getElementById('modal-confirm'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmYesBtn: document.getElementById('confirm-yes-btn'),
  confirmNoBtn: document.getElementById('confirm-no-btn'),

  // Modal de Gestión
  manageVersionsModal: document.getElementById('manage-versions-modal-overlay'),
  closeManageVersionsModalBtn: document.getElementById('close-manage-versions-modal'),
  manageVersionsList: document.getElementById('manage-versions-list'),

  // --- ELEMENTOS DE AUDIO ---
  audioElements: {
    open: document.getElementById('audio-open'),
    close: document.getElementById('audio-close'),
    down: document.getElementById('audio-click-down'),
    up: document.getElementById('audio-click-up'),
  }
};