// modules/window-controls.js
const { ipcMain } = require('electron');

function initWindowControls(mainWindow) {
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });
  
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  
  ipcMain.on('window-close', () => {
    // app.quit() es manejado por el main.js
    mainWindow.close();
  });
}

module.exports = { initWindowControls };