// renderer.js

const { ipcRenderer } = require('electron');
const process = require('process');
const path = require('path');

window.addEventListener('DOMContentLoaded', async () => {

  // --- VARIABLES GLOBALES ---
  let versionsData = {};
  let selectedInstall = null;
  let currentOS = '';
  let appSettings = {};
  let pendingDeleteData = null;
  let currentSelectedEngineKey = null;
  let currentSelectedVersion = null;
  
  const defaultIconPath = path.resolve(__dirname, 'icons/vanilla/ic_launcher.png');
  const defaultIconUrl = getFileUrl(defaultIconPath);
  

  // --- ELEMENTOS DEL DOM ---
  // Barra de título
  const titleBarIcon = document.getElementById('title-bar-icon');
  const titleBarTitle = document.getElementById('title-bar-title');
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');

  // Footer
  const playButton = document.getElementById('play-btn');
  const playButtonText = document.getElementById('play-button-text');
  const versionSelectorButton = document.getElementById('version-selector-button');
  const footerEngineIcon = document.getElementById('footer-engine-icon');
  const footerEngineName = document.getElementById('footer-engine-name');
  const footerVersionNumber = document.getElementById('footer-version-number');
  const osWarningIcon = document.getElementById('os-warning-icon');
  
  // Popup de Versión
  const versionPopup = document.getElementById('version-popup');
  const versionPopupList = document.getElementById('version-popup-list');

  // Sidebar
  const sidebar = document.getElementById('sidebar');
  const engineList = document.getElementById('engine-list');
  const configBtn = document.getElementById('config-btn');
  
  // Otros
  const newsContainer = document.getElementById('news-container');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const resizer = document.getElementById('resizer');
  const minSidebarWidth = 180;
  const maxSidebarWidth = 400;

  // Modales
  const modalLoading = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  
  // Barra de Progreso
  const downloadBar = document.getElementById('download-progress-bar-container');
  const downloadStatusText = document.getElementById('download-status-text');
  const downloadPercentText = document.getElementById('download-percent-text');
  const downloadSizeText = document.getElementById('download-size-text');
  const downloadProgressBarFill = document.getElementById('download-progress-bar-fill');
  
  const modalConfig = document.getElementById('config-modal-overlay');
  const closeModalConfigBtn = document.getElementById('close-config-modal');
  const themeSelect = document.getElementById('theme-select');
  const languageSelect = document.getElementById('language-select');
  const launchToggle = document.getElementById('launch-toggle');
  const soundToggle = document.getElementById('sound-toggle');
  const cursorToggle = document.getElementById('cursor-toggle');
  
  const modalConfirm = document.getElementById('modal-confirm');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmYesBtn = document.getElementById('confirm-yes-btn');
  const confirmNoBtn = document.getElementById('confirm-no-btn');

  // --- ELEMENTOS DE AUDIO ---
  const audioElements = {
    open: document.getElementById('audio-open'),
    close: document.getElementById('audio-close'),
    down: document.getElementById('audio-click-down'),
    up: document.getElementById('audio-click-up'),
  };

  function playSound(soundName) {
    if (!appSettings.soundEffects) return; 
    const audio = audioElements[soundName];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.error("Error al reproducir sonido:", e));
    }
  }
  
  window.addEventListener('mousedown', () => playSound('down'));
  window.addEventListener('mouseup', () => playSound('up'));

  function getFileUrl(filePath) {
    if (!filePath) return defaultIconUrl;
    try {
      const resolvedPath = path.resolve(__dirname, filePath);
      const fileURL = new URL('file:');
      fileURL.pathname = resolvedPath; 
      return fileURL.href;
    } catch (e) {
      console.error('Error creando file URL:', e, filePath);
      return defaultIconUrl;
    }
  }

  // --- Helper para formatear bytes ---
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 Bytes';
    // ¡¡¡CAMBIO!!! Devuelve un espacio si no es válido
    // para que el CSS (min-height) mantenga el espacio
    if (isNaN(bytes) || bytes === null) return '\u00A0'; // Non-breaking space
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // --- INICIALIZACIÓN ---
  detectOS();
  await loadSettings();
  await loadVersionData();
  await loadNews();
  initResizer();
  initWindowControls();
  initVersionSelector();

  function detectOS() {
    currentOS = (process.platform === 'win32') ? 'windows' : (process.platform === 'linux') ? 'linux' : 'unsupported';
  }

  async function loadVersionData() {
    try {
      const response = await fetch('./versions.json');
      versionsData = await response.json();
      populateEngineList(); 
    } catch (err) { console.error('Error cargando versions.json:', err); }
  }
  
  async function loadNews() {
    try {
      const articles = await ipcRenderer.invoke('load-news');
      newsContainer.innerHTML = '';
      articles.forEach(article => {
        const articleDiv = document.createElement('div');
        articleDiv.className = 'news-article';
        articleDiv.innerHTML = article.html;
        newsContainer.appendChild(articleDiv);
      });
    } catch (err) {
      console.error('Error al cargar noticias:', err);
      newsContainer.innerHTML = '<h3>Error al cargar noticias</h3>';
    }
  }

  // --- LÓGICA DE PERSISTENCIA (CONFIGURACIÓN) ---
  async function loadSettings() {
    try {
      appSettings = await ipcRenderer.invoke('load-settings');
      themeSelect.value = appSettings.theme;
      languageSelect.value = appSettings.language;
      launchToggle.checked = appSettings.autoLaunch;
      soundToggle.checked = appSettings.soundEffects;
      cursorToggle.checked = appSettings.customCursor;
      applyTheme(appSettings.theme);
      applyCursor(appSettings.customCursor);
    } catch (err) { console.error('Error al invocar "load-settings":', err); }
  }
  
  function saveSettings() {
    appSettings.theme = themeSelect.value;
    appSettings.language = languageSelect.value;
    appSettings.autoLaunch = launchToggle.checked;
    appSettings.soundEffects = soundToggle.checked;
    appSettings.customCursor = cursorToggle.checked;
    ipcRenderer.send('save-settings', appSettings);
    applyTheme(appSettings.theme);
    applyCursor(appSettings.customCursor);
  }
  
  function applyTheme(themeName) {
    document.body.dataset.theme = themeName;
  }
  function applyCursor(isEnabled) {
    document.body.classList.toggle('custom-cursor-enabled', isEnabled);
  }
  
  // --- LÓGICA DE REDIMENSIONAMIENTO ---
  function initResizer() {
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
    function handleMouseMove(e) {
      const newWidth = Math.min(Math.max(e.clientX, minSidebarWidth), maxSidebarWidth);
      sidebar.style.width = `${newWidth}px`;
    }
    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
  }
  
  // --- CONTROLES DE VENTANA ---
  function initWindowControls() {
    minBtn.addEventListener('click', () => ipcRenderer.send('window-minimize'));
    maxBtn.addEventListener('click', () => ipcRenderer.send('window-maximize'));
    closeBtn.addEventListener('click', () => ipcRenderer.send('window-close'));
  }
  
  // --- LÓGICA DE MODALES ---
  function openModal(modalElement) {
    playSound('open');
    modalElement.classList.remove('hidden');
  }
  function closeModal(modalElement) {
    if (modalElement.classList.contains('hidden')) return; // Ya está cerrado
    playSound('close');
    modalElement.classList.add('closing');
    setTimeout(() => {
      modalElement.classList.add('hidden');
      modalElement.classList.remove('closing');
    }, 200);
  }

  // Listeners de Modales
  configBtn.addEventListener('click', () => openModal(modalConfig));
  closeModalConfigBtn.addEventListener('click', () => closeModal(modalConfig));
  modalConfig.addEventListener('click', (e) => { if (e.target === modalConfig) closeModal(modalConfig); });
  
  confirmYesBtn.addEventListener('click', () => {
    if (pendingDeleteData) {
      ipcRenderer.send('delete-install', pendingDeleteData);
      pendingDeleteData = null;
    }
    closeModal(modalConfirm);
  });
  confirmNoBtn.addEventListener('click', () => {
    pendingDeleteData = null;
    closeModal(modalConfirm);
  });

  // --- LÓGICA DE SELECCIÓN ---

  function populateEngineList() {
    engineList.innerHTML = '';
    let firstEnabledEngine = null;

    Object.keys(versionsData.engines).forEach(key => {
      const engine = versionsData.engines[key];
      const item = document.createElement('div');
      item.className = 'install-item';
      item.dataset.engineKey = key;
      const iconUrl = getFileUrl(engine.icon);
      item.innerHTML = `
        <img src="${iconUrl}" class="install-icon" onerror="this.src='${defaultIconUrl}'">
        <span class="install-name">${engine.name}</span>
      `;
      
      const hasVersionsForOS = engine.versions.some(v => v.links[currentOS] || (currentOS === 'linux' && v.links['windows']));
      
      if (!hasVersionsForOS) {
        item.classList.add('disabled');
      } else if (!firstEnabledEngine) {
        firstEnabledEngine = key;
      }
      
      item.addEventListener('click', () => {
        if (!item.classList.contains('disabled')) {
          selectEngine(key);
        }
      });
      engineList.appendChild(item);
    });
    
    if (firstEnabledEngine) {
      selectEngine(firstEnabledEngine);
    } else {
      footerEngineName.textContent = "No hay motores compatibles";
      playButton.disabled = true;
    }
  }

  function selectEngine(engineKey) {
    currentSelectedEngineKey = engineKey;
    
    const currentActive = document.querySelector('#engine-list .install-item.active');
    if (currentActive) currentActive.classList.remove('active');
    const newItem = document.querySelector(`#engine-list .install-item[data-engine-key="${engineKey}"]`);
    if (newItem) newItem.classList.add('active');
    
    const engineData = versionsData.engines[engineKey];
    titleBarIcon.src = getFileUrl(engineData.icon);
    titleBarTitle.textContent = engineData.name;
    
    populateVersionPopup(engineKey);
    
    const latestVersion = engineData.versions
        .filter(v => v.links[currentOS] || (currentOS === 'linux' && v.links['windows']))
        .sort((a, b) => {
            const vA = a.v.replace(/[^0-9.]/g, '');
            const vB = b.v.replace(/[^0-9.]/g, '');
            return vB.localeCompare(vA, undefined, { numeric: true });
        })[0]?.v;

    if (latestVersion) {
        updateFooterState(latestVersion);
    }
  }

  function populateVersionPopup(engineKey) {
    versionPopupList.innerHTML = '';
    const engine = versionsData.engines[engineKey];
    
    const compatibleVersions = engine.versions
        .filter(version => version.links[currentOS] || (currentOS === 'linux' && version.links['windows']))
        .sort((a, b) => {
            const vA = a.v.replace(/[^0-9.]/g, '');
            const vB = b.v.replace(/[^0-9.]/g, '');
            return vB.localeCompare(vA, undefined, { numeric: true });
        });

    compatibleVersions.forEach(version => {
        const item = document.createElement('div');
        item.className = 'version-popup-item';
        item.dataset.version = version.v;
        item.textContent = version.v;
        
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            updateFooterState(version.v);
            versionPopup.classList.add('hidden');
        });
        
        versionPopupList.appendChild(item);
    });
  }
  
  function initVersionSelector() {
    // El listener está en 'versionSelectorButton' (el DIV completo)
    versionSelectorButton.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // 
      // ¡¡¡CORRECCIÓN DE ALINEACIÓN!!!
      // Recalcula la posición y tamaño del popup CADA VEZ que se abre.
      // Esto arregla el bug de alineación después de ocultar/mostrar la ventana.
      //
      if (versionPopup.classList.contains('hidden')) {
        const buttonRect = versionSelectorButton.getBoundingClientRect();
        let footerHeight = document.querySelector('.content-footer').offsetHeight;

        if (!downloadBar.classList.contains('hidden')) {
          footerHeight += downloadBar.offsetHeight;
        }
        
        versionPopup.style.bottom = `${footerHeight}px`; 
        versionPopup.style.left = `${buttonRect.left}px`; 
        versionPopup.style.width = `${buttonRect.width}px`; 
      }
      
      versionPopup.classList.toggle('hidden');
      updatePopupActive();
    });
    
    window.addEventListener('click', () => {
      if (!versionPopup.classList.contains('hidden')) {
        versionPopup.classList.add('hidden');
      }
    });
  }
  
  function updatePopupActive() {
    const currentActive = versionPopupList.querySelector('.active');
    if (currentActive) currentActive.classList.remove('active');
    
    if (currentSelectedVersion) {
      const newItem = versionPopupList.querySelector(`.version-popup-item[data-version="${currentSelectedVersion}"]`);
      if (newItem) newItem.classList.add('active');
    }
  }

  async function updateFooterState(version) {
    const engineKey = currentSelectedEngineKey;
    if (!engineKey || !version) {
      playButton.disabled = true;
      footerEngineName.textContent = "Error";
      return;
    }
    
    currentSelectedVersion = version;
    const engineData = versionsData.engines[engineKey];
    const versionData = engineData.versions.find(v => v.v === version);
    
    footerEngineIcon.src = getFileUrl(engineData.icon);
    footerEngineName.textContent = engineData.name;
    footerVersionNumber.textContent = version;
    
    selectedInstall = {
      engine: engineKey,
      v: version,
      name: `${engineData.name} ${version}`,
      exeName: engineData.exeName,
      links: versionData.links, 
      os: currentOS,
      autoLaunch: appSettings.autoLaunch
    };

    const isDownloaded = await ipcRenderer.invoke('check-install-status', { 
      engine: engineKey, 
      v: version,
      exeName: engineData.exeName 
    });
    
    selectedInstall.isDownloaded = isDownloaded;
    
    const hasNative = versionData.links[currentOS];
    
    if (hasNative) {
      osWarningIcon.classList.add('hidden');
      playButtonText.textContent = isDownloaded ? 'Play' : 'Descarga';
      playButton.disabled = false;
    } else if (currentOS === 'linux' && versionData.links.windows) {
      osWarningIcon.classList.remove('hidden');
      playButtonText.textContent = isDownloaded ? 'Instalado' : 'Play';
      playButton.disabled = true; 
    } else {
      osWarningIcon.classList.remove('hidden');
      playButtonText.textContent = 'Play';
      playButton.disabled = true;
    }
  }
  
  // --- LÓGICA BOTÓN "PLAY" (Modificada) ---
  playButton.addEventListener('click', () => {
    if (!selectedInstall || playButton.disabled) return;
    
    if (!selectedInstall.isDownloaded) {
      playButtonText.textContent = 'Descargando';
      playButton.disabled = true;
      
      downloadStatusText.textContent = `Descargando: ${selectedInstall.name}`;
      downloadPercentText.textContent = '0%';
      downloadProgressBarFill.style.width = '0%';
      downloadBar.classList.remove('hidden');
      
      // Bloquear UI para que el footer no cambie
      document.body.classList.add('is-downloading');
      versionSelectorButton.disabled = true;
      
    } else {
      loadingStatus.textContent = `Ejecutando: ${selectedInstall.name}`;
      openModal(modalLoading);
    }
    
    ipcRenderer.send('launch-game', selectedInstall);
  });

  // --- LÓGICA MODAL "CONFIG" (Guardado) ---
  themeSelect.addEventListener('change', saveSettings);
  languageSelect.addEventListener('change', saveSettings);
  launchToggle.addEventListener('change', saveSettings);
  soundToggle.addEventListener('change', saveSettings);
  cursorToggle.addEventListener('change', saveSettings);

  // --- ESCUCHAS de EVENTOS (MAIN) (Modificados) ---
  ipcRenderer.on('download-progress', (event, { percent, receivedBytes, totalBytes, url }) => {
    
    if(url && url.includes('probando Windows')) {
      downloadStatusText.textContent = 'Versión Linux no encontrada, probando Windows...';
    } else if (selectedInstall) {
      downloadStatusText.textContent = `Descargando: ${selectedInstall.name}`;
    }
    
    const percentRounded = Math.round(percent);
    downloadPercentText.textContent = `${percentRounded}%`;
    downloadProgressBarFill.style.width = `${percentRounded}%`;

    // Actualizar texto de tamaño
    if (totalBytes > 0) {
      downloadSizeText.textContent = `${formatBytes(receivedBytes, 1)} / ${formatBytes(totalBytes, 1)}`;
    } else {
      downloadSizeText.textContent = formatBytes(receivedBytes, 1); 
    }
  });
  
  ipcRenderer.on('unzip-start', () => {
    downloadBar.classList.add('hidden');
    loadingStatus.textContent = `Descomprimiendo: ${selectedInstall.name}`;
    openModal(modalLoading);
  });
  
  ipcRenderer.on('download-complete', (event, { name, path }) => {
    // Desbloquear UI
    document.body.classList.remove('is-downloading');
    versionSelectorButton.disabled = false;
    
    loadingStatus.textContent = appSettings.autoLaunch ? `Ejecutando: ${path}` : '¡Completado!';
    
    if (selectedInstall && selectedInstall.name === name) {
      selectedInstall.isDownloaded = true;
      // Actualizar estado del footer (botón play, etc)
      updateFooterState(selectedInstall.v);
    }
    
    setTimeout(() => {
      closeModal(modalLoading);
      showToast(`¡${name} se instaló correctamente!`);
    }, 1500);
  });
  
  ipcRenderer.on('game-ready', (event, { name, path }) => {
    loadingStatus.textContent = `Ejecutando: ${path}`;
    setTimeout(() => { closeModal(modalLoading); }, 1000);
  });
  
  ipcRenderer.on('download-error', (event, { error }) => {
    // Desbloquear UI
    document.body.classList.remove('is-downloading');
    versionSelectorButton.disabled = false;
    
    downloadBar.classList.add('hidden');
    closeModal(modalLoading);

    loadingStatus.textContent = 'Error';
    console.error(error);
    if (selectedInstall) {
      // Re-evaluar estado del footer al fallar
      updateFooterState(selectedInstall.v);
    }
    alert(`Error: ${error}`);
  });

  // --- LÓGICA DEL TOAST ---
  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2900);
  }
});