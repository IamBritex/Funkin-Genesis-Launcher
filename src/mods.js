// src/mods.js
const { ipcRenderer } = require('electron'); 
const dom = require('./dom');
const state = require('./state'); 
const { loadNews } = require('./data');
const { showToast, showLoadingToast, hideLoadingToast, getFileUrl, openModal } = require('./utils'); 

let isModsViewActive = false;
let modsLoaded = false; 
let searchTimer = null; // Timer para el debounce de la búsqueda

/**
 * ¡NUEVO! Esta función ahora combina el FILTRO y la BÚSQUEDA.
 */
function updateModVisibility() {
  const searchQuery = dom.searchInput.value.toLowerCase();
  const filterKey = state.currentModFilter;
  
  // Itera sobre las tarjetas de mod (ignora el placeholder)
  dom.modsContainer.querySelectorAll('.mod-card').forEach(card => {
    const title = card.dataset.title.toLowerCase();
    const engineKey = card.dataset.engineKey; // Necesario para el filtro
    
    const searchMatch = title.includes(searchQuery);
    const filterMatch = (filterKey === 'all') || (engineKey === filterKey);
    
    if (searchMatch && filterMatch) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });

  // Revisa si debe mostrar "Sin resultados"
  updatePlaceholderVisibility();
}


/**
 * Función centralizada para mostrar/ocultar placeholders.
 */
function updatePlaceholderVisibility() {
  // ... (esta función no cambia, pero ahora es llamada por updateModVisibility) ...
  const query = dom.searchInput.value.toLowerCase();
  let visibleCards = 0;
  const allModCards = dom.modsContainer.querySelectorAll('.mod-card');

  allModCards.forEach(card => {
    if (card.style.display !== 'none') {
      visibleCards++;
    }
  });

  if (allModCards.length === 0) {
    dom.modsPlaceholder.classList.remove('hidden');
    dom.modsPlaceholder.dataset.state = 'no-mods';
    
    const newArrow = dom.noModsArrow.cloneNode(true);
    dom.noModsArrow.parentNode.replaceChild(newArrow, dom.noModsArrow);
    dom.noModsArrow = newArrow; 
    
  } else if (allModCards.length > 0 && visibleCards === 0) { // ¡CAMBIO! Simplificado
    // Mostrar si no hay resultados, ya sea por búsqueda o filtro
    dom.modsPlaceholder.classList.remove('hidden');
    dom.modsPlaceholder.dataset.state = 'no-results';
  } else {
    dom.modsPlaceholder.classList.add('hidden');
  }
}

/**
 * Genera el HTML para una tarjeta de mod, incluyendo el menú kebab.
 */
function createModCard(mod) {
  // 1. Encontrar el icono del motor
  const engine = state.versionsData.engines.find(e => e.id === mod.engineKey);
  const engineIconUrl = engine 
    ? (engine.icon_path ? getFileUrl(engine.icon_path) : (engine.icon_base64 || state.defaultIconUrl)) 
    : state.defaultIconUrl;
  
  // ... (banner, versionString, etc. sin cambios) ...
  const placeholderBannerUrl = getFileUrl('icons/placeholder.png');
  const bannerUrl = mod.iconPath || placeholderBannerUrl;
  const bannerStyle = `background-image: url('${bannerUrl.replace(/\\/g, '\\\\')}'); background-size: cover; background-position: center;`;
  const versionString = mod.version ? `<span class="mod-version">v${mod.version}</span>` : '';
  const isVisible = state.appSettings.modVisibility[mod.folderName] !== false; 
  const cardClasses = isVisible ? "mod-card" : "mod-card disabled";
  const visibleButtonText = isVisible 
    ? '<i class="fas fa-eye"></i> Visible' 
    : '<i class="fas fa-eye-slash"></i> Oculto';


  // ¡CAMBIO! Añadido data-engine-key="${mod.engineKey}"
  return `
    <div class="${cardClasses}" data-folder-name="${mod.folderName}" data-title="${mod.title}" data-engine-key="${mod.engineKey}">
      
      <div class="mod-card-inner-wrapper">
        <div class="mod-card-banner" style="${bannerStyle}"></div>
        <div class="mod-card-content">
          <h3>${mod.title} ${versionString}</h3>
          <p>${mod.description}</p>
        </div>
      </div>
  <img src="${engineIconUrl}" class="mod-card-engine-icon" onerror="this.src='${state.defaultIconUrl}'" title="Mod para ${engine ? engine.name : 'Desconocido'}" />
      
      <div class="mod-kebab-menu">
        <button class="mod-kebab-btn"><i class="fas fa-ellipsis-v"></i></button>
        <div class="mod-menu-dropdown">
          <button class="mod-menu-action" data-action="modify">
            <i class="fas fa-pencil-alt"></i> Modificar
          </button>
          
          <button class="mod-menu-action" data-action="toggle-visible">
            ${visibleButtonText}
          </button>
          
          <button class="mod-menu-action delete" data-action="delete">
            <i class="fas fa-trash"></i> Eliminar
          </button>
        </div>
      </div>

    </div>
  `;
}

