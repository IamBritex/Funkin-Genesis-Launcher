// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { LAUNCHER_DIR, VERSIONS_DIR, MODS_DIR } = require('./modules/constants');

// Importar todos los módulos de manejo de IPC
const { initWindowControls } = require('./modules/window-controls');
const { initGameHandler } = require('./modules/game-handler');
const { initVersionManager } = require('./modules/version-manager');
const { initModsHandler } = require('./modules/mods-handler');
const { initSettingsHandler } = require('./modules/settings-handler');
const { initNewsHandler } = require('./modules/news-handler');

let mainWindow;

// Asegurarse de que las carpetas base existan al inicio
fs.mkdirSync(VERSIONS_DIR, { recursive: true });
fs.mkdirSync(MODS_DIR, { recursive: true });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();

  // --- INICIALIZAR TODOS LOS MÓDULOS ---
  // Pasamos 'mainWindow' a los módulos que la necesitan
  
  initWindowControls(mainWindow);
  initGameHandler(mainWindow);
  initVersionManager(mainWindow);
  initModsHandler(mainWindow);
  
  // Estos no necesitan 'mainWindow', solo registran sus handlers
  initSettingsHandler();
  initNewsHandler();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});