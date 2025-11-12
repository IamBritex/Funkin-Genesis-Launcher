// modules/news-handler.js
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); // <-- ¡AÑADIR ESTA LÍNEA!
const fsp = fs.promises;
const { marked } = require('marked');
const { NEWS_DIR } = require('./constants');

// --- Helpers de Fetch ---
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GenesisLauncher' }
  });
  if (!response.ok) throw new Error(`Failed to fetch JSON: ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GenesisLauncher' }
  });
  if (!response.ok) throw new Error(`Failed to fetch Text: ${response.statusText}`);
  return response.text();
}

function initNewsHandler() {
  ipcMain.handle('load-news', async (event) => {
    try {
      const apiUrl = 'https://api.github.com/repos/IamBritex/Funkin-Genesis-Launcher/contents/news';
      const files = await fetchJson(apiUrl);
      const mdFiles = files.filter(file => file.name.endsWith('.md'));
      if (mdFiles.length === 0) throw new Error("No .md files found in remote repo");
      const downloadPromises = mdFiles.map(file => fetchText(file.download_url));
      const markdownContents = await Promise.all(downloadPromises);
      console.log("Noticias cargadas desde GitHub");
      return markdownContents.reverse().map(content => ({
        html: marked.parse(content)
      }));
    } catch (err) {
      console.error('Error fetching remote news, falling back to local:', err.message);
      try {
        const files = await fsp.readdir(NEWS_DIR);
        const mdFiles = files.filter(file => file.endsWith('.md'));
        const articles = await Promise.all(mdFiles.map(async (file) => {
          const filePath = path.join(NEWS_DIR, file);
          const content = await fsp.readFile(filePath, 'utf-8');
          const stats = await fsp.stat(filePath);
          return { file, content, mtime: stats.mtime };
        }));
        articles.sort((a, b) => b.mtime - a.mtime);
        return articles.map(article => ({
          html: marked.parse(article.content)
        }));
      } catch (localErr) {
        console.error('Error al cargar noticias locales:', localErr);
        return [{ html: '<h3>Error al cargar noticias</h3><p>No se pudo conectar al repositorio ni cargar noticias locales.</p>' }];
      }
    }
  });
}

module.exports = { initNewsHandler };