// ... (renderModCards y addModCardListeners sin cambios) ...
function renderModCards(mods = []) {
  let modsHtml = '';
  mods.forEach(mod => {
    modsHtml += createModCard(mod);
  });
  dom.modsContainer.insertAdjacentHTML('beforeend', modsHtml);
  addModCardListeners(); 
  updatePlaceholderVisibility();
}
function addModCardListeners() {
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.mod-kebab-menu')) {
      document.querySelectorAll('.mod-kebab-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.mod-kebab-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });
    }
  });
  dom.modsContainer.querySelectorAll('.mod-kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      const menu = btn.closest('.mod-kebab-menu');
      document.querySelectorAll('.mod-kebab-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
      });
      menu.classList.toggle('active');
    });
  });
  dom.modsContainer.querySelectorAll('.mod-menu-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      const card = e.currentTarget.closest('.mod-card');
      const folderName = card.dataset.folderName;
      const title = card.dataset.title;
      card.querySelector('.mod-kebab-menu').classList.remove('active');
      if (action === 'modify') {
        showToast('La función "Modificar" no está implementada aún.');
      } else if (action === 'toggle-visible') {
        const isDisabling = !card.classList.contains('disabled');
        card.classList.toggle('disabled');
        state.appSettings.modVisibility[folderName] = !isDisabling;
        ipcRenderer.send('save-settings', state.appSettings);
        if (isDisabling) {
          e.currentTarget.innerHTML = '<i class="fas fa-eye-slash"></i> Oculto';
        } else {
          e.currentTarget.innerHTML = '<i class="fas fa-eye"></i> Visible';
        }
        showToast(`Visibilidad de "${title}" guardada.`, false);
      } else if (action === 'delete') {
        state.pendingDeleteData = {
          type: 'delete-mod', 
          folderName: folderName,
          cardElement: card 
        };
        dom.confirmMessage.textContent = `¿Estás seguro de que quieres borrar el mod "${title}"? Esta acción no se puede deshacer y borrará la carpeta.`;
        openModal(dom.modalConfirm);
      }
    });
  });
  dom.modsContainer.querySelectorAll('.mod-card:not(.add-mod-card)').forEach(card => {
    card.addEventListener('mouseleave', () => {
      card.querySelector('.mod-kebab-menu')?.classList.remove('active');
    });
  });
}
// ... (handleAddModClick y loadInstalledMods sin cambios) ...
async function handleAddModClick() {
  let validationResult;
  try {
    validationResult = await ipcRenderer.invoke('mods:validate-mod');
    if (validationResult.status === 'cancelled') {
      return; 
    }
    if (validationResult.error) {
      showToast(validationResult.error, true);
      return;
    }
    if (validationResult.success) {
      const { modData, selectedPath, folderName } = validationResult;
      showLoadingToast(`Instalando mod "${modData.title}"...`);
      const installResult = await ipcRenderer.invoke('mods:install-mod', { selectedPath, folderName });
      hideLoadingToast();
      if (installResult.success) {
        showToast(`Mod "${modData.title}" añadido con éxito.`);
        loadInstalledMods(); 
      } else {
        showToast(installResult.error, true);
      }
    }
  } catch (err) {
    console.error("Error en el proceso de añadir mod:", err);
    hideLoadingToast(); 
    showToast('Ocurrió un error inesperado al añadir el mod.', true);
  }
}
async function loadInstalledMods() {
  try {
    dom.modsContainer.querySelectorAll('.mod-card').forEach(card => card.remove());
    const mods = await ipcRenderer.invoke('mods:get-installed');
    renderModCards(mods);
    modsLoaded = true;
  } catch (err) {
    console.error("Error al invocar 'mods:get-installed':", err);
    showToast('Error al cargar la lista de mods.', true);
  }
}

/**
 * ¡NUEVO! Rellena el menú de filtros
 */
