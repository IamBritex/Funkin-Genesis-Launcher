// modules/game-handler.js
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');
// ¡CAMBIO! Importar SETTINGS_FILE y DEFAULT_SETTINGS
const { VERSIONS_DIR, MODS_DIR, SETTINGS_FILE, DEFAULT_SETTINGS } = require('./constants');

let mainWindow; // Referencia a la ventana principal

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

// --- ¡NUEVA FUNCIÓN DE SYMLINK! ---
/**
 * Crea symlinks filtrados en la carpeta de instalación del juego.
 * Lee settings.json para determinar qué mods excluir.
 */
function createFilteredModSymlinks(installPath) {
  const installModsPath = path.join(installPath, 'mods');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    // 1. Cargar el estado de visibilidad desde settings.json
    let modVisibility = DEFAULT_SETTINGS.modVisibility;
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        // Asegurarse de que modVisibility exista, si no, usar el default
        modVisibility = JSON.parse(settingsData).modVisibility || DEFAULT_SETTINGS.modVisibility;
      }
    } catch (e) {
      console.error('Error al leer settings.json para filtrar mods, usando defaults:', e.message);
    }

    // 2. Asegurar que el directorio de mods global exista
    fs.mkdirSync(MODS_DIR, { recursive: true });

    // 3. Limpiar la carpeta de mods de la instalación (si existe)
    fs.rmSync(installModsPath, { recursive: true, force: true });
    
    // 4. Crear una *nueva carpeta* (no un symlink)
    fs.mkdirSync(installModsPath, { recursive: true });

    // 5. Leer todos los mods del directorio global
    const allModFolders = fs.readdirSync(MODS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    let linkedCount = 0;
    // 6. Iterar y crear symlinks solo para los mods visibles
    for (const folderName of allModFolders) {
      // Es visible si es `true` o `undefined` (default). Solo se salta si es `false`.
      const isVisible = modVisibility[folderName] !== false;

      if (isVisible) {
        const sourceModPath = path.join(MODS_DIR, folderName);
        const targetModPath = path.join(installModsPath, folderName);
        try {
          fs.symlinkSync(sourceModPath, targetModPath, linkType);
          linkedCount++;
        } catch (linkErr) {
          console.error(`Error creando symlink para ${folderName}: ${linkErr.message}`);
        }
      }
    }

    console.log(`Symlinks filtrados creados en: ${installModsPath} (${linkedCount}/${allModFolders.length} mods vinculados)`);

  } catch (err) {
    console.error(`Error fatal creando symlinks filtrados en ${installPath}: ${err.message}`);
    mainWindow.webContents.send('download-error', { error: `Error al vincular mods: ${err.message}` });
  }
}


// --- INICIALIZADOR ---
function initGameHandler(win) {
  mainWindow = win; // Guarda la referencia a la ventana

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
      // ¡CAMBIO! Llamar a la nueva función
      createFilteredModSymlinks(installPath);
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
          // ¡CAMBIO! Llamar a la nueva función
          createFilteredModSymlinks(installPath);
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
}

module.exports = { initGameHandler };