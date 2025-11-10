// src/window.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');

function initResizer() {
  dom.resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
  function handleMouseMove(e) {
    const newWidth = Math.min(Math.max(e.clientX, state.minSidebarWidth), state.maxSidebarWidth);
    dom.sidebar.style.width = `${newWidth}px`;
  }
  function handleMouseUp() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
}

function initWindowControls() {
  dom.minBtn.addEventListener('click', () => ipcRenderer.send('window-minimize'));
  dom.maxBtn.addEventListener('click', () => ipcRenderer.send('window-maximize'));
  dom.closeBtn.addEventListener('click', () => ipcRenderer.send('window-close'));
}

function initWindow() {
  initResizer();
  initWindowControls();
}

module.exports = { initWindow };