// modules/settings-handler.js
const { ipcMain } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const { SETTINGS_FILE, DEFAULT_SETTINGS } = require('./constants');

function initSettingsHandler() {
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
}

module.exports = { initSettingsHandler };