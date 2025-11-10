// renderer.js
const { ipcRenderer } = require('electron');
const process = require('process');
const path = require('path');

// Importar módulos
const dom = require('./src/dom');
const state = require('./src/state');
const { initUtils, showToast } = require('./src/utils');
const { initWindow } = require('./src/window');
const { initSettings } = require('./src/settings');
const { loadVersionData, loadNews } = require('./src/data');
const { initSelection, updateFooterState, populateEngineList } = require('./src/selection');
const { initManageModals } = require('./src/manage');
const { initActions, detectOS } = require('./src/action');
const { initIpcListeners } = require('./src/ipc');
const { initMods } = require('./src/mods'); // ¡NUEVO!

window.addEventListener('DOMContentLoaded', async () => {
  // Inicializar estado y utilidades primero
  state.init({ process, path, __dirname });
  initUtils();

  // Detección de SO
  detectOS();

  // Cargar configuraciones y datos iniciales
  await initSettings(); // Carga y aplica settings
  
  // Cargar datos (versions.json, news) e inyectar las funciones que necesitan
  try {
    await loadVersionData(populateEngineList);
  } catch (err) {
    showToast(err.message, true);
  }
  await loadNews();

  // Inicializar el resto de la UI
  initWindow();
  initSelection();
  initManageModals();
  initActions();
  initMods(); // ¡NUEVO!
  
  // Inicializar los listeners de IPC al final
  // Se inyecta 'updateFooterState' para romper dependencias circulares
  initIpcListeners(updateFooterState);
});