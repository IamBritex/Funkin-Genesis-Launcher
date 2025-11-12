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
  
  // ¡CAMBIO! Lógica de "Error" modificada.
  // Ahora, si versionString es nulo, SÍ mostramos el nombre del motor.
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
  
  // Si no hay versionString (porque el motor no tiene versiones)
  if (!versionString) {
    dom.footerEngineName.textContent = engineData.name;
    dom.footerVersionNumber.textContent = '---';
    dom.playButtonText.textContent = 'No disponible';
    dom.playButton.disabled = true;
    dom.osWarningIcon.classList.remove('hidden'); // Muestra la advertencia
    
    const footerIconData = engineData.icon_path 
      ? getFileUrl(engineData.icon_path) 
      : (engineData.icon_base64 || state.defaultIconUrl);
    dom.footerEngineIcon.src = footerIconData;
    
    return;
  }
  
  // --- Si hay una versionString, continuamos ---
  
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
  
  // Esta es la lógica que SÍ funciona y que ahora se ejecutará
  // incluso para versiones no nativas.
  const hasNative = versionData.download_urls[state.currentOS];
  
  if (hasNative) {
    // Si es compatible (nativo)
    dom.osWarningIcon.classList.add('hidden');
    dom.playButtonText.textContent = isDownloaded ? 'Play' : 'Descarga';
    dom.playButton.disabled = false;
  } else {
    // Si NO es compatible (no-nativo)
    dom.osWarningIcon.classList.remove('hidden'); // Muestra el icono de advertencia
    dom.playButtonText.textContent = 'No disponible'; 
    dom.playButton.disabled = true; // Deshabilita el botón
  }
}

/**
 * Rellena el popup de selección de versión.
 */
function populateVersionPopup(engineId) {
  dom.versionPopupList.innerHTML = '';
  const engine = state.versionsData.engines.find(e => e.id === engineId);
  
  // ¡CAMBIO! Ya no se filtra por versiones nativas.
  const allVersions = engine.versions
    .sort((a, b) => {
      // Ordenar de más nueva a más vieja
      const vA = a.version.replace(/[^0-9.]/g, ''); 
      const vB = b.version.replace(/[^0-9.]/g, '');
      return vB.localeCompare(vA, undefined, { numeric: true });
    });

  allVersions.forEach(version => {
    const item = document.createElement('div');
    item.className = 'version-popup-item';
    item.dataset.version = version.version;
    item.textContent = version.version;
    
    // ¡NUEVO! Comprobar compatibilidad y añadir clase si no es nativa
    const hasNative = version.download_urls[state.currentOS];
    if (!hasNative) {
      item.classList.add('non-native');
    }
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      // ¡CAMBIO! Llama a updateFooterState sin importar la compatibilidad
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
  
  // ¡CAMBIO! Seleccionar la última versión (la más nueva) sin importar la compatibilidad.
  const latestVersion = engineData.versions
    .sort((a, b) => {
      const vA = a.version.replace(/[^0-9.]/g, '');
      const vB = b.version.replace(/[^0-9.]/g, '');
      return vB.localeCompare(vA, undefined, { numeric: true });
    })[0]?.version; // Quitado el .filter()

  if (latestVersion) {
    updateFooterState(latestVersion);
  } else {
    // Si no hay ninguna versión (lista vacía), llama a updateFooterState con null
    // para que muestre el estado deshabilitado.
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
    
    // ¡CAMBIO! Esta lógica se mantiene, pero ahora no deshabilita el motor
    // si solo tiene versiones no-nativas. (Corrección: No, la lógica anterior estaba bien,
    // si un motor NO tiene NINGUNA versión nativa, está bien deshabilitarlo en la sidebar).
    // Re-evaluación: El usuario quiere ver todo. Quitemos la deshabilitación basada en OS.
    
    // const hasCompatibleVersion = engine.versions.some(v => v.download_urls[state.currentOS]);
    
    // if (!hasCompatibleVersion) {
    //   item.classList.add('disabled');
    // } else if (!firstEnabledEngine) {
    //   firstEnabledEngine = engine.id;
    // }
    
    // ¡CAMBIO! Lógica simplificada: no deshabilitar motores,
    // solo seleccionar el primero de la lista.
    if (!firstEnabledEngine) {
      firstEnabledEngine = engine.id;
    }
    
    item.addEventListener('click', () => {
      // ¡CAMBIO! Permitir seleccionar motores deshabilitados (si los hubiera)
      // if (!item.classList.contains('disabled')) {
      //   selectEngine(engine.id);
      // }
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
    
    if (dom.versionPopup.classList.contains('hidden')) {
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
    updatePopupActive();
  });
  
  window.addEventListener('click', () => {
    if (!dom.versionPopup.classList.contains('hidden')) {
      dom.versionPopup.classList.add('hidden');
    }
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