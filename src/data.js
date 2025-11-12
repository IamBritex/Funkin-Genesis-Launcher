// src/data.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');
const yaml = require('js-yaml'); 

/**
 * Carga versions.yaml (Remoto con fallback local).
 * @param {function} populateEngineListCallback - Función para llamar tras cargar datos.
 */
async function loadVersionData(populateEngineListCallback) {
  const remoteUrl = 'https://raw.githubusercontent.com/IamBritex/Funkin-Genesis-Launcher/main/versions.yaml';
  const localUrl = './versions.yaml'; 

  try {
    const response = await fetch(remoteUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    const yamlText = await response.text(); 
    state.versionsData = yaml.load(yamlText); 
    console.log('versions.yaml cargado desde GitHub');
  } catch (err) {
    console.warn('Error cargando versions.yaml remoto. Usando local.', err.message);
    try {
      // ¡¡¡CAMBIO CLAVE AQUÍ!!!
      // Añadido { cache: "no-store" } para que siempre lea los cambios locales.
      const response = await fetch(localUrl, { cache: "no-store" });
      const yamlText = await response.text(); 
      state.versionsData = yaml.load(yamlText); 
      console.log('versions.yaml cargado desde archivo local');
    } catch (localErr) {
      console.error('Error cargando versions.yaml local:', localErr);
      state.versionsData = { engines: [] }; 
      throw new Error("Error fatal: No se pudo cargar versions.yaml");
    }
  }
  
  if (populateEngineListCallback) {
    populateEngineListCallback();
  }
}

/**
 * Carga las noticias desde el proceso principal.
 */
async function loadNews() {
  try {
    const articles = await ipcRenderer.invoke('load-news');
    dom.newsContainer.innerHTML = '';
    if (articles.length === 0) {
      dom.newsContainer.innerHTML = '<h3 style="text-align: center;">No hay noticias disponibles</h3>';
      return;
    }
    articles.forEach(article => {
      const articleDiv = document.createElement('div');
      articleDiv.className = 'news-article';
      articleDiv.innerHTML = article.html;
      dom.newsContainer.appendChild(articleDiv);
    });
  } catch (err) {
    console.error('Error fatal al cargar noticias:', err);
    dom.newsContainer.innerHTML = '<h3>Error al cargar noticias</h3>';
  }
}

module.exports = { loadVersionData, loadNews };