// splash.js
const { ipcRenderer } = require('electron');

const splashGif = document.getElementById('splash-gif');
const splashText = document.getElementById('splash-text');

// 1. Escuchar el mensaje de 'main.js' que dice "la carga de datos terminó"
ipcRenderer.on('splash-window-loaded', () => {
  
  // 2. Cambiar el GIF y el texto
  splashGif.src = 'images/LOADED bf.gif';
  splashText.textContent = 'LOADED';

  // 3. ¡AJUSTA ESTE NÚMERO!
  // Debe ser la duración en milisegundos de tu GIF "LOADED bf.gif"
  const gifDuration = 2000; // Ejemplo: 2 segundos

  // 4. Esperar a que termine la animación
  setTimeout(() => {
    // 5. Avisarle a 'main.js' que ya puede cerrar el splash
    ipcRenderer.send('splash-animation-finished');
  }, gifDuration);
  
});