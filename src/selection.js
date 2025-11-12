// src/selection.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');
const { getFileUrl } = require('./utils');

/**
 * Actualiza el estado del footer y el botón Play basado en la versión seleccionada.
 */
async function updateFooterState(versionString) {
  const engineId = state.currentSelectedEngineKey;
  
  if (!engineId || !state.versionsData.engines) {
    dom.playButton.disabled = true;
    dom.footerEngineName.textContent = "Error";
    dom.footerVersionNumber.textContent = '...';
    dom.osWarningIcon.classList.add('hidden');
    return;
  }
  
  const engineData = state.versionsData.engines.find(e => e.id === engineId);
  if (!engineData) {
    dom.playButton.disabled = true;
    return;
  }
  
  if (!versionString) {
    dom.footerEngineName.textContent = engineData.name;
    dom.footerVersionNumber.textContent = '---';
    dom.playButtonText.textContent = 'No disponible';
    dom.playButton.disabled = true;
    dom.osWarningIcon.classList.remove('hidden'); 
    
    const footerIconData = engineData.icon_path 
      ? getFileUrl(engineData.icon_path) 
      : (engineData.icon_base64 || state.defaultIconUrl);
    dom.footerEngineIcon.src = footerIconData;
    
    return;
  }
  
  state.currentSelectedVersion = versionString;
  const versionData = engineData.versions.find(v => v.version === versionString);

  if (!versionData) {
    console.error(`No se encontró versionData para ${engineId} ${versionString}`);
    dom.playButton.disabled = true;
    return;
  }
  
  const footerIconData = engineData.icon_path 
    ? getFileUrl(engineData.icon_path) 
    : (engineData.icon_base64 || state.defaultIconUrl);
  dom.footerEngineIcon.src = footerIconData;
  
  dom.footerEngineName.textContent = engineData.name;
  dom.footerVersionNumber.textContent = versionString;
  
  state.selectedInstall = {
    engine: engineId,
    v: versionString,
    name: `${engineData.name} ${versionString}`,
    exeName: engineData.executable_name,
    links: versionData.download_urls,
    os: state.currentOS,
    autoLaunch: state.appSettings.autoLaunch
  };

  const isDownloaded = await ipcRenderer.invoke('check-install-status', {
    engine: engineId,
    v: versionString,
    exeName: engineData.executable_name
  });
  
  state.selectedInstall.isDownloaded = isDownloaded;
  
  const hasNative = versionData.download_urls[state.currentOS];
  
  if (hasNative) {
    dom.osWarningIcon.classList.add('hidden');
    dom.playButtonText.textContent = isDownloaded ? 'Play' : 'Descarga';
    dom.playButton.disabled = false;
  } else {
    dom.osWarningIcon.classList.remove('hidden');
    dom.playButtonText.textContent = 'No disponible'; 
    dom.playButton.disabled = true;
  }
}

/**
 * Rellena el popup de selección de versión.
 */
function populateVersionPopup(engineId) {
  dom.versionPopupList.innerHTML = '';
  const engine = state.versionsData.engines.find(e => e.id === engineId);
  
  const allVersions = engine.versions
    .sort((a, b) => {
      const vA = a.version.replace(/[^0-9.]/g, ''); 
      const vB = b.version.replace(/[^0-9.]/g, '');
      return vB.localeCompare(vA, undefined, { numeric: true });
    });

  allVersions.forEach(version => {
    const item = document.createElement('div');
    item.className = 'version-popup-item';
    item.dataset.version = version.version;
    
    // ¡CAMBIO! Volvemos a poner solo el texto.
    // El wrapper se añadirá dinámicamente si es necesario.
    item.textContent = version.version;
    
    const hasNative = version.download_urls[state.currentOS];
    if (!hasNative) {
      item.classList.add('non-native');
    }
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      updateFooterState(version.version);
      dom.versionPopup.classList.add('hidden');
    });
    
    dom.versionPopupList.appendChild(item);
  });
}

/**
 * Marca la versión activa en el popup.
 */
function updatePopupActive() {
  const currentActive = dom.versionPopupList.querySelector('.active');
  if (currentActive) currentActive.classList.remove('active');
  
  if (state.currentSelectedVersion) {
    const newItem = dom.versionPopupList.querySelector(`.version-popup-item[data-version="${state.currentSelectedVersion}"]`);
    if (newItem) newItem.classList.add('active');
  }
}

