// main.js

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); 
const fsp = fs.promises; 
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
  // mainWindow.webContents.openDevTools();
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

  // --- ¡CAMBIO! ---
  // El CWD (Current Working Directory) sigue siendo el 'installPath'
  // Esto es VITAL para que el juego encuentre sus assets (imágenes, música, etc.)
  // El symlink que creamos se encarga de redirigir la carpeta 'mods'.
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

// --- ¡CAMBIO! ---
// Pequeña función helper para crear el symlink de forma segura
function createModSymlink(installPath) {
  try {
    const installModsPath = path.join(installPath, 'mods');
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';

    // 1. Asegurarse de que la carpeta central MODS_DIR exista
    fs.mkdirSync(MODS_DIR, { recursive: true });

    // 2. Revisar si ya existe algo en 'installPath/mods'
    let stats;
    try {
      // lstat NO sigue el symlink, nos dice qué es el "archivo" mods
      stats = fs.lstatSync(installModsPath); 
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // Re-lanzar si no es "not found"
      stats = null;
    }

    // 3. Si existe algo (link o carpeta), borrarlo
    if (stats) {
      // fs.rmSync es la forma moderna de borrar carpetas o links
      fs.rmSync(installModsPath, { recursive: true, force: true });
    }

    // 4. Crear el nuevo symlink
    fs.symlinkSync(MODS_DIR, installModsPath, linkType);
    console.log(`Symlink de mods creado en: ${installModsPath}`);

  } catch (err) {
    console.error(`Error creando mod symlink en ${installPath}: ${err.message}`);
    // Enviar un toast, pero no un error que detenga todo
    mainWindow.webContents.send('download-error', { error: `Error al vincular mods: ${err.message}` });
  }
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

  // --- ¡CAMBIO! ---
  // Modificado este bloque 'if'
  if (fs.existsSync(installPath) && (nativeExeExists || wineExeExists)) {
    
    // --- ¡CAMBIO! ---
    // Llamamos a nuestra función helper ANTES de ejecutar el juego
    createModSymlink(installPath); 
    
    mainWindow.webContents.send('game-ready', { name, path: installPath });
    executeGame(installPath, exeName); 

  } else {
    // --- LÓGICA DE DESCARGA (Modificada) ---
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
        
        // --- ¡CAMBIO! ---
        // Llamamos a nuestra función helper DESPUÉS de descomprimir
        createModSymlink(installPath); 

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
      fsp.rm(installPath, { recursive: true, force: true })
        .then(() => {
          event.reply('delete-success', { engine, v });
        })
        .catch(err => {
          console.error("Error al borrar (async):", err);
          mainWindow.webContents.send('download-error', { error: `Error al borrar: ${err.message}` });
        });
    } else {
      event.reply('delete-success', { engine, v }); 
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
    fsp.writeFile(SETTINGS_FILE, JSON.stringify(settingsData, null, 2));
  } catch (err) { console.error('Error al guardar settings.json:', err); }
});

// --- MANEJADORES DE MODS (ASÍNCRONOS Y SEPARADOS) ---

function getFileUrlFromPath(filePath) {
  try {
    const fileURL = new URL('file:');
    fileURL.pathname = filePath;
    return fileURL.href;
  } catch (e) {
    return null;
  }
}

/**
 * ¡CAMBIO! Escanea y detecta Polymod, Psych y Codename (fallback).
 * AHORA TAMBIÉN DEVUELVE 'folderName'.
 */