function populateFilterDropdown() {
  dom.filterDropdownList.innerHTML = ''; // Limpiar

  // 1. Añadir "Todos"
  const allItem = document.createElement('div');
  allItem.className = 'filter-dropdown-item active'; // Activo por defecto
  allItem.dataset.engineKey = 'all';
  allItem.innerHTML = `<i class="fas fa-globe-americas"></i> Todos`;
  allItem.addEventListener('click', () => applyModFilter('all'));
  dom.filterDropdownList.appendChild(allItem);
  
  // 2. Añadir motores
  if (state.versionsData && state.versionsData.engines) {
    state.versionsData.engines.forEach(engine => {
      const iconUrl = engine.icon_path 
        ? getFileUrl(engine.icon_path) 
        : (engine.icon_base64 || state.defaultIconUrl);
      
      const item = document.createElement('div');
      item.className = 'filter-dropdown-item';
      item.dataset.engineKey = engine.id;
      item.innerHTML = `<img src="${iconUrl}" onerror="this.src='${state.defaultIconUrl}'"> ${engine.name}`;
      item.addEventListener('click', () => applyModFilter(engine.id));
      dom.filterDropdownList.appendChild(item);
    });
  }
}

/**
 * ¡NUEVO! Aplica el filtro seleccionado
 */
function applyModFilter(engineKey) {
  if (state.currentModFilter === engineKey) {
    // Si ya está seleccionado, solo cierra el menú
    dom.filterDropdown.classList.add('hidden');
    dom.filterModsBtn.classList.remove('active');
    return;
  }
  
  state.currentModFilter = engineKey;
  
  // Actualizar UI del menú
  dom.filterDropdownList.querySelectorAll('.filter-dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.engineKey === engineKey);
  });
  
  // Cerrar menú
  dom.filterDropdown.classList.add('hidden');
  dom.filterModsBtn.classList.remove('active');
  
  // Aplicar el filtro (que también respeta la búsqueda)
  updateModVisibility();
}

/**
 * ¡NUEVO! Inicializa el botón de filtro
 */
function initModFilter() {
  populateFilterDropdown();
  
  dom.filterModsBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que el 'click-away' de utils.js lo cierre
    dom.filterDropdown.classList.toggle('hidden');
    dom.filterModsBtn.classList.toggle('active');
  });
}


/**
 * ¡CAMBIO! Lógica de búsqueda actualizada
 */
function initModsSearch() {
  dom.searchInput.addEventListener('input', () => {
    dom.searchIcon.className = 'fas fa-spinner fa-spin';
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      // ¡CAMBIO! Solo llama a la función combinada
      updateModVisibility();
      dom.searchIcon.className = 'fas fa-search';
    }, 300);
  });
}

// ... (showModsView y showNewsView sin cambios) ...
function showModsView() {
  dom.newsContainer.classList.add('hidden');
  dom.modsContainer.classList.remove('hidden');
  dom.modsHeader.classList.remove('hidden'); 
  dom.modsContainer.style.paddingTop = `${dom.modsHeader.offsetHeight}px`;
  if (state.versionsData.engines) {
    if (!modsLoaded) {
      loadInstalledMods();
    } else {
      updatePlaceholderVisibility();
    }
  } else {
    console.warn("Esperando a versionsData... reintentando en 500ms");
    setTimeout(showModsView, 500);
  }
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-newspaper';
  span.textContent = 'Noticias';
  isModsViewActive = true;
}
function showNewsView() {
  dom.modsContainer.classList.add('hidden');
  dom.modsHeader.classList.add('hidden'); 
  dom.newsContainer.classList.remove('hidden');
  dom.modsPlaceholder.classList.add('hidden');
  loadNews();
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-puzzle-piece';
  span.textContent = 'Mods';
  isModsViewActive = false;
  dom.searchInput.value = '';
  // ¡CAMBIO! Resetea también el filtro al salir
  applyModFilter('all');
  // (applyModFilter ya llama a updateModVisibility, así que no necesitamos resetear las tarjetas manualmente)
  dom.searchIcon.className = 'fas fa-search';
}

/**
 * Inicializa el botón de Mods y el nuevo botón de Añadir.
 */
function initMods() {
  // Botón del Sidebar (Mods/Noticias)
  dom.modsBtn.addEventListener('click', () => {
    if (isModsViewActive) {
      showNewsView();
    } else {
      showModsView();
    }
  });

  // Botón de la cabecera (Añadir Mod)
  dom.addModHeaderBtn.addEventListener('click', handleAddModClick);

  // Barra de búsqueda
  initModsSearch();
  
  // ¡NUEVO! Inicializar el filtro
  initModFilter();
}

module.exports = { initMods, showNewsView };