// main.js
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { LAUNCHER_DIR, VERSIONS_DIR, MODS_DIR } = require('./modules/constants');

// ... (imports de módulos sin cambios) ...
const { initWindowControls } = require('./modules/window-controls');
const { initGameHandler } = require('./modules/game-handler');
const { initVersionManager } = require('./modules/version-manager');
const { initModsHandler } = require('./modules/mods-handler');
const { initSettingsHandler } = require('./modules/settings-handler');
const { initNewsHandler } = require('./modules/news-handler');

let mainWindow;
let splashWindow; 

fs.mkdirSync(VERSIONS_DIR, { recursive: true });
fs.mkdirSync(MODS_DIR, { recursive: true });

function createSplashWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const splashWidth = 250;
  const splashHeight = 200; // (Podrías hacerlo un poco más alto para el GIF: 250x250)
  
  const x = Math.round((width - splashWidth) / 2);
  const y = Math.round((height - splashHeight) / 2);

  splashWindow = new BrowserWindow({
    width: splashWidth,
    height: splashHeight,
    x: x,
    y: y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: false,
    webPreferences: {
      nodeIntegration: true,     // <-- Necesario para el 'require'
      contextIsolation: false, // <-- Necesario para el 'require'
    },
  });
  splashWindow.loadFile('splash.html');
  splashWindow.on('closed', () => (splashWindow = null));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();

  initWindowControls(mainWindow);
  initGameHandler(mainWindow);
  initVersionManager(mainWindow);
  initModsHandler(mainWindow);
  initSettingsHandler();
  initNewsHandler();
}

// ¡CAMBIO! Este listener AHORA le avisa al splash que anime
ipcMain.on('main-window-ready', () => {
  if (splashWindow) {
    // 1. Enviar mensaje a 'splash.js'
    splashWindow.webContents.send('splash-window-loaded');
  }
});

// ¡NUEVO! Este listener escucha cuando el splash TERMINÓ su animación
ipcMain.on('splash-animation-finished', () => {
  // 2. Cerrar el splash
  if (splashWindow) {
    splashWindow.close();
  }
  // 3. Mostrar la ventana principal
  if (mainWindow) {
    mainWindow.show();
  }
});


app.whenReady().then(() => {
  createSplashWindow();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createWindow();
  }
});