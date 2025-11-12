// modules/constants.js
const { app } = require('electron');
const path = require('path');

// --- Definición de rutas persistentes ---
const LAUNCHER_DIR = path.join(app.getPath('userData'), 'genesislauncher');
const VERSIONS_DIR = path.join(LAUNCHER_DIR, 'versions');
const MODS_DIR = path.join(LAUNCHER_DIR, 'mods');
const SETTINGS_FILE = path.join(LAUNCHER_DIR, 'settings.json');
const NEWS_DIR = path.join(app.getAppPath(), 'news');
const LOCAL_VERSIONS_FILE = path.join(app.getAppPath(), 'versions.yaml');

const DEFAULT_SETTINGS = {
  theme: 'funkin',
  language: 'es',
  autoLaunch: true,
  soundEffects: true,
  customCursor: true,
  modVisibility: {} // ¡NUEVO!
};

module.exports = {
  LAUNCHER_DIR,
  VERSIONS_DIR,
  MODS_DIR,
  SETTINGS_FILE,
  NEWS_DIR,
  LOCAL_VERSIONS_FILE,
  DEFAULT_SETTINGS
};