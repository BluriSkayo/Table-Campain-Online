/* ══════════════════════════════════════════════════════════════
   CARACTERÍSTICAS NUEVAS: Secciones colapsables y GM Sub-tabs
══════════════════════════════════════════════════════════════ */

// ── Inicializar secciones colapsables ──────────────────────────
function inicializarSecciones() {
  const sectionHeaders = document.querySelectorAll('.cmd-section-header');
  
  sectionHeaders.forEach(header => {
    // Estado inicial: todas las secciones expandidas
    header.classList.remove('collapsed');
    
    header.addEventListener('click', () => {
      const section = header.parentElement;
      const content = section.querySelector('.cmd-section-content');
      const isCollapsed = header.classList.toggle('collapsed');
      
      if (isCollapsed) {
        content.classList.add('hidden');
      } else {
        content.classList.remove('hidden');
      }
    });
  });
}

// ── Inicializar GM Sub-tabs ───────────────────────────────────
function inicializarGMSubtabs() {
  const gmSubtabs = document.querySelectorAll('.gm-subtab');
  const gmTabContents = document.querySelectorAll('.gm-tab-content');
  
  gmSubtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.gmTab;
      
      // Desactivar todos los tabs
      gmSubtabs.forEach(t => t.classList.remove('activo'));
      gmTabContents.forEach(content => content.classList.remove('activo'));
      
      // Activar el tab clickeado
      tab.classList.add('activo');
      const targetContent = document.getElementById(`gm-tab-${tabName}`);
      if (targetContent) {
        targetContent.classList.add('activo');
      }
    });
  });
  
  // Mostrar el primer tab por defecto
  if (gmSubtabs.length > 0) {
    gmSubtabs[0].classList.add('activo');
  }
  if (gmTabContents.length > 0) {
    gmTabContents[0].classList.add('activo');
  }
}

// Llamar a estas funciones cuando se carga la página
window.addEventListener('load', () => {
  inicializarSecciones();
  inicializarGMSubtabs();
});

// También llamar cuando el GM obtiene permisos
function mostrarPanelGM() {
  const gmSection = document.getElementById('cmd-section-gm');
  if (gmSection) {
    gmSection.classList.remove('oculto');
    // Re-inicializar los sub-tabs cuando aparece el panel
    setTimeout(() => {
      inicializarGMSubtabs();
    }, 100);
  }
}