ipcMain.handle('mods:get-installed', async () => {
  let modFolders;
  try {
    const dirents = await fsp.readdir(MODS_DIR, { withFileTypes: true });
    modFolders = dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (e) {
    console.error('Error al escanear directorio de mods:', e.message);
    return []; 
  }

  const readPromises = modFolders.map(async (folderName) => {
    const modPath = path.join(MODS_DIR, folderName);
    const polymodPath = path.join(modPath, '_polymod_meta.json');
    const psychPath = path.join(modPath, 'pack.json');
    
    let modData = null;

    // --- Intento 1: Detectar Polymod (V-Slice) ---
    try {
      await fsp.access(polymodPath); 
      const content = await fsp.readFile(polymodPath, 'utf-8'); 
      const meta = JSON.parse(content);
      
      if (meta.title && meta.description && meta.mod_version) {
        modData = {
          title: meta.title,
          description: meta.description,
          version: meta.mod_version,
          modType: 'polymod',
          engineKey: 'V-Slice',
          iconPath: null,
        };
      }
    } catch (e) { /* No es Polymod, o el JSON es inválido */ }

    // --- Intento 2: Detectar Psych Engine (si no se encontró Polymod) ---
    if (!modData) {
      try {
        await fsp.access(psychPath);
        const content = await fsp.readFile(psychPath, 'utf-8');
        const meta = JSON.parse(content);
        
        if (meta.name && meta.description) {
          let iconPath = null;
          const pngPath = path.join(modPath, 'pack.png');
          try {
            await fsp.access(pngPath);
            iconPath = getFileUrlFromPath(pngPath);
          } catch (pngErr) { /* No hay pack.png */ }
          
          modData = {
            title: meta.name,
            description: meta.description,
            version: null,
            modType: 'psych',
            engineKey: 'psych',
            iconPath: iconPath,
          };
        }
      } catch (e) { /* No es Psych, o el JSON es inválido */ }
    }
    
    // --- Fallback: Detectar Codename Engine (si no se encontró nada) ---
    if (!modData) {
      modData = {
        title: folderName, // Título es el nombre de la carpeta
        description: '- No hay descripcion para codename',
        version: null,
        modType: 'codename',
        engineKey: 'codee', // ID de Codename en versions.yaml
        iconPath: null,
      };
    }

    // ¡CAMBIO! Añadir folderName al objeto final
    return { ...modData, folderName: folderName };
  });

  const results = await Promise.all(readPromises);
  return results;
});


/**
 * ¡CAMBIO! Valida Polymod, Psych, o acepta como Codename (fallback).
 * AHORA TAMBIÉN DEVUELVE 'folderName' DENTRO de 'modData'.
 */
ipcMain.handle('mods:validate-mod', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar Carpeta del Mod',
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return { status: 'cancelled' };
  }

  const selectedPath = filePaths[0];
  const folderName = path.basename(selectedPath);
  const targetPath = path.join(MODS_DIR, folderName);
  
  const polymodPath = path.join(selectedPath, '_polymod_meta.json');
  const psychPath = path.join(selectedPath, 'pack.json');

  // 1. Validar que el mod no exista ya
  try {
    await fsp.access(targetPath);
    return { error: `El mod "${folderName}" ya está instalado.` };
  } catch (e) { /* No existe, perfecto */ }

  let modData;
  
  // --- Intento 1: Validar como Polymod ---
  try {
    await fsp.access(polymodPath);
    const content = await fsp.readFile(polymodPath, 'utf-8');
    const meta = JSON.parse(content);
    
    if (!meta.title || !meta.description || !meta.mod_version) {
      throw new Error('JSON no tiene el formato Polymod requerido.');
    }
    
    modData = {
      title: meta.title,
      description: meta.description,
      version: meta.mod_version,
      modType: 'polymod',
      engineKey: 'V-Slice',
      iconPath: null,
      folderName: folderName // ¡AÑADIDO!
    };

    return { success: true, modData, selectedPath, folderName };

  } catch (e) { /* No es Polymod, intentar Psych */ }

  // --- Intento 2: Validar como Psych Engine ---
  try {
    await fsp.access(psychPath);
    const content = await fsp.readFile(psychPath, 'utf-8');
    const meta = JSON.parse(content);

    if (!meta.name || !meta.description) {
      throw new Error('JSON no tiene el formato Psych (pack.json) requerido.');
    }

    let iconPath = null;
    const pngPath = path.join(selectedPath, 'pack.png');
    try {
      await fsp.access(pngPath);
      iconPath = getFileUrlFromPath(pngPath);
    } catch (pngErr) { /* No hay pack.png */ }

    modData = {
      title: meta.name,
      description: meta.description,
      version: null,
      modType: 'psych',
      engineKey: 'psych',
      iconPath: iconPath,
      folderName: folderName // ¡AÑADIDO!
    };

    return { success: true, modData, selectedPath, folderName };

  } catch (e) { /* No es Psych */ }

  // --- Fallback: Aceptar como Codename Engine ---
  modData = {
    title: folderName,
    description: '- No hay descripcion para codename',
    version: null,
    modType: 'codename',
    engineKey: 'codee',
    iconPath: null,
    folderName: folderName // ¡AÑADIDO!
  };
  return { success: true, modData, selectedPath, folderName };
});

/**
 * Paso 2: Copia la carpeta del mod.
 */
ipcMain.handle('mods:install-mod', async (event, { selectedPath, folderName }) => {
  const targetPath = path.join(MODS_DIR, folderName);
  try {
    await fsp.cp(selectedPath, targetPath, { recursive: true });
    return { success: true };
  } catch (e) {
    return { error: `Error al copiar la carpeta del mod: ${e.message}` };
  }
});

/**
 * ¡NUEVO! Manejador para borrar un mod.
 */
ipcMain.handle('mods:delete-mod', async (event, folderName) => {
  if (!folderName) {
    return { error: 'Nombre de carpeta no válido.' };
  }
  const targetPath = path.join(MODS_DIR, folderName);
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
    return { success: true };
  } catch (e) {
    return { error: `Error al borrar la carpeta del mod: ${e.message}` };
  }
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