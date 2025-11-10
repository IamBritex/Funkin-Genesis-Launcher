// main.js

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
// ¡CAMBIO! Importamos fs.promises para operaciones asíncronas
const fs = require('fs'); 
const fsp = fs.promises; // Usaremos 'fsp' para las promesas de 'fs'
const https = require('https');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');
const { marked } = require('marked');
const yaml = require('js-yaml'); 

let mainWindow;

// --- Definición de rutas persistentes ---
const LAUNCHER_DIR = path.join(app.getPath('userData'), 'genesislauncher');
const VERSIONS_DIR = path.join(LAUNCHER_DIR, 'versions');
const MODS_DIR = path.join(LAUNCHER_DIR, 'mods'); 
const SETTINGS_FILE = path.join(LAUNCHER_DIR, 'settings.json');
const NEWS_DIR = path.join(app.getAppPath(), 'news'); 
const LOCAL_VERSIONS_FILE = path.join(app.getAppPath(), 'versions.yaml'); 

// Usamos la versión síncrona solo para la configuración inicial
fs.mkdirSync(VERSIONS_DIR, { recursive: true });
fs.mkdirSync(MODS_DIR, { recursive: true }); 

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
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  mainWindow.setMenu(null); 
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// --- Controladores de Ventana ---
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
      let percent = 0;
      if (totalBytes > 0) percent = (receivedBytes / totalBytes) * 100;
      onProgress({ percent, receivedBytes, totalBytes });
      
    });
    response.pipe(fileStream);
    fileStream.on('finish', () => { fileStream.close(); onComplete(); });
  }).on('error', (err) => { fs.unlink(destPath, () => {}); onError(err); });
  fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); onError(err); });
}

