// src/state.js

const state = {
  versionsData: {},
  selectedInstall: null,
  currentOS: '',
  appSettings: {},
  pendingDeleteData: null,
  currentSelectedEngineKey: null,
  currentSelectedVersion: null,
  currentModFilter: 'all',
  
  // Constantes de UI
  minSidebarWidth: 180,
  maxSidebarWidth: 400,

  // Almacén para dependencias de Node
  node: {
    process: null,
    path: null,
    __dirname: null
  },
  
  defaultIconPath: null,
  defaultIconUrl: null,

  // Inicializador para dependencias de Node
  init: (deps) => {
    // Asignar las dependencias al sub-objeto
    state.node.process = deps.process;
    state.node.path = deps.path;
    // ¡CAMBIO! Asegurarse de que __dirname no sea undefined, usa '.' como fallback
    state.node.__dirname = deps.__dirname || '.';
    
    try {
      // ¡CAMBIO! Usamos una ruta de ícono PNG conocida que existe
      state.defaultIconPath = state.node.path.resolve(state.node.__dirname, 'icons/vanilla/ic_launcher.png');
      
      const fileURL = new URL('file:');
      fileURL.pathname = state.defaultIconPath;
      state.defaultIconUrl = fileURL.href;
      
      if (!state.defaultIconUrl) throw new Error("fileURL.href es nulo");

    } catch (e) {
      console.error("Error al inicializar defaultIconUrl:", e);
      // Fallback súper-seguro en caso de que path falle
      state.defaultIconUrl = 'icons/vanilla/ic_launcher.png';
    }
  },

  // Getters para dependencias de Node (para que otros módulos las usen)
  getNodeDeps: () => state.node
};

module.exports = state;