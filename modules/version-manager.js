// modules/version-manager.js
const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const yaml = require('js-yaml');
const { VERSIONS_DIR, LOCAL_VERSIONS_FILE } = require('./constants');

let mainWindow;

function initVersionManager(win) {
  mainWindow = win;

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
}

module.exports = { initVersionManager };