// --- FUNCIÓN DE EJECUCIÓN ---
function executeGame(installPath, exeName) {
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const exePath = path.join(installPath, exeName);
  const wineExePath = path.join(installPath, `${exeName}.exe`); 
  
  let finalExePath = null;
  let useWine = false;

  if (isLinux && fs.existsSync(exePath)) {
    finalExePath = exePath;
  } else if (isLinux && fs.existsSync(wineExePath)) {
    finalExePath = wineExePath;
    useWine = true;
  } else if (isWin && fs.existsSync(wineExePath)) {
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

// --- LÓGICA DE INSTALACIÓN ---
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
    executeGame(installPath, exeName); 
  } else {
    fs.mkdirSync(installPath, { recursive: true });
    
    const primaryUrl = isLinux ? links.linux : links.windows;
    const fallbackUrl = (isLinux && links.windows) ? links.windows : null;

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
      if (isLinux && fallbackUrl && primaryUrl && (err.message.includes('404') || err.message.includes('500'))) { 
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
ipcMain.handle('get-installed-versions', async () => {
  let versionsData;
  try {
    const data = fs.readFileSync(LOCAL_VERSIONS_FILE, 'utf-8');
    versionsData = yaml.load(data);
  } catch (err) {
    console.error("No se pudo leer/parsear el versions.yaml local:", err);
    return []; 
  }

  const enginesArray = versionsData.engines; 
  const installedData = [];
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  try {
    const engineKeys = fs.readdirSync(VERSIONS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const engineKey of engineKeys) {
      const engineInfo = enginesArray.find(e => e.id === engineKey);
      
      if (!engineInfo) continue; 

      const enginePath = path.join(VERSIONS_DIR, engineKey);
      const installedVersions = [];

      const versionFolders = fs.readdirSync(enginePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const v of versionFolders) {
        const versionPath = path.join(enginePath, v);
        const exeName = engineInfo.executable_name; 

        const exePath = path.join(versionPath, exeName);
        const wineExePath = path.join(versionPath, `${exeName}.exe`);
        
        const nativeExeExists = isLinux && fs.existsSync(exePath);
        const wineExeExists = (isWin || isLinux) && fs.existsSync(wineExePath);

        if (fs.existsSync(versionPath) && (nativeExeExists || wineExeExists)) {
          installedVersions.push(v);
        }
      }

      if (installedVersions.length > 0) {
        installedVersions.sort().reverse(); 
        installedData.push({
          key: engineKey,
          name: engineInfo.name,
          icon: engineInfo.icon_path || engineInfo.icon_base64, 
          icon_is_path: !!engineInfo.icon_path, 
          versions: installedVersions
        });
      }
    }
    return installedData;
  } catch (err) {
    console.error("Error al escanear versiones instaladas:", err);
    return [];
  }
});


ipcMain.on('open-install-path', (event, { engine, v }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  if (fs.existsSync(installPath)) {
    shell.openPath(installPath);
  } else {
    mainWindow.webContents.send('download-error', { error: `La carpeta no existe: ${installPath}` });
  }
});

ipcMain.on('delete-install', (event, { engine, v }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  try {
    if (fs.existsSync(installPath)) {
      // ¡CAMBIO! Usamos la versión asíncrona para borrar
      // Usamos `fs.rm` en lugar de `fs.rmSync`
      fsp.rm(installPath, { recursive: true, force: true })
        .then(() => {
          event.reply('delete-success', { engine, v });
        })
        .catch(err => {
          console.error("Error al borrar (async):", err);
          mainWindow.webContents.send('download-error', { error: `Error al borrar: ${err.message}` });
        });
    } else {
      event.reply('delete-success', { engine, v }); // Si no existe, igual fue un éxito
    }
  } catch (err) { 
    console.error("Error al iniciar borrado:", err);
    mainWindow.webContents.send('download-error', { error: `Error al borrar: ${err.message}` });
  }
});

ipcMain.handle('check-install-status', async (event, { engine, v, exeName }) => {
  const installPath = path.join(VERSIONS_DIR, engine, v);
  
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const exePath = path.join(installPath, exeName);
  const wineExePath = path.join(installPath, `${exeName}.exe`);
  
  // ¡CAMBIO! Usamos 'access' asíncrono para chequear
  const checkExists = async (filePath) => {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  const nativeExeExists = isLinux && await checkExists(exePath);
  const wineExeExists = (isWin || isLinux) && await checkExists(wineExePath);
  const pathExists = await checkExists(installPath);

  return pathExists && (nativeExeExists || wineExeExists);
});

// --- MANEJADORES DE PERSISTENCIA (CONFIGURACIÓN) ---
ipcMain.handle('load-settings', async (event) => {
  try {
    // ¡CAMBIO! Asíncrono
    await fsp.access(SETTINGS_FILE); 
    const data = await fsp.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (err) { 
    console.error('Error al leer settings.json (usando defaults):', err.message); 
  }
  return DEFAULT_SETTINGS;
});

ipcMain.on('save-settings', (event, settingsData) => {
  try {
    // ¡CAMBIO! Asíncrono. No necesitamos 'await' porque no bloquea.
    fsp.writeFile(SETTINGS_FILE, JSON.stringify(settingsData, null, 2));
  } catch (err) { console.error('Error al guardar settings.json:', err); }
});

// --- ¡NUEVO! MANEJADORES DE MODS (ASÍNCRONOS) ---

/**
 * Escanea el directorio de mods y devuelve los metadatos de los mods instalados.
 * AHORA ES TOTALMENTE ASÍNCRONO.
 */
ipcMain.handle('mods:get-installed', async () => {
  let modFolders;
  try {
    // 1. Lee el directorio de mods de forma asíncrona
    const dirents = await fsp.readdir(MODS_DIR, { withFileTypes: true });
    modFolders = dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (e) {
    console.error('Error al escanear directorio de mods:', e.message);
    return []; // Devuelve vacío si falla
  }

  // 2. Mapea cada nombre de carpeta a una promesa que lee el JSON
  const readPromises = modFolders.map(async (folderName) => {
    const metaPath = path.join(MODS_DIR, folderName, '_polymod_meta.json');
    try {
      // 2a. Chequea si el JSON existe (asíncrono)
      await fsp.access(metaPath); 
      // 2b. Lee el archivo (asíncrono)
      const content = await fsp.readFile(metaPath, 'utf-8'); 
      const meta = JSON.parse(content);
      
      if (meta.title && meta.description && meta.mod_version) {
        return { // Devuelve el objeto del mod
          title: meta.title,
          description: meta.description,
          mod_version: meta.mod_version,
        };
      }
    } catch (e) {
      // Si access() o readFile() fallan, o el JSON es inválido
      console.error(`Error al procesar _polymod_meta.json para ${folderName}:`, e.message);
    }
    return null; // Devuelve null si algo falla
  });

  // 3. Espera a que todas las promesas de lectura se completen
  const results = await Promise.all(readPromises);
  
  // 4. Filtra los resultados nulos (mods fallidos) y devuelve el array final
  return results.filter(mod => mod !== null);
});


/**
 * Abre un diálogo para seleccionar una carpeta de mod, la valida y la copia.
 * AHORA ES TOTALMENTE ASÍNCRONO.
 */
ipcMain.handle('mods:add-mod', async () => {
  // El diálogo ya es asíncrono
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar Carpeta del Mod',
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return { status: 'cancelled' };
  }

  const selectedPath = filePaths[0];
  const metaPath = path.join(selectedPath, '_polymod_meta.json');
  const folderName = path.basename(selectedPath);
  const targetPath = path.join(MODS_DIR, folderName);

  // 1. Validar que el mod no exista ya (Asíncrono)
  try {
    await fsp.access(targetPath);
    // Si 'access' tiene éxito, la carpeta ya existe
    return { error: `El mod "${folderName}" ya está instalado.` };
  } catch (e) {
    // Si 'access' falla (ENOENT), la carpeta no existe. Continuamos.
  }

  // 2. Validar que exista _polymod_meta.json (Asíncrono)
  try {
    await fsp.access(metaPath);
  } catch (e) {
    return { error: 'La carpeta seleccionada no contiene "_polymod_meta.json".' };
  }

  let modData;
  try {
    // 3. Validar contenido del JSON (Asíncrono)
    const content = await fsp.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    
    if (!meta.title || !meta.description || !meta.mod_version) {
      return { error: 'El archivo "_polymod_meta.json" no tiene el formato requerido (title, description, mod_version).' };
    }
    
    modData = {
      title: meta.title,
      description: meta.description,
      mod_version: meta.mod_version,
    };

  } catch (e) {
    return { error: `Error al leer el JSON: ${e.message}` };
  }

  try {
    // 4. Copiar la carpeta (¡LA SOLUCIÓN! Asíncrono)
    await fsp.cp(selectedPath, targetPath, { recursive: true });
  } catch (e) {
    return { error: `Error al copiar la carpeta del mod: ${e.message}` };
  }

  // 5. Éxito
  return { success: true, modData };
});


// --- Helpers de Fetch ---
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GenesisLauncher' }
  });
  if (!response.ok) throw new Error(`Failed to fetch JSON: ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GenesisLauncher' }
  });
  if (!response.ok) throw new Error(`Failed to fetch Text: ${response.statusText}`);
  return response.text();
}


// --- MANEJADOR DE NOTICIAS (Remoto con fallback local) ---
ipcMain.handle('load-news', async (event) => {
  try {
    const apiUrl = 'https://api.github.com/repos/IamBritex/Funkin-Genesis-Launcher/contents/news';
    const files = await fetchJson(apiUrl);
    
    const mdFiles = files.filter(file => file.name.endsWith('.md'));
    if (mdFiles.length === 0) throw new Error("No .md files found in remote repo");
    
    const downloadPromises = mdFiles.map(file => fetchText(file.download_url));
    const markdownContents = await Promise.all(downloadPromises);
    
    console.log("Noticias cargadas desde GitHub");
    return markdownContents.reverse().map(content => ({
      html: marked.parse(content)
    }));

  } catch (err) {
    console.error('Error fetching remote news, falling back to local:', err.message);
    try {
      // ¡CAMBIO! Asíncrono
      const files = await fsp.readdir(NEWS_DIR);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      const articles = await Promise.all(mdFiles.map(async (file) => {
        const filePath = path.join(NEWS_DIR, file);
        const content = await fsp.readFile(filePath, 'utf-8');
        const stats = await fsp.stat(filePath);
        return { file, content, mtime: stats.mtime };
      }));
      
      articles.sort((a, b) => b.mtime - a.mtime);
      
      return articles.map(article => ({
        html: marked.parse(article.content)
      }));
    } catch (localErr) {
      console.error('Error al cargar noticias locales:', localErr);
      return [{ html: '<h3>Error al cargar noticias</h3><p>No se pudo conectar al repositorio ni cargar noticias locales.</p>' }];
    }
  }
});