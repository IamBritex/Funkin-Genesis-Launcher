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
 * ¡NUEVO! Función centralizada para mostrar/ocultar placeholders.
 * Esto resuelve el problema de que desaparezcan.
 */
function updatePlaceholderVisibility() {
  const query = dom.searchInput.value.toLowerCase();
  let visibleCards = 0;
  const allModCards = dom.modsContainer.querySelectorAll('.mod-card');

  allModCards.forEach(card => {
    // Comprueba si la tarjeta está visible (no oculta por la búsqueda)
    if (card.style.display !== 'none') {
      visibleCards++;
    }
  });

  if (allModCards.length === 0) {
    // Estado 1: No hay mods instalados
    dom.modsPlaceholder.classList.remove('hidden');
    dom.modsPlaceholder.dataset.state = 'no-mods';
    
    // Forzar la re-animación de la flecha
    const newArrow = dom.noModsArrow.cloneNode(true);
    dom.noModsArrow.parentNode.replaceChild(newArrow, dom.noModsArrow);
    dom.noModsArrow = newArrow; // Actualizar la referencia en el DOM
    
  } else if (allModCards.length > 0 && visibleCards === 0 && query !== '') {
    // Estado 2: Hay mods, pero la búsqueda no encontró nada
    dom.modsPlaceholder.classList.remove('hidden');
    dom.modsPlaceholder.dataset.state = 'no-results';
  } else {
    // Estado 3: Hay mods y son visibles (o no hay búsqueda)
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
  
  // 2. Definir el banner
  const placeholderBannerUrl = getFileUrl('icons/placeholder.png');
  const bannerUrl = mod.iconPath || placeholderBannerUrl;
  const bannerStyle = `background-image: url('${bannerUrl.replace(/\\/g, '\\\\')}'); background-size: cover; background-position: center;`;
  
  // 3. Definir la versión
  const versionString = mod.version ? `<span class="mod-version">v${mod.version}</span>` : '';

  // 4. ¡CAMBIO! Definir estado de visibilidad leyendo de settings
  // Asumir true (visible) si no está definido (undefined)
  const isVisible = state.appSettings.modVisibility[mod.folderName] !== false; 
  const cardClasses = isVisible ? "mod-card" : "mod-card disabled";
  const visibleButtonText = isVisible 
    ? '<i class="fas fa-eye"></i> Visible' 
    : '<i class="fas fa-eye-slash"></i> Oculto';


  return `
    <div class="${cardClasses}" data-folder-name="${mod.folderName}" data-title="${mod.title}">
      
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

/**
 * ¡CAMBIO! Esta función ahora solo AÑADE tarjetas. La lógica del placeholder se movió.
 */
function renderModCards(mods = []) {
  let modsHtml = '';
  mods.forEach(mod => {
    modsHtml += createModCard(mod);
  });
  // Usamos insertAdjacentHTML para AÑADIR las tarjetas
  // sin borrar el placeholder que ya está en el HTML.
  dom.modsContainer.insertAdjacentHTML('beforeend', modsHtml);

  addModCardListeners(); 
  
  // ¡CAMBIO! Llamar a la función centralizada
  updatePlaceholderVisibility();
}

/**
 * Añade listeners para los menús kebab de las tarjetas.
 */
function addModCardListeners() {
  // ... (código sin cambios, lo omito por brevedad, pero debe estar aquí) ...
  // Cierra menús al hacer clic fuera
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.mod-kebab-menu')) {
      document.querySelectorAll('.mod-kebab-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });
    }
  });

  // Cierra menús al presionar 'Escape'
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.mod-kebab-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });
    }
  });

  // Listener para botones kebab
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

  // Listener para acciones (Modificar, Eliminar)
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
        // ¡CAMBIOS! Guardar el estado de visibilidad
        const isDisabling = !card.classList.contains('disabled');
        card.classList.toggle('disabled');
        
        // 1. Actualizar el estado global
        state.appSettings.modVisibility[folderName] = !isDisabling;
        
        // 2. Enviar los settings actualizados al proceso principal para guardar
        ipcRenderer.send('save-settings', state.appSettings);
        
        // 3. Actualizar UI del botón
        if (isDisabling) {
          e.currentTarget.innerHTML = '<i class="fas fa-eye-slash"></i> Oculto';
        } else {
          e.currentTarget.innerHTML = '<i class="fas fa-eye"></i> Visible';
        }
        
        // 4. Mostrar toast (quitamos "solo visual")
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

  // Cierra menú si el mouse sale de la tarjeta
  dom.modsContainer.querySelectorAll('.mod-card:not(.add-mod-card)').forEach(card => {
    card.addEventListener('mouseleave', () => {
      card.querySelector('.mod-kebab-menu')?.classList.remove('active');
    });
  });
}

/**
 * Manejador de click para la tarjeta "Añadir Mod".
 */
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

/**
 * ¡CAMBIO! Esta función ahora LIMPIA las tarjetas viejas antes de renderizar.
 */
async function loadInstalledMods() {
  try {
    // 1. ¡CAMBIO! Borrar solo las tarjetas .mod-card,
    // dejando el #mods-placeholder intacto.
    dom.modsContainer.querySelectorAll('.mod-card').forEach(card => card.remove());

    // 2. Cargar los mods
    const mods = await ipcRenderer.invoke('mods:get-installed');
    
    // 3. Renderizar (esta función ahora solo añade tarjetas y llama a updatePlaceholderVisibility)
    renderModCards(mods);
    modsLoaded = true;
    
  } catch (err) {
    console.error("Error al invocar 'mods:get-installed':", err);
    showToast('Error al cargar la lista de mods.', true);
  }
}

/**
 * ¡CAMBIO! Lógica de búsqueda actualizada para manejar placeholders dinámicos.
 */
function initModsSearch() {
  dom.searchInput.addEventListener('input', () => {
    dom.searchIcon.className = 'fas fa-spinner fa-spin';
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      const query = dom.searchInput.value.toLowerCase();
      
      // Itera sobre las tarjetas de mod (ignora el placeholder)
      dom.modsContainer.querySelectorAll('.mod-card').forEach(card => {
        const title = card.dataset.title.toLowerCase();
        
        if (title.includes(query)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });

      // ¡CAMBIO! Llamar a la función centralizada
      updatePlaceholderVisibility();

      dom.searchIcon.className = 'fas fa-search';
    }, 300);
  });
}

/**
 * Muestra la vista de Mods y la cabecera.
 */
function showModsView() {
  dom.newsContainer.classList.add('hidden');
  dom.modsContainer.classList.remove('hidden');
  dom.modsHeader.classList.remove('hidden'); 
  
  dom.modsContainer.style.paddingTop = `${dom.modsHeader.offsetHeight}px`;
  
  if (state.versionsData.engines) {
    if (!modsLoaded) {
      loadInstalledMods();
    } else {
      // ¡CAMBIO! Si ya estaban cargados, solo revisa el placeholder
      updatePlaceholderVisibility();
    }
  } else {
    console.warn("Esperando a versionsData... reintentando en 500ms");
    setTimeout(showModsView, 500);
  }

  // Actualiza el botón del sidebar
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-newspaper';
  span.textContent = 'Noticias';
  
  isModsViewActive = true;
}

/**
 * Muestra la vista de Noticias y oculta la cabecera de mods.
 */
function showNewsView() {
  dom.modsContainer.classList.add('hidden');
  dom.modsHeader.classList.add('hidden'); 
  dom.newsContainer.classList.remove('hidden');
  
  // Ocultar el placeholder al salir
  dom.modsPlaceholder.classList.add('hidden');
  
  loadNews();

  // Actualiza el botón del sidebar
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-puzzle-piece';
  span.textContent = 'Mods';

  isModsViewActive = false;
  
  // Resetea la búsqueda al salir de la vista de mods
  dom.searchInput.value = '';
  dom.modsContainer.querySelectorAll('.mod-card').forEach(card => {
    card.style.display = 'flex';
  });
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
}

module.exports = { initMods, showNewsView };