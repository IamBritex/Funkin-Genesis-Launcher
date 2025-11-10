// src/mods.js
const { ipcRenderer } = require('electron'); // ¡NUEVO!
const dom = require('./dom');
const { loadNews } = require('./data');
const { showToast } = require('./utils'); // ¡NUEVO!

let isModsViewActive = false;
let modsLoaded = false; // ¡NUEVO! Flag para no recargar

/**
 * Genera el HTML para una tarjeta de mod.
 */
function createModCard(mod) {
  return `
    <div class="mod-card">
      <div class="mod-card-banner">
        <i class="fas fa-image"></i>
      </div>
      <div class="mod-card-content">
        <h3>${mod.title} <span class="mod-version">v${mod.mod_version}</span></h3>
        <p>${mod.description}</p>
      </div>
    </div>
  `;
}

/**
 * Genera el HTML para la tarjeta especial de "Añadir Mod".
 */
function createAddModCard() {
  return `
    <div class="mod-card add-mod-card" id="add-mod-btn">
      <i class="fas fa-plus"></i>
      <span>Añadir Mod</span>
    </div>
  `;
}

/**
 * Dibuja todas las tarjetas de mods en el contenedor.
 */
function renderModCards(mods = []) {
  // Limpia el contenedor
  dom.modsContainer.innerHTML = '';
  
  // 1. Añade la tarjeta "Añadir Mod"
  dom.modsContainer.innerHTML += createAddModCard();

  // 2. Añade las tarjetas de los mods instalados
  let modsHtml = '';
  mods.forEach(mod => {
    modsHtml += createModCard(mod);
  });
  dom.modsContainer.innerHTML += modsHtml;

  // 3. Añade el listener de click a la tarjeta "Añadir Mod"
  document.getElementById('add-mod-btn').addEventListener('click', handleAddModClick);
}

/**
 * Manejador de click para la tarjeta "Añadir Mod".
 * Llama al proceso principal para abrir el diálogo.
 */
async function handleAddModClick() {
  try {
    const result = await ipcRenderer.invoke('mods:add-mod');

    if (result.success) {
      showToast(`Mod "${result.modData.title}" añadido con éxito.`);
      // Vuelve a cargar y renderizar los mods
      loadInstalledMods(); 
    } else if (result.error) {
      showToast(result.error, true);
    }
    // Si es 'cancelled', no hace nada
  } catch (err) {
    console.error("Error al invocar 'mods:add-mod':", err);
    showToast('Ocurrió un error inesperado al añadir el mod.', true);
  }
}

/**
 * Pide los mods instalados al proceso principal y los renderiza.
 */
async function loadInstalledMods() {
  try {
    const mods = await ipcRenderer.invoke('mods:get-installed');
    renderModCards(mods);
    modsLoaded = true;
  } catch (err) {
    console.error("Error al invocar 'mods:get-installed':", err);
    showToast('Error al cargar la lista de mods.', true);
  }
}

/**
 * Muestra la vista de Mods y oculta las Noticias.
 */
function showModsView() {
  dom.newsContainer.classList.add('hidden');
  dom.modsContainer.classList.remove('hidden');
  
  // ¡CAMBIO! Carga los mods solo si no se han cargado antes
  if (!modsLoaded) {
    loadInstalledMods();
  }

  // Actualiza el botón
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-newspaper';
  span.textContent = 'Noticias';
  
  isModsViewActive = true;
}

/**
 * Muestra la vista de Noticias y oculta los Mods.
 */
function showNewsView() {
  dom.modsContainer.classList.add('hidden');
  dom.newsContainer.classList.remove('hidden');
  
  // Recarga las noticias (opcional, pero lo tenías antes)
  loadNews();

  // Actualiza el botón
  const icon = dom.modsBtn.querySelector('i');
  const span = dom.modsBtn.querySelector('span');
  icon.className = 'fas fa-puzzle-piece';
  span.textContent = 'Mods';

  isModsViewActive = false;
}

/**
 * Inicializa el botón de Mods.
 */
function initMods() {
  dom.modsBtn.addEventListener('click', () => {
    if (isModsViewActive) {
      showNewsView();
    } else {
      showModsView();
    }
  });
}

module.exports = { initMods, showNewsView };