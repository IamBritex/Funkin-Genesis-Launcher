// src/settings.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');
const { openModal, closeModal } = require('./utils');

function applyTheme(themeName) {
  document.body.dataset.theme = themeName;
}

function applyCursor(isEnabled) {
  document.body.classList.toggle('custom-cursor-enabled', isEnabled);
}

function saveSettings() {
  state.appSettings.theme = dom.themeSelect.value;
  state.appSettings.language = dom.languageSelect.value;
  state.appSettings.autoLaunch = dom.launchToggle.checked;
  state.appSettings.soundEffects = dom.soundToggle.checked;
  state.appSettings.customCursor = dom.cursorToggle.checked;
  // modVisibility se guarda automáticamente porque es parte de state.appSettings
  ipcRenderer.send('save-settings', state.appSettings);
  applyTheme(state.appSettings.theme);
  applyCursor(state.appSettings.customCursor);
}

async function loadSettings() {
  try {
    state.appSettings = await ipcRenderer.invoke('load-settings');
    
    // ¡CAMBIO! Asegurarse de que modVisibility exista
    if (!state.appSettings.modVisibility) {
      state.appSettings.modVisibility = {};
    }

    dom.themeSelect.value = state.appSettings.theme;
    dom.languageSelect.value = state.appSettings.language;
    dom.launchToggle.checked = state.appSettings.autoLaunch;
    dom.soundToggle.checked = state.appSettings.soundEffects;
    dom.cursorToggle.checked = state.appSettings.customCursor;
    applyTheme(state.appSettings.theme);
    applyCursor(state.appSettings.customCursor);
  } catch (err) { console.error('Error al invocar "load-settings":', err); }
}

function initSettings() {
  // Listeners del Modal de Config
  dom.configBtn.addEventListener('click', () => openModal(dom.modalConfig));
  dom.closeModalConfigBtn.addEventListener('click', () => closeModal(dom.modalConfig));
  dom.modalConfig.addEventListener('click', (e) => { 
    if (e.target === dom.modalConfig) closeModal(dom.modalConfig); 
  });

  // Listeners de guardado
  dom.themeSelect.addEventListener('change', saveSettings);
  dom.languageSelect.addEventListener('change', saveSettings);
  dom.launchToggle.addEventListener('change', saveSettings);
  dom.soundToggle.addEventListener('change', saveSettings);
  dom.cursorToggle.addEventListener('change', saveSettings);

  // Cargar settings al iniciar
  return loadSettings();
}

module.exports = { initSettings };