/**
 * Selecciona un motor de la sidebar.
 */
function selectEngine(engineId) {
  state.currentSelectedEngineKey = engineId;
  
  const currentActive = document.querySelector('#engine-list .install-item.active');
  if (currentActive) currentActive.classList.remove('active');
  const newItem = document.querySelector(`#engine-list .install-item[data-engine-key="${engineId}"]`);
  if (newItem) newItem.classList.add('active');
  
  const engineData = state.versionsData.engines.find(e => e.id === engineId);
  
  const titleIconData = engineData.icon_path 
    ? getFileUrl(engineData.icon_path) 
    : (engineData.icon_base64 || state.defaultIconUrl);
  dom.titleBarIcon.src = titleIconData;
  
  dom.titleBarTitle.textContent = engineData.name;
  
  populateVersionPopup(engineId);
  
  const latestVersion = engineData.versions
    .sort((a, b) => {
      const vA = a.version.replace(/[^0-9.]/g, '');
      const vB = b.version.replace(/[^0-9.]/g, '');
      return vB.localeCompare(vA, undefined, { numeric: true });
    })[0]?.version; 

  if (latestVersion) {
    updateFooterState(latestVersion);
  } else {
    updateFooterState(null); 
  }
}

/**
 * Rellena la lista de motores en la sidebar.
 */
function populateEngineList() {
  dom.engineList.innerHTML = '';
  let firstEnabledEngine = null;

  if (!state.versionsData.engines) {
    console.error("versionsData.engines no está definido.");
    dom.footerEngineName.textContent = "Error al cargar";
    dom.playButton.disabled = true;
    return;
  }

  state.versionsData.engines.forEach(engine => {
    const item = document.createElement('div');
    item.className = 'install-item';
    item.dataset.engineKey = engine.id;
    
    const iconUrl = engine.icon_path 
      ? getFileUrl(engine.icon_path) 
      : (engine.icon_base64 || state.defaultIconUrl);
    
    item.innerHTML = `
      <img src="${iconUrl}" class="install-icon" onerror="this.src='${state.defaultIconUrl}'">
      <span class="install-name">${engine.name}</span>
    `;
    
    if (!firstEnabledEngine) {
      firstEnabledEngine = engine.id;
    }
    
    item.addEventListener('click', () => {
      selectEngine(engine.id);
    });
    dom.engineList.appendChild(item);
  });
  
  if (firstEnabledEngine) {
    selectEngine(firstEnabledEngine);
  } else {
    dom.footerEngineName.textContent = "No hay motores disponibles";
    dom.playButton.disabled = true;
  }
}

/**
 * Inicializa los listeners del selector de versión (footer).
 */
function initVersionSelector() {
  dom.versionSelectorButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const isHidden = dom.versionPopup.classList.contains('hidden');

    if (isHidden) {
      const buttonRect = dom.versionSelectorButton.getBoundingClientRect();
      let footerHeight = document.querySelector('.content-footer').offsetHeight;

      if (!dom.downloadBar.classList.contains('hidden')) {
        footerHeight += dom.downloadBar.offsetHeight;
      }
      
      dom.versionPopup.style.bottom = `${footerHeight}px`;
      dom.versionPopup.style.left = `${buttonRect.left}px`;
      dom.versionPopup.style.width = `${buttonRect.width}px`;
    }
    
    dom.versionPopup.classList.toggle('hidden');

    // ¡CAMBIO! Lógica de Marquee condicional
    // Solo se ejecuta si el popup se está mostrando
    if (!dom.versionPopup.classList.contains('hidden')) {
      
      dom.versionPopupList.querySelectorAll('.version-popup-item').forEach(item => {
        // Comprueba si el texto real es más ancho que el contenedor
        // y si aún no hemos añadido el wrapper
        if (item.scrollWidth > item.clientWidth && !item.querySelector('.marquee-wrapper')) {
          const originalText = item.textContent; // O item.dataset.version
          item.innerHTML = `
            <div class="marquee-wrapper">
              <span>${originalText}</span>
              <span>${originalText}</span>
            </div>
          `;
        }
      });
    }
    
    updatePopupActive();
  });
}

function initSelection() {
  initVersionSelector();
}

module.exports = { 
  initSelection, 
  populateEngineList, 
  selectEngine, 
  updateFooterState 
};