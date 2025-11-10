// src/manage.js
const { ipcRenderer } = require('electron');
const dom = require('./dom');
const state = require('./state');
const { getFileUrl, openModal, closeModal, showToast } = require('./utils');

function addManageModalListeners() {
  dom.manageVersionsList.querySelectorAll('.engine-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  dom.manageVersionsList.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const versionItem = btn.closest('.version-item');
      const engineKey = versionItem.dataset.engineKey;
      const version = versionItem.dataset.version;
      const engineName = versionItem.closest('.engine-group').querySelector('.engine-header span').textContent;

      if (action === 'open') {
        ipcRenderer.send('open-install-path', { engine: engineKey, v: version });
      } else if (action === 'edit') {
        showToast('La función de editar estará disponible próximamente.');
      } else if (action === 'delete') {
        state.pendingDeleteData = {
          type: 'delete-version',
          engine: engineKey,
          v: version,
          elementToRemove: versionItem
        };
        dom.confirmMessage.textContent = `¿Estás seguro de que quieres borrar ${engineName} ${version}? Esta acción no se puede deshacer.`;
        openModal(dom.modalConfirm);
      }
    });
  });
}

async function populateManageVersionsModal() {
  dom.manageVersionsList.innerHTML = '<p style="text-align: center; padding: 1em;">Cargando...</p>';
  try {
    const installedData = await ipcRenderer.invoke('get-installed-versions');
    
    if (installedData.length === 0) {
      dom.manageVersionsList.innerHTML = '<p style="text-align: center; padding: 1em;">No hay versiones instaladas.</p>';
      return;
    }

    dom.manageVersionsList.innerHTML = '';
    installedData.forEach(engine => {
      const engineGroup = document.createElement('div');
      engineGroup.className = 'engine-group collapsed';
      
      // ¡CAMBIO! Decide si usar getFileUrl (para paths) o usar el dato (para base64)
      const iconUrl = engine.icon_is_path 
        ? getFileUrl(engine.icon) 
        : (engine.icon || state.defaultIconUrl);
      
      engineGroup.innerHTML = `
        <div class="engine-header" data-engine-key="${engine.key}">
          <img src="${iconUrl}" onerror="this.src='${state.defaultIconUrl}'">
          <span>${engine.name}</span>
          <i class="fas fa-chevron-down collapse-icon"></i>
        </div>
        <div class="version-list">
          ${engine.versions.map(v => `
            <div class="version-item" data-engine-key="${engine.key}" data-version="${v}">
              <span class="version-item-name">${v}</span>
              <div class="version-actions">
                <button class="action-btn" data-action="open" title="Abrir carpeta">
                  <i class="fas fa-folder-open"></i>
                </button>
                <button class="action-btn" data-action="edit" title="Editar (Próximamente)">
                  <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="action-btn delete" data-action="delete" title="Borrar">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      dom.manageVersionsList.appendChild(engineGroup);
    });

    addManageModalListeners();

  } catch (err) {
    console.error('Error al popular modal de gestión:', err);
    dom.manageVersionsList.innerHTML = '<p style="text-align: center; padding: 1em;">Error al cargar versiones.</p>';
  }
}

function initManageVersionsModal() {
  dom.manageVersionsBtn.addEventListener('click', () => {
    populateManageVersionsModal();
    openModal(dom.manageVersionsModal);
  });
  dom.closeManageVersionsModalBtn.addEventListener('click', () => closeModal(dom.manageVersionsModal));
  dom.manageVersionsModal.addEventListener('click', (e) => {
    if (e.target === dom.manageVersionsModal) closeModal(dom.manageVersionsModal);
  });
}

function initConfirmModalListeners() {
  dom.confirmYesBtn.addEventListener('click', () => {
    if (state.pendingDeleteData) {
      if (state.pendingDeleteData.type === 'delete-version') {
        ipcRenderer.send('delete-install', {
          engine: state.pendingDeleteData.engine,
          v: state.pendingDeleteData.v
        });
      }
    }
    closeModal(dom.modalConfirm);
  });
  dom.confirmNoBtn.addEventListener('click', () => {
    state.pendingDeleteData = null; // Limpiar si cancela
    closeModal(dom.modalConfirm);
  });
}

function initManageModals() {
  initManageVersionsModal();
  initConfirmModalListeners();
}

module.exports = { initManageModals };