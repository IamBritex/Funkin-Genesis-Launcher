// modules/mods-handler.js
const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { MODS_DIR } = require('./constants');

let mainWindow;

function getFileUrlFromPath(filePath) {
  try {
    const fileURL = new URL('file:');
    fileURL.pathname = filePath;
    return fileURL.href;
  } catch (e) {
    return null;
  }
}

function initModsHandler(win) {
  mainWindow = win;

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
      } catch (e) { /* No es Polymod */ }

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
        } catch (e) { /* No es Psych */ }
      }

      if (!modData) {
        modData = {
          title: folderName,
          description: '- No hay descripcion para codename',
          version: null,
          modType: 'codename',
          engineKey: 'codee',
          iconPath: null,
        };
      }
      return { ...modData, folderName: folderName };
    });

    const results = await Promise.all(readPromises);
    return results;
  });

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

    try {
      await fsp.access(targetPath);
      return { error: `El mod "${folderName}" ya está instalado.` };
    } catch (e) { /* No existe, perfecto */ }

    let modData;

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
        folderName: folderName
      };
      return { success: true, modData, selectedPath, folderName };
    } catch (e) { /* No es Polymod */ }

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
        folderName: folderName
      };
      return { success: true, modData, selectedPath, folderName };
    } catch (e) { /* No es Psych */ }

    modData = {
      title: folderName,
      description: '- No hay descripcion para codename',
      version: null,
      modType: 'codename',
      engineKey: 'codee',
      iconPath: null,
      folderName: folderName
    };
    return { success: true, modData, selectedPath, folderName };
  });

  ipcMain.handle('mods:install-mod', async (event, { selectedPath, folderName }) => {
    const targetPath = path.join(MODS_DIR, folderName);
    try {
      await fsp.cp(selectedPath, targetPath, { recursive: true });
      return { success: true };
    } catch (e) {
      return { error: `Error al copiar la carpeta del mod: ${e.message}` };
    }
  });

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
}

module.exports = { initModsHandler };