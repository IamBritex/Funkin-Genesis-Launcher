// src/action.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');
const { openModal } = require('./utils');

function detectOS() {
  const { process } = state.getNodeDeps();
  state.currentOS = (process.platform === 'win32') ? 'windows' : (process.platform === 'linux') ? 'linux' : 'unsupported';
}

function initActions() {
  dom.playButton.addEventListener('click', () => {
    if (!state.selectedInstall || dom.playButton.disabled) return;
    
    if (!state.selectedInstall.isDownloaded) {
      dom.playButtonText.textContent = 'Descargando';
      dom.playButton.disabled = true;
      
      dom.downloadStatusText.textContent = `Descargando: ${state.selectedInstall.name}`;
      dom.downloadPercentText.textContent = '0%';
      dom.downloadProgressBarFill.style.width = '0%';
      dom.downloadBar.classList.remove('hidden');
      
      document.body.classList.add('is-downloading');
      dom.versionSelectorButton.disabled = true;
      
    } else {
      dom.loadingStatus.textContent = `Ejecutando: ${state.selectedInstall.name}`;
      openModal(dom.modalLoading);
    }
    
    ipcRenderer.send('launch-game', state.selectedInstall);
  });
}

module.exports = { initActions, detectOS };