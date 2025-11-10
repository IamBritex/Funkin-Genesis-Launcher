// src/ipc.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state =require('./state');
const { formatBytes, closeModal, openModal, showToast } = require('./utils');

/**
 * @param {function} updateFooterStateCallback - Función importada de 'selection.js' 
 * para evitar dependencias circulares.
 */
function initIpcListeners(updateFooterStateCallback) {

  ipcRenderer.on('download-progress', (event, { percent, receivedBytes, totalBytes, url }) => {
    if(url && url.includes('probando Windows')) {
      dom.downloadStatusText.textContent = 'Versión Linux no encontrada, probando Windows...';
    } else if (state.selectedInstall) {
      dom.downloadStatusText.textContent = `Descargando: ${state.selectedInstall.name}`;
    }
    
    const percentRounded = Math.round(percent);
    dom.downloadPercentText.textContent = `${percentRounded}%`;
    dom.downloadProgressBarFill.style.width = `${percentRounded}%`;

    if (totalBytes > 0) {
      dom.downloadSizeText.textContent = `${formatBytes(receivedBytes, 1)} / ${formatBytes(totalBytes, 1)}`;
    } else {
      dom.downloadSizeText.textContent = formatBytes(receivedBytes, 1);
    }
  });
  
  ipcRenderer.on('unzip-start', () => {
    dom.downloadBar.classList.add('hidden');
    dom.loadingStatus.textContent = `Descomprimiendo: ${state.selectedInstall.name}`;
    openModal(dom.modalLoading);
  });
  
  ipcRenderer.on('download-complete', (event, { name, path }) => {
    document.body.classList.remove('is-downloading');
    dom.versionSelectorButton.disabled = false;
    
    dom.loadingStatus.textContent = state.appSettings.autoLaunch ? `Ejecutando: ${path}` : '¡Completado!';
    
    if (state.selectedInstall && state.selectedInstall.name === name) {
      state.selectedInstall.isDownloaded = true;
      if (updateFooterStateCallback) {
        updateFooterStateCallback(state.selectedInstall.v);
      }
    }
    
    setTimeout(() => {
      closeModal(dom.modalLoading);
      showToast(`¡${name} se instaló correctamente!`);
    }, 1500);
  });
  
  ipcRenderer.on('game-ready', (event, { name, path }) => {
    dom.loadingStatus.textContent = `Ejecutando: ${path}`;
    setTimeout(() => { closeModal(dom.modalLoading); }, 1000);
  });
  
  ipcRenderer.on('download-error', (event, { error }) => {
    document.body.classList.remove('is-downloading');
    dom.versionSelectorButton.disabled = false;
    
    dom.downloadBar.classList.add('hidden');
    closeModal(dom.modalLoading);

    dom.loadingStatus.textContent = 'Error';
    console.error(error);
    if (state.selectedInstall && updateFooterStateCallback) {
      updateFooterStateCallback(state.selectedInstall.v);
    }
    showToast(`Error: ${error}`, true);
  });

  ipcRenderer.on('delete-success', (event, { engine, v }) => {
    showToast(`Se borró ${engine} ${v} correctamente.`);

    if (state.pendingDeleteData && state.pendingDeleteData.type === 'delete-version' &&
        state.pendingDeleteData.engine === engine && state.pendingDeleteData.v === v) {
      
      const elementToRemove = state.pendingDeleteData.elementToRemove;
      const versionList = elementToRemove.parentElement;
      elementToRemove.remove();
      
      if (versionList.children.length === 0) {
        versionList.parentElement.remove();
      }

      if (dom.manageVersionsList.children.length === 0) {
        dom.manageVersionsList.innerHTML = '<p style="text-align: center; padding: 1em;">No hay versiones instaladas.</p>';
      }
    }
    
    state.pendingDeleteData = null;

    if (state.currentSelectedEngineKey === engine && state.currentSelectedVersion === v) {
      if (updateFooterStateCallback) {
        updateFooterStateCallback(v);
      }
    }
  });
}

module.exports = { initIpcListeners };