// main.js

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');
const { marked } = require('marked');

let mainWindow;

// --- Definición de rutas persistentes ---
const LAUNCHER_DIR = path.join(app.getPath('userData'), 'genesislauncher');
const VERSIONS_DIR = path.join(LAUNCHER_DIR, 'versions');
const SETTINGS_FILE = path.join(LAUNCHER_DIR, 'settings.json');
const NEWS_DIR = path.join(app.getAppPath(), 'news');

fs.mkdirSync(VERSIONS_DIR, { recursive: true });
// fs.mkdirSync(NEWS_DIR, { recursive: true });

const DEFAULT_SETTINGS = { 
  theme: 'funkin',
  language: 'es',
  autoLaunch: true,
  soundEffects: true,
  customCursor: true
};


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    // ¡¡¡CAMBIO!!! Ventana sin marco
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  mainWindow.setMenu(null); 
  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// --- ¡¡¡NUEVO!!! Controladores de Ventana ---
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
  app.quit();
});


// --- FUNCIÓN DE DESCARGA ---
function downloadFile(url, destPath, onProgress, onComplete, onError) {
  const fileStream = fs.createWriteStream(destPath);
  const request = https.get(url, (response) => {
    if (response.statusCode > 300 && response.statusCode < 400 && response.headers.location) {
      fileStream.close(); fs.unlink(destPath, () => {});
      downloadFile(response.headers.location, destPath, onProgress, onComplete, onError);
      return;
    }
    // ¡¡¡CAMBIO!!! Enviar error con código de estado
    if (response.statusCode !== 200) { 
      onError(new Error(`Error: ${response.statusCode}`)); 
      fileStream.close(); 
      fs.unlink(destPath, () => {});
      return; 
    }
    const totalBytes = parseInt(response.headers['content-length'], 10);
    let receivedBytes = 0;
    response.on('data', (chunk) => {
      receivedBytes += chunk.length;
      
      // ¡¡¡CAMBIO!!! Enviar bytes recibidos y totales además del porcentaje
      let percent = 0;
      if (totalBytes > 0) percent = (receivedBytes / totalBytes) * 100;
      onProgress({ percent, receivedBytes, totalBytes });
      
    });
    response.pipe(fileStream);
    fileStream.on('finish', () => { fileStream.close(); onComplete(); });
  }).on('error', (err) => { fs.unlink(destPath, () => {}); onError(err); });
  fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); onError(err); });
}

// --- FUNCIÓN DE EJECUCIÓN (Modificada para WINE y exeName) ---
function executeGame(installPath, exeName) {
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const exePath = path.join(installPath, exeName);
  const wineExePath = path.join(installPath, `${exeName}.exe`); // Usa el 'exeName'
  
  let finalExePath = null;
  let useWine = false;

  if (isLinux && fs.existsSync(exePath)) {
    // Linux nativo
    finalExePath = exePath;
  } else if (isLinux && fs.existsSync(wineExePath)) {
    // Linux con Wine (fallback)
    finalExePath = wineExePath;
    useWine = true;
  } else if (isWin && fs.existsSync(wineExePath)) {
    // Windows nativo
    finalExePath = wineExePath;
  } else {
    mainWindow.webContents.send('download-error', { error: `Ejecutable no encontrado en: ${installPath}` });
    return;
  }
  
  if (isLinux && !useWine) { 
    try { fs.chmodSync(finalExePath, 0o755); } catch (err) { /*...*/ } 
  }
  
  const windowBounds = mainWindow.getBounds();
  mainWindow.hide();
  
  const command = useWine ? 'wine' : finalExePath;
  const args = useWine ? [finalExePath] : [];

  const gameProcess = execFile(command, args, { cwd: installPath }, (error, stdout, stderr) => {
    if (mainWindow) {
      mainWindow.setBounds(windowBounds);
      mainWindow.show();
    }
    if (error) { 
      console.error(`Error al ejecutar: ${error.message}`); 
    }
  });
  
  gameProcess.on('error', (error) => {
    if (mainWindow) {
      mainWindow.setBounds(windowBounds);
      mainWindow.show();
    }
    const errorMsg = useWine ? `Error al iniciar con Wine (¿Está instalado?): ${error.message}` : `Error al iniciar: ${error.message}`;
    mainWindow.webContents.send('download-error', { error: errorMsg });
  });
}

// --- LÓGICA DE INSTALACIÓN (Modificada para WINE Fallback) ---
ipcMain.on('launch-game', (event, installData) => {
  const { name, engine, v, links, autoLaunch, exeName } = installData;
  const installPath = path.join(VERSIONS_DIR, engine, v);
  const zipFilePath = path.join(installPath, 'funkin.zip');
  
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const exePath = path.join(installPath, exeName);
  const wineExePath = path.join(installPath, `${exeName}.exe`);
  
  const nativeExeExists = isLinux && fs.existsSync(exePath);
  const wineExeExists = (isWin || isLinux) && fs.existsSync(wineExePath);

  if (fs.existsSync(installPath) && (nativeExeExists || wineExeExists)) {
    mainWindow.webContents.send('game-ready', { name, path: installPath });
    executeGame(installPath, exeName); // executeGame sabe cuál ejecutar
  } else {
    // No instalado, descargar
    fs.mkdirSync(installPath, { recursive: true });
    
    const primaryUrl = isLinux ? links.linux : links.windows;
    const fallbackUrl = (isLinux && links.windows) ? links.windows : null;

    // ¡¡¡CAMBIO!!! onDownloadProgress ahora espera un objeto
    const onDownloadProgress = (progressData) => { 
      mainWindow.webContents.send('download-progress', { ...progressData, url: primaryUrl || fallbackUrl }); 
    };
    
    const onDownloadComplete = () => {
      mainWindow.webContents.send('unzip-start');
      try {
        const zip = new AdmZip(zipFilePath);
        zip.extractAllTo(installPath, true);
        fs.unlinkSync(zipFilePath);
        mainWindow.webContents.send('download-complete', { name, path: installPath });
        if (autoLaunch) executeGame(installPath, exeName);
      } catch (err) { mainWindow.webContents.send('download-error', { error: `Error al descomprimir: ${err.message}` }); }
    };

    const onFallbackError = (err) => {
      mainWindow.webContents.send('download-error', { error: `Error en fallback de Windows: ${err.message}` });
    };

    const onDownloadError = (err) => {
      // ¡¡¡CAMBIO!!! Lógica de Fallback
      if (isLinux && fallbackUrl && primaryUrl && (err.message.includes('404') || err.message.includes('500'))) { // 500 para GitHub a veces
        console.log('Linux 404/500, intentando fallback a Windows...');
        mainWindow.webContents.send('download-progress', { percent: 0, receivedBytes: 0, totalBytes: 0, url: 'Linux 404, probando Windows...' });
        downloadFile(fallbackUrl, zipFilePath, onDownloadProgress, onDownloadComplete, onFallbackError);
      } else {
        mainWindow.webContents.send('download-error', { error: err.message });
      }
    };
    
    if (!primaryUrl && fallbackUrl) {
      console.log('No hay URL primaria para Linux, probando Windows...');
      downloadFile(fallbackUrl, zipFilePath, onDownloadProgress, onDownloadComplete, onFallbackError);
    } else if (primaryUrl) {
      downloadFile(primaryUrl, zipFilePath, onDownloadProgress, onDownloadComplete, onDownloadError);
    } else {
        mainWindow.webContents.send('download-error', { error: `No hay links de descarga para ${process.platform}` });
    }
  }
});

// --- MANEJADORES DE GESTIÓN ---
ipcMain.on('open-install-path', (event, { engine, v }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  if (fs.existsSync(installPath)) shell.openPath(installPath);
});

ipcMain.on('delete-install', (event, { engine, v, id }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  try {
    if (fs.existsSync(installPath)) fs.rmSync(installPath, { recursive: true, force: true });
    event.reply('delete-success', { engine, v });
  } catch (err) { /* ... */ }
});

// --- VERIFICADOR DE ESTADO DE INSTALACIÓN (Modificado para WINE y exeName) ---
ipcMain.handle('check-install-status', async (event, { engine, v, exeName }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const exePath = path.join(installPath, exeName);
  const wineExePath = path.join(installPath, `${exeName}.exe`);
  
  const nativeExeExists = isLinux && fs.existsSync(exePath);
  const wineExeExists = (isWin || isLinux) && fs.existsSync(wineExePath);

  return fs.existsSync(installPath) && (nativeExeExists || wineExeExists);
});

// --- MANEJADORES DE PERSISTENCIA (CONFIGURACIÓN) ---
ipcMain.handle('load-settings', async (event) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (err) { console.error('Error al leer settings.json:', err); }
  return DEFAULT_SETTINGS;
});
ipcMain.on('save-settings', (event, settingsData) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsData, null, 2));
  } catch (err) { console.error('Error al guardar settings.json:', err); }
});

// --- MANEJADOR DE NOTICIAS ---
ipcMain.handle('load-news', async (event) => {
  try {
    const files = fs.readdirSync(NEWS_DIR).filter(file => file.endsWith('.md'));
    const articles = files.map(file => {
      const filePath = path.join(NEWS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      return { file, content, mtime: stats.mtime };
    });
    
    articles.sort((a, b) => b.mtime - a.mtime);
    
    return articles.map(article => ({
      html: marked.parse(article.content)
    }));
    
  } catch (err) {
    console.error('Error al cargar noticias:', err);
    return [{ html: '<h3>Error al cargar noticias</h3><p>Asegúrate de que la carpeta "news" exista.</p>' }];
  }
});