"use strict";
// ── Node.js modules (disponibles en Electron con nodeIntegration) ──
const path = require("path");
const fs   = require("fs");

// ClientStorage se carga desde client-storage.js como window.ClientStorage

const WS_URL        = "ws://localhost:8765";
const RESOURCES     = path.join(__dirname, "..", "..", "resources");
const LOGS_DIR      = path.join(__dirname, "..", "..", "logs");
const MUSIC_DIR     = path.join(RESOURCES, "music");
const TOKENS_DIR    = path.join(RESOURCES, "characters", "tokens");
const PORTRAITS_DIR = path.join(RESOURCES, "characters", "portraits");
const MAPS_DIR      = path.join(RESOURCES, "maps");

// ── Estado local ─────────────────────────────────────────────────
let ws, miNombre = "", esGM = false;
let tokens = {}, plantilla = [], plantillasGuardadas = {}, plantillaBloqueada = false;
let turno = [], turnoActual = 0, combateActivo = false;
let misPersonajes = [];
let todosPersonajesGM = {};   // solo para el GM: owner → [lista]
let habilidadesGlobales = []; // habilidades globales del servidor
let personajeActivo = null;   // objeto personaje seleccionado
let tokenSeleccionado = null; // token_id seleccionado en tablero
let modoEdicion = "crear";    // "crear" | "editar"
let tokenAtacanteId = null;
let tokenDefensorId = null;
let campanaActual = null;
let mapaActivo = null;
let mapaImg = null;
let fichaZIndex = 1000;       // z-index base para fichas flotantes

// ── Audio ─────────────────────────────────────────────────────────
let audioCtx = null, audioSource = null, audioGain = null;
let musicaLista = [], musicaIndice = 0, musicaLoop = true, musicaReproduciendo = false;
let targetVol = 0.7, targetVolSfx = 0.7;

// ── DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

/** Escape HTML special characters to prevent XSS in innerHTML */
function esc(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

// Inicio
const pInicio        = $("pantalla-inicio");
const listaCampanas  = $("lista-campanas");
const panelUnion     = $("panel-union");
const unionTitulo    = $("union-titulo");
const inpNombre      = $("inp-nombre");
const btnUnirse      = $("btn-unirse");
const btnCancelarU   = $("btn-cancelar-union");
const unionError     = $("union-error");
const nuevaCNombre   = $("nueva-campana-nombre");
const btnCrearCamp   = $("btn-crear-campana");

// Sala
const sala          = $("sala");
const tbNombre      = $("tb-nombre");
const tbRol         = $("tb-rol");
const tbTurno       = $("tb-turno");
const tbCampana     = $("tb-campana");
const btnVolverIni  = $("btn-volver-inicio");

// Tabs comandos
const cmdTabs       = document.querySelectorAll(".cmd-tab");
const cmdPaneles    = document.querySelectorAll(".cmd-panel");

// Personajes
const listaMisPersonajes = $("lista-mis-personajes");
const fichaPersonaje     = $("ficha-personaje");
const fpDot              = $("fp-dot");
const fpNombre           = $("fp-nombre");
const fpClase            = $("fp-clase");
const fpHpBarra          = $("fp-hp-barra");
const fpHpTxt            = $("fp-hp-txt");
const fpMpBarra          = $("fp-mp-barra");
const fpMpTxt            = $("fp-mp-txt");
const fpStatsGrid        = $("fp-stats-grid");
const btnCrearPersonaje  = $("btn-crear-personaje");
const btnEditarPersonaje = $("btn-editar-personaje");
const btnModEstado       = $("btn-mod-estado");
const fpCerrar           = $("fp-cerrar");

// Habilidades
const listaHabilidades       = $("lista-habilidades");
const habilidadesSinPersonaje= $("habilidades-sin-personaje");

// Dados
const dadoBtns      = document.querySelectorAll(".dado-btn");
const dadoCustomCant= $("dado-custom-cant");
const dadoCustomCar = $("dado-custom-caras");
const btnDadoCustom = $("btn-dado-custom");
const dadoResultado = $("dado-resultado");

// Música
const musicaListaEl   = $("musica-lista");
const musicaVacioEl   = $("musica-vacio");
const musicaNombreEl  = $("musica-nombre-actual");
const btnPrev         = $("btn-prev");
const btnPlay         = $("btn-play");
const btnNext         = $("btn-next");
const btnLoop         = $("btn-loop");
const volMusica       = $("vol-musica");
const volMusicaTxt    = $("vol-musica-txt");
const volSfx          = $("vol-sfx");
const volSfxTxt       = $("vol-sfx-txt");

// GM
const panelGM           = $("panel-gm");
const gmAvisoBloq       = $("gm-aviso-bloq");
const gmStatsLista      = $("gm-stats-lista");
const btnAddStat        = $("btn-add-stat");
const gmFormStat        = $("gm-form-stat");
const gfNombre          = $("gf-nombre");
const gfTipo            = $("gf-tipo");
const gfVsWrap          = $("gf-vs-wrap");
const gfVs              = $("gf-vs");
const gfDado            = $("gf-dado");
const gfOk              = $("gf-ok");
const gfCancelar        = $("gf-cancelar");
const gmPlantNom        = $("gm-plant-nom");
const btnGuardarPlant   = $("btn-guardar-plantilla");
const gmListaPlantillas = $("gm-lista-plantillas");
const gmEnNombre        = $("gm-en-nombre");
const gmEnHp            = $("gm-en-hp");
const gmEnColor         = $("gm-en-color");
const btnAñadirEnemigo  = $("btn-añadir-enemigo");
const btnIniciarCombate = $("btn-iniciar-combate");
const btnTerminarCombate= $("btn-terminar-combate");
const btnSigTurno       = $("btn-sig-turno");
const gmSelVacio        = $("gm-sel-vacio");
const gmSelControles    = $("gm-sel-controles");
const gmSelNombre       = $("gm-sel-nombre");
const gmSelHp           = $("gm-sel-hp");
const gmSelMp           = $("gm-sel-mp");
const btnAplicarGmToken = $("btn-aplicar-gm-token");
const btnBorrarGmToken  = $("btn-borrar-gm-token");
const btnDesbloquear    = $("btn-desbloquear");

// Modales
const modalPersonaje    = $("modal-personaje");
const mpTitulo          = $("modal-personaje-titulo");
const mpNombre          = $("mp-nombre");
const mpClase           = $("mp-clase");
const mpColor           = $("mp-color");
const mpBackstory       = $("mp-backstory");
const mpStatsGrid       = $("mp-stats-grid");
const mpPortrait        = $("mp-portrait");
const mpPortraitPh      = $("mp-portrait-ph");
const btnGuardarPers    = $("btn-guardar-personaje");
const btnCancelarPers   = $("btn-cancelar-personaje");
const modalPersClose    = $("modal-personaje-cerrar");

const modalEstado       = $("modal-estado");
const meHp              = $("me-hp");
const meMp              = $("me-mp");
const btnAplicarEstado  = $("btn-aplicar-estado");
const btnCancelarEstado = $("btn-cancelar-estado");
const modalEstadoClose  = $("modal-estado-cerrar");

const modalAtaque       = $("modal-ataque");
const maObjetivo        = $("ma-objetivo");
const maAtaqueBase      = $("ma-ataque-base");
const maHabilidades     = $("ma-habilidades");
const maObjetosSeccion  = $("ma-objetos-seccion");
const maObjetos         = $("ma-objetos");
const modalAtaqueClose  = $("modal-ataque-cerrar");

// Menú contextual
const ctxMenu  = $("ctx-menu");
const ctxItems = $("ctx-items");

// Canvas
let canvas, ctx;

// ─────────────────────────────────────────────────────────────────
// PANTALLA DE INICIO
// ─────────────────────────────────────────────────────────────────
function renderCampanas(campanas) {
  listaCampanas.innerHTML = "";
  Object.values(campanas).forEach(c => {
    const div = document.createElement("div");
    div.className = "campana-item";
    div.innerHTML = `
      <div>
        <div class="campana-nombre">${c.nombre === "local" ? "🏠 Local" : c.nombre}</div>
        <div class="campana-modo">Modo: ${c.modo} · ${Object.keys(c.tokens || {}).length} tokens</div>
      </div>
      <button class="campana-btn">Unirse</button>`;
    div.querySelector(".campana-btn").addEventListener("click", () => abrirPanelUnion(c));
    listaCampanas.appendChild(div);
  });
}

function abrirPanelUnion(campana) {
  campanaActual = campana;
  unionTitulo.textContent = `Entrar a: ${campana.nombre === "local" ? "🏠 Local" : campana.nombre}`;
  panelUnion.classList.remove("oculto");
}

// Tabs de inicio
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("activo"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.add("oculto"));
    btn.classList.add("activo");
    $(`tab-${btn.dataset.tab}`).classList.remove("oculto");
  });
});

// ── Autologin + carga de personajes offline ─────────────────────────
(function restaurarSesion() {
  try {
    const sesion = ClientStorage.cargarSesion();
    if (sesion?.username) {
      inpNombre.value = sesion.username;
      inpNombre.style.borderColor = "var(--green)";
      setTimeout(() => { inpNombre.style.borderColor = ""; }, 2000);
    }

    // Cargar personajes de la caché local para modo offline
    const cache = ClientStorage.cargarPersonajesLocales();
    if (cache.personajes.length > 0) {
      misPersonajes = cache.personajes;
      // Mostrar indicador de datos offline en la pantalla de inicio
      const aviso = document.createElement("div");
      aviso.style.cssText = "text-align:center;font-size:11px;color:var(--muted);margin-top:8px";
      const syncDate = cache.ultima_sync
        ? new Date(cache.ultima_sync).toLocaleString()
        : "desconocida";
      aviso.textContent = `📦 ${cache.personajes.length} personaje(s) en caché local (sync: ${syncDate})`;
      document.querySelector(".inicio-logo")?.appendChild(aviso);
    }
  } catch(e) { console.warn("[autologin]", e); }
})();

// Campañas estáticas (offline, sin servidor):
// Mostramos siempre al menos "local"
const campanasPorDefecto = {
  local: { nombre:"local", modo:"local", tokens:{}, jugadores:[] }
};
renderCampanas(campanasPorDefecto);

btnCrearCamp.addEventListener("click", () => {
  const nom = nuevaCNombre.value.trim();
  if (!nom) return;
  campanasPorDefecto[nom] = { nombre:nom, modo:"local", tokens:{}, jugadores:[] };
  renderCampanas(campanasPorDefecto);
  nuevaCNombre.value = "";
  // Volver al tab de campañas
  document.querySelector('[data-tab="campanas"]').click();
});

btnCancelarU.addEventListener("click", () => panelUnion.classList.add("oculto"));

btnUnirse.addEventListener("click", conectar);
inpNombre.addEventListener("keydown", e => { if(e.key==="Enter") conectar(); });

// ─────────────────────────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────────────────────────
function conectar() {
  const nom = inpNombre.value.trim();
  if (!nom) { mostrarErrorUnion("Escribe un nombre."); return; }

  ws = new WebSocket(WS_URL);
  ws.onopen    = () => ws.send(JSON.stringify({tipo:"unirse", nombre:nom}));
  ws.onmessage = e  => procesar(JSON.parse(e.data));
  ws.onclose   = ()  => agregarChat("Sistema","Desconectado.","sistema");
  ws.onerror   = ()  => mostrarErrorUnion("No se pudo conectar. ¿Está el servidor corriendo?");
}

function enviar(obj) { if(ws && ws.readyState===1) ws.send(JSON.stringify(obj)); }

// ─────────────────────────────────────────────────────────────────
// PROCESAR MENSAJES
// ─────────────────────────────────────────────────────────────────
function procesar(msg) {
  switch(msg.tipo) {

    case "error":
      mostrarErrorUnion(msg.texto); break;

    case "estado_completo":
      miNombre           = msg.tu_nombre;
      esGM               = msg.es_gm;
      tokens             = msg.tokens || {};
      plantilla          = msg.plantilla || [];
      plantillasGuardadas= msg.plantillas_guardadas || {};
      plantillaBloqueada = msg.plantilla_bloqueada || false;
      turno              = msg.turno || [];
      turnoActual        = msg.turno_actual || 0;
      combateActivo      = msg.combate_activo || false;
      misPersonajes      = msg.personajes || [];
      // Sincronizar personajes con caché local al conectar
      try { ClientStorage.guardarPersonajesLocales(misPersonajes); } catch(e) {}
      mapaActivo         = msg.mapa_activo || null;
      habilidadesGlobales= msg.habilidades_globales || [];
      if (esGM && msg.todos_personajes) todosPersonajesGM = msg.todos_personajes;

      tbNombre.textContent  = miNombre;
      tbCampana.textContent = campanaActual?.nombre || "local";

      // Guardar sesión para autologin en la próxima apertura
      try { ClientStorage.guardarSesion(miNombre, campanaActual?.nombre || "local"); } catch(e) {}
      if (esGM) { tbRol.classList.remove("oculto"); }
      document.querySelectorAll(".gm-only").forEach(el => {
        if(esGM) el.classList.remove("oculto");
      });

      // El historial no se carga (cada cliente lleva su propio log)
      pInicio.classList.add("oculto");
      sala.classList.remove("oculto");
      panelUnion.classList.add("oculto");

      iniciarCanvas();
      if(mapaActivo) cargarImagenMapa(mapaActivo);
      cargarMusica();
      actualizarUI();
      renderMisPersonajes();
      renderGMPlantilla();
      renderGMPlantillasGuardadas();
      if(esGM) { renderGMHabilidades(); renderGMMapaLista(); }
      break;

    case "modo_cambiado":
      esGM = msg.es_gm;
      if(esGM){
        tbRol.classList.remove("oculto");
        document.querySelectorAll(".gm-only").forEach(el => el.classList.remove("oculto"));
        plantilla           = msg.plantilla            || plantilla;
        plantillasGuardadas = msg.plantillas_guardadas || plantillasGuardadas;
        plantillaBloqueada  = msg.plantilla_bloqueada  || false;
        if(msg.todos_personajes) todosPersonajesGM = msg.todos_personajes;
        if(msg.habilidades_globales) habilidadesGlobales = msg.habilidades_globales;
        renderGMPlantilla(); renderGMPlantillasGuardadas(); renderGMHabilidades();
      } else {
        tbRol.classList.add("oculto");
        document.querySelectorAll(".gm-only").forEach(el => el.classList.add("oculto"));
      }
      break;

    case "personaje_creado":
    case "personaje_actualizado":
      misPersonajes = msg.personajes || [];
      renderMisPersonajes();
      // Sincronizar caché local
      try { ClientStorage.guardarPersonajesLocales(misPersonajes); } catch(e) {}
      if(msg.personaje && personajeActivo?.nombre === msg.personaje.nombre){
        personajeActivo = msg.personaje;
        mostrarFichaPersonaje(personajeActivo);
        renderObjetos(personajeActivo);
      }
      // Actualizar la ficha flotante si está abierta para este personaje
      if(msg.personaje){
        const fichaId = `ficha-flotante-${msg.personaje.nombre.replace(/[^a-zA-Z0-9]/g,"-")}`;
        const fichaExistente = document.getElementById(fichaId);
        if(fichaExistente){
          const infoTab = fichaExistente.querySelector(`#${fichaId}-info`);
          const habsTab = fichaExistente.querySelector(`#${fichaId}-habs`);
          if(infoTab) rellenarTabInfo(fichaExistente, fichaId, msg.personaje);
          if(habsTab) rellenarTabHabilidades(fichaExistente, fichaId, msg.personaje);
        }
      }
      break;

    case "todos_personajes_actualizados":
      if(esGM && msg.todos_personajes) todosPersonajesGM = msg.todos_personajes;
      break;

    case "lista_personajes":
      misPersonajes = msg.personajes || [];
      renderMisPersonajes();
      // Sincronizar caché local
      try { ClientStorage.guardarPersonajesLocales(misPersonajes); } catch(e) {}
      // Refresh active character if it was updated
      if(personajeActivo) {
        const p = misPersonajes.find(x=>x.nombre===personajeActivo.nombre);
        if(p) { personajeActivo=p; mostrarFichaPersonaje(p); renderObjetos(p); }
      }
      break;

    case "token_movido":
      if(tokens[msg.token_id]){tokens[msg.token_id].x=msg.x;tokens[msg.token_id].y=msg.y;}
      dibujar(); break;

    case "token_añadido":
      tokens[msg.token.token_id] = msg.token; dibujar(); break;

    case "token_borrado":
      delete tokens[msg.token_id];
      if(tokenSeleccionado===msg.token_id){tokenSeleccionado=null;ocultarGMSel();}
      dibujar(); break;

    case "token_actualizado":
      tokens[msg.token.token_id] = msg.token;
      if(tokenSeleccionado===msg.token.token_id && esGM) mostrarGMSel(msg.token.token_id);
      dibujar(); break;

    case "plantilla_actualizada":
      plantilla          = msg.plantilla;
      plantillaBloqueada = msg.plantilla_bloqueada;
      renderGMPlantilla(); break;

    case "plantillas_guardadas_actualizadas":
      plantillasGuardadas = msg.plantillas_guardadas;
      renderGMPlantillasGuardadas(); break;

    case "chat":
      if(msg.tokens) tokens = msg.tokens;
      agregarChat(msg.autor, msg.texto,
        msg.autor==="Sistema"?"sistema":msg.es_dado?"dado":"normal");
      if(msg.mostrar_en_mapa && msg.resultado !== undefined){
        const colorRoller = Object.values(tokens).find(t=>t.owner===msg.autor)?.color || "#fff";
        mostrarOverlayDado(msg.autor, msg.resultado, colorRoller);
      }
      dibujar(); break;

    case "musica_cambiada":
      manejarMusicaCambiada(msg.archivo); break;

    case "habilidades_globales_actualizadas":
      habilidadesGlobales = msg.habilidades_globales || [];
      if(esGM) renderGMHabilidades();
      // Refresh habilidades tab in any open floating fichas
      document.querySelectorAll(".ficha-flotante").forEach(modal => {
        const idParts = modal.id.replace("ficha-flotante-","");
        const p = misPersonajes.find(x=>x.nombre.replace(/[^a-zA-Z0-9]/g,"-")===idParts);
        if(p) {
          const habsTab = modal.querySelector(`#${modal.id}-habs`);
          if(habsTab) rellenarTabHabilidades(modal, modal.id, p);
        }
      });
      break;

    case "combate_iniciado":
      tokens=msg.tokens; turno=msg.turno; turnoActual=msg.turno_actual; combateActivo=true;
      agregarChat("Sistema",msg.texto_sistema,"sistema");
      actualizarUI(); dibujar(); break;

    case "combate_terminado":
      turno=[]; turnoActual=0; combateActivo=false;
      agregarChat("Sistema",msg.texto_sistema,"sistema");
      actualizarUI(); dibujar(); break;

    case "turno_cambiado":
      turno=msg.turno; turnoActual=msg.turno_actual;
      agregarChat("Sistema",msg.texto_sistema,"sistema");
      actualizarUI(); dibujar(); break;

    case "resultado_ataque":
      tokens=msg.tokens;
      agregarChat("⚔️",msg.texto_sistema,"combate");
      dibujar(); break;

    case "mapa_cambiado":
      mapaActivo = msg.archivo || null;
      cargarImagenMapa(mapaActivo);
      if(esGM) renderGMMapaLista();
      break;

    case "objeto_usado":
      if(msg.tokens) tokens = msg.tokens;
      if(msg.texto) agregarChat("Sistema", msg.texto, "sistema");
      dibujar(); break;

    case "personajes_actualizados":
      // El servidor notifica al jugador que sus personajes fueron actualizados (ej: por edición de habilidad global)
      misPersonajes = msg.personajes || [];
      renderMisPersonajes();
      if(personajeActivo) {
        const p = misPersonajes.find(x=>x.nombre===personajeActivo.nombre);
        if(p) { personajeActivo=p; mostrarFichaPersonaje(p); }
      }
      break;
  }
}

// ─────────────────────────────────────────────────────────────────
// CANVAS
// ─────────────────────────────────────────────────────────────────
const RADIO = 26, GRID = 44;
const tokenImgs = {};

function cargarImagenToken(tokenId, token) {
  const nombre = token.personaje || tokenId;
  const posibles = [
    path.join(TOKENS_DIR, `${nombre}.png`),
    path.join(TOKENS_DIR, `${nombre}.jpg`),
    path.join(TOKENS_DIR, `${nombre}.webp`),
  ];
  for (const ruta of posibles) {
    if (fs.existsSync(ruta)) {
      const img = new Image();
      img.src = ruta;
      img.onload = () => { tokenImgs[tokenId] = img; dibujar(); };
      return;
    }
  }
}

function iniciarCanvas() {
  canvas = $("tablero"); ctx = canvas.getContext("2d");
  ajustar();
  window.addEventListener("resize", ajustar);
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseup",   onUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("click", () => {
    ctxMenu.classList.add("oculto");
    $("ctx-submenu").classList.add("oculto");
  });

  // Drag & Drop — soltar personaje desde lista al canvas
  canvas.addEventListener("dragover", e => {
    if (dragPersonajeNombre) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      canvas.style.cursor = "copy";
    }
  });
  canvas.addEventListener("dragleave", () => {
    if (!dragPersonajeNombre) return;
    canvas.style.cursor = "crosshair";
  });
  canvas.addEventListener("drop", e => {
    e.preventDefault();
    canvas.style.cursor = "crosshair";
    const nombre = dragPersonajeNombre || e.dataTransfer.getData("text/plain");
    if (!nombre) return;
    const {x, y} = canvasXY(e);
    enviar({tipo: "desplegar_token", nombre_personaje: nombre, x: Math.round(x), y: Math.round(y)});
    dragPersonajeNombre = null;
  });
}

function ajustar() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width=r.width; canvas.height=r.height; dibujar();
}

function dibujar() {
  if(!ctx) return;
  const W=canvas.width, H=canvas.height;

  // Fondo: imagen de mapa o color sólido
  if(mapaImg) {
    ctx.drawImage(mapaImg, 0, 0, W, H);
  } else {
    ctx.fillStyle="#0d0d1a"; ctx.fillRect(0,0,W,H);
  }

  ctx.strokeStyle="rgba(255,255,255,0.03)"; ctx.lineWidth=1;
  for(let x=0;x<W;x+=GRID){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=GRID){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

  const turnoNom = combateActivo && turno.length ? turno[turnoActual] : null;

  Object.entries(tokens).forEach(([tid, t]) => {
    const esMio   = t.owner === miNombre;
    const esActivo= tid === turnoNom;
    const esSel   = tid === tokenSeleccionado;
    const {x,y,color} = t;

    // Anillos
    if(esActivo){ ctx.beginPath();ctx.arc(x,y,RADIO+9,0,Math.PI*2);ctx.strokeStyle="#f0c040";ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]); }
    if(esSel)   { ctx.beginPath();ctx.arc(x,y,RADIO+5,0,Math.PI*2);ctx.strokeStyle="rgba(255,255,255,.4)";ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]); }

    ctx.shadowColor=color; ctx.shadowBlur=esMio?18:8;
    ctx.beginPath(); ctx.arc(x,y,RADIO,0,Math.PI*2);

    // Imagen de token personalizada
    const img = tokenImgs[tid];
    if(img){
      ctx.save(); ctx.clip();
      ctx.drawImage(img,x-RADIO,y-RADIO,RADIO*2,RADIO*2);
      ctx.restore();
    } else {
      ctx.fillStyle=color; ctx.fill();
    }

    ctx.strokeStyle=esMio?"#fff":"rgba(255,255,255,.35)";
    ctx.lineWidth=esMio?2.5:1.5; ctx.stroke();
    ctx.shadowBlur=0;

    if(!img){
      ctx.fillStyle="#fff"; ctx.font=`bold 15px Segoe UI`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText((t.personaje||tid)[0].toUpperCase(),x,y);
    }

    // Nombre debajo
    ctx.fillStyle=esMio?"#fff":"rgba(255,255,255,.6)";
    ctx.font=`${esMio?"bold ":""}12px Segoe UI`;
    ctx.textAlign="center"; ctx.textBaseline="top";
    ctx.fillText(t.personaje||tid, x, y+RADIO+4);

    // Barra HP
    const hp=t.stats?.HP??0, hpMax=t.stats?.HP_max??1;
    const pct=Math.max(0,hp/hpMax);
    const bx=x-RADIO,by=y-RADIO-12,bw=RADIO*2;
    ctx.fillStyle="rgba(0,0,0,.5)";
    ctx.beginPath();ctx.roundRect(bx,by,bw,5,2);ctx.fill();
    ctx.fillStyle=pct>.5?"#27ae60":pct>.25?"#f39c12":"#c0392b";
    ctx.beginPath();ctx.roundRect(bx,by,bw*pct,5,2);ctx.fill();
  });

  // Pre-cargar imágenes faltantes
  Object.entries(tokens).forEach(([tid,t])=>{
    if(!tokenImgs[tid]) cargarImagenToken(tid,t);
  });
}

// ─────────────────────────────────────────────────────────────────
// INTERACCIÓN CANVAS
// ─────────────────────────────────────────────────────────────────
let arrastrando=null, offsetDrag={x:0,y:0}, mousoDown=false, mouseMoved=false;
let lastClickTime=0, lastClickTid=null;

function tokenBajo(ex,ey){
  const r=canvas.getBoundingClientRect();
  const mx=ex-r.left, my=ey-r.top;
  for(const [tid,t] of Object.entries(tokens)){
    if(Math.hypot(mx-t.x,my-t.y)<=RADIO) return tid;
  }
  return null;
}

function canvasXY(e){
  const r=canvas.getBoundingClientRect();
  return {x:e.clientX-r.left, y:e.clientY-r.top};
}

function onDown(e){
  if(e.button!==0) return;
  mouseMoved=false; mousoDown=true;
  const tid=tokenBajo(e.clientX,e.clientY);
  if(!tid) return;
  const t=tokens[tid];
  if(t.owner!==miNombre && !esGM) return;
  const {x,y}=canvasXY(e);
  arrastrando=tid; offsetDrag={x:x-t.x,y:y-t.y};
  canvas.style.cursor="grabbing";
}
function onMove(e){
  if(!arrastrando) return;
  mouseMoved=true;
  const {x,y}=canvasXY(e);
  tokens[arrastrando].x=x-offsetDrag.x;
  tokens[arrastrando].y=y-offsetDrag.y;
  dibujar();
}
function onUp(e){
  if(e.button!==0){ arrastrando=null; return; }
  if(arrastrando){
    if(mouseMoved){
      const {x,y}=canvasXY(e);
      enviar({tipo:"mover_token",token_id:arrastrando,
              x:Math.round(x-offsetDrag.x),y:Math.round(y-offsetDrag.y)});
    } else {
      // Click sin arrastre → seleccionar
      seleccionarToken(arrastrando);
    }
    arrastrando=null; canvas.style.cursor="crosshair";
  } else {
    const now=Date.now();
    const tid=tokenBajo(e.clientX,e.clientY);
    if(tid && tokens[tid]){
      const t=tokens[tid];
      if(t.owner!==miNombre && now-lastClickTime<300 && lastClickTid===tid){
        // Doble clic en token enemigo → atacar
        abrirModalAtaque(tid);
        lastClickTime=0; lastClickTid=null;
      } else {
        lastClickTime=now; lastClickTid=tid;
        tokenSeleccionado=null; ocultarGMSel(); dibujar();
      }
    } else {
      lastClickTime=0; lastClickTid=null;
      tokenSeleccionado=null; ocultarGMSel(); dibujar();
    }
  }
  mousoDown=false;
}

function seleccionarToken(tid){
  tokenSeleccionado=tid;
  if(esGM) mostrarGMSel(tid);
  dibujar();
}

// ─────────────────────────────────────────────────────────────────
// MENÚ CONTEXTUAL (click derecho)
// ─────────────────────────────────────────────────────────────────
function onContextMenu(e){
  e.preventDefault();
  const {x: cx, y: cy} = canvasXY(e);
  const tid=tokenBajo(e.clientX,e.clientY);
  const submenuEl = $("ctx-submenu");

  ctxItems.innerHTML="";
  submenuEl.classList.add("oculto");

  if(!tid){
    // Área vacía — "Desplegar token" con submenú (subitems evaluados en hover para usar datos actualizados)
    const getSubitems = () => {
      const personajesDisponibles = esGM
        ? Object.values(todosPersonajesGM).flat()
        : misPersonajes;
      return personajesDisponibles.map(p=>({
        label: p.nombre,
        fn: ()=>{
          enviar({tipo:"desplegar_token",nombre_personaje:p.nombre,
                  x:Math.round(cx),y:Math.round(cy)});
        }
      }));
    };
    agregarCtxItemConSubmenu("📌 Desplegar token", getSubitems, e);

    // "Mover aquí" si hay token seleccionado del jugador
    if(tokenSeleccionado && tokens[tokenSeleccionado]){
      const tsel=tokens[tokenSeleccionado];
      if(tsel.owner===miNombre || esGM){
        agregarCtxItem("🚶 Mover aquí",()=>{
          const nx=Math.round(cx), ny=Math.round(cy);
          tokens[tokenSeleccionado].x=nx; tokens[tokenSeleccionado].y=ny;
          enviar({tipo:"mover_token",token_id:tokenSeleccionado,x:nx,y:ny});
          dibujar();
        });
      }
    }

    ctxMenu.style.left=`${Math.min(e.clientX,window.innerWidth-220)}px`;
    ctxMenu.style.top =`${Math.min(e.clientY,window.innerHeight-200)}px`;
    ctxMenu.classList.remove("oculto");
    e.stopPropagation();
    return;
  }

  const t=tokens[tid];
  const esMio=t.owner===miNombre;

  if(esMio){
    agregarCtxItem("👤 Ver datos del personaje",()=>abrirFichaToken(tid));
    agregarCtxItem("💊 Modificar estado",()=>abrirModificarEstadoToken(tid));
    const objetos=t.objetos||[];
    if(objetos.length){
      agregarCtxSep();
      objetos.forEach(obj=>{
        agregarCtxItem(`🎒 Usar: ${obj.nombre}`,()=>usarObjeto(tid,obj.nombre));
      });
    }
    agregarCtxSep();
    agregarCtxItem("🚪 Retirar token",()=>retirarTokenPropio(tid),"peligro");
  } else {
    agregarCtxItem("🔍 Ver datos",()=>abrirFichaTokenVisible(tid));
    agregarCtxSep();
    agregarCtxItem("⚔️ Atacar",()=>abrirModalAtaque(tid),"peligro");
  }
  if(esGM){
    agregarCtxSep();
    agregarCtxItem("✏️ Editar (GM)",()=>mostrarGMSel(tid));
    agregarCtxItem("🗑️ Borrar (GM)",()=>{
      if(confirm(`¿Borrar "${t.personaje||tid}"?`)) enviar({tipo:"gm_borrar_token",token_id:tid});
    },"peligro");
  }

  ctxMenu.style.left=`${Math.min(e.clientX, window.innerWidth-220)}px`;
  ctxMenu.style.top =`${Math.min(e.clientY, window.innerHeight-200)}px`;
  ctxMenu.classList.remove("oculto");
  e.stopPropagation();
}

function retirarTokenPropio(tid) {
  const t = tokens[tid];
  if (!t || t.owner !== miNombre) return;  // doble verificación de seguridad
  enviar({ tipo: "gm_borrar_token", token_id: tid });
  // Nota: usamos gm_borrar_token porque es el mismo mensaje de borrado de token
  // pero el servidor valida que solo el GM o el dueño puede hacerlo.
  // Como el servidor actual solo permite GM borrar tokens, añadimos un tipo propio:
  enviar({ tipo: "retirar_token", token_id: tid });
}

function agregarCtxItem(label,fn,cls=""){
  const div=document.createElement("div"); div.className=`ctx-item ${cls}`;
  div.textContent=label; div.addEventListener("click",()=>{fn();ctxMenu.classList.add("oculto"); $("ctx-submenu").classList.add("oculto");});
  ctxItems.appendChild(div);
}
function agregarCtxSep(){
  const sep=document.createElement("div"); sep.className="ctx-sep"; ctxItems.appendChild(sep);
}

function agregarCtxItemConSubmenu(label, subitems, originalEvent){
  const div=document.createElement("div"); div.className="ctx-item ctx-item-sub";
  div.innerHTML=`${label} <span class="ctx-arrow">›</span>`;

  const submenuEl = $("ctx-submenu");
  const submenuItems = $("ctx-submenu-items");

  div.addEventListener("mouseenter", ()=>{
    submenuItems.innerHTML="";
    // subitems puede ser un array o una función que devuelve un array
    const items = typeof subitems === "function" ? subitems() : subitems;
    if(!items.length){
      const empty=document.createElement("div"); empty.className="ctx-item ctx-vacio";
      empty.textContent="Sin personajes"; submenuItems.appendChild(empty);
    } else {
      items.forEach(item=>{
        const d=document.createElement("div"); d.className="ctx-item";
        d.textContent=item.label;
        d.addEventListener("click",()=>{
          item.fn();
          ctxMenu.classList.add("oculto");
          submenuEl.classList.add("oculto");
        });
        submenuItems.appendChild(d);
      });
    }
    const rect=div.getBoundingClientRect();
    submenuEl.style.left=`${rect.right}px`;
    submenuEl.style.top =`${rect.top}px`;
    submenuEl.classList.remove("oculto");
  });

  div.addEventListener("mouseleave",(e)=>{
    if(!submenuEl.contains(e.relatedTarget)){
      submenuEl.classList.add("oculto");
    }
  });

  submenuEl.addEventListener("mouseleave",()=>{ submenuEl.classList.add("oculto"); }, {once:false});

  ctxItems.appendChild(div);
}

// Ver datos completos del token propio
function abrirFichaToken(tid){
  const t=tokens[tid];
  const p=misPersonajes.find(x=>x.nombre===t.personaje);
  if(p){ personajeActivo=p; abrirFichaFlotante(p); }
}

// Ver datos visibles del token enemigo
function abrirFichaTokenVisible(tid){
  const t=tokens[tid];
  const visibles=t.info_visible||["HP","nombre"];
  let txt=`${t.personaje}: `;
  visibles.forEach(campo=>{
    if(campo==="HP") txt+=`HP ${t.stats?.HP??'?'}/${t.stats?.HP_max??'?'} `;
    else if(campo==="nombre") txt+="";
    else txt+=`${campo}:${t.stats?.[campo]??'?'} `;
  });
  agregarChat("Sistema",txt.trim(),"sistema");
}

// ─────────────────────────────────────────────────────────────────
// FICHA DE PERSONAJE FLOTANTE (modal arrastrable con pestañas)
// ─────────────────────────────────────────────────────────────────
function abrirFichaFlotante(p){
  const id=`ficha-flotante-${p.nombre.replace(/[^a-zA-Z0-9]/g,'-')}`;
  const existente=document.getElementById(id);
  if(existente){ existente.style.zIndex=++fichaZIndex; return; }

  const modal=document.createElement("div");
  modal.id=id;
  modal.className="ficha-flotante";
  modal.style.cssText=`position:fixed;top:${80+Math.random()*60|0}px;left:${200+Math.random()*80|0}px;z-index:${++fichaZIndex};`;

  modal.innerHTML=`
    <div class="ficha-flotante-header">
      <div class="ff-dot" style="background:${esc(p.color)}"></div>
      <span class="ff-titulo">${esc(p.nombre)}</span>
      <button class="btn-icono ff-cerrar">✕</button>
    </div>
    <div class="ficha-flotante-tabs">
      <button class="ficha-tab activo" data-tab="info">Información</button>
      <button class="ficha-tab" data-tab="habs">Habilidades</button>
    </div>
    <div class="ficha-flotante-body">
      <div class="ff-tab-content" id="${esc(id)}-info"></div>
      <div class="ff-tab-content oculto" id="${esc(id)}-habs"></div>
    </div>`;

  modal.querySelector(".ff-cerrar").addEventListener("click",()=>modal.remove());

  // Tabs
  modal.querySelectorAll(".ficha-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      modal.querySelectorAll(".ficha-tab").forEach(t=>t.classList.remove("activo"));
      modal.querySelectorAll(".ff-tab-content").forEach(c=>c.classList.add("oculto"));
      tab.classList.add("activo");
      modal.querySelector(`#${id}-${tab.dataset.tab}`).classList.remove("oculto");
    });
  });

  // Traer al frente al hacer clic
  modal.addEventListener("mousedown",()=>{ modal.style.zIndex=++fichaZIndex; });

  // Arrastrar
  hacerArrastrable(modal, modal.querySelector(".ficha-flotante-header"));

  document.body.appendChild(modal);
  rellenarTabInfo(modal, id, p);
  rellenarTabHabilidades(modal, id, p);
}

function hacerArrastrable(elem, handle){
  let ox=0, oy=0;
  handle.addEventListener("mousedown",e=>{
    if(e.target.closest(".btn-icono")) return; // no arrastrar al cerrar
    e.preventDefault();
    ox=e.clientX-elem.offsetLeft;
    oy=e.clientY-elem.offsetTop;
    function onMove(e){ elem.style.left=(e.clientX-ox)+"px"; elem.style.top=(e.clientY-oy)+"px"; }
    function onUp(){ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); }
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
  });
}

function rellenarTabInfo(modal, id, p){
  const cont=modal.querySelector(`#${id}-info`);
  const hp=p.stats?.HP??0, hpMax=p.stats?.HP_max??1;
  const mp=p.stats?.MP??0, mpMax=p.stats?.MP_max??1;
  const pctHp=Math.max(0,Math.min(1,hp/hpMax));
  const pctMp=Math.max(0,Math.min(1,mp/mpMax));
  const colHp=pctHp>.5?"#27ae60":pctHp>.25?"#f39c12":"#c0392b";

  // Retrato
  let portraitHtml="";
  const posibles=[
    path.join(PORTRAITS_DIR,`${p.nombre}.png`),
    path.join(PORTRAITS_DIR,`${p.nombre}.jpg`),
    path.join(PORTRAITS_DIR,`${p.nombre}.webp`),
  ];
  const portFile=posibles.find(f=>fs.existsSync(f));
  if(portFile) portraitHtml=`<img class="ff-portrait" src="${portFile}" alt="Retrato"/>`;
  else portraitHtml=`<div class="ff-portrait-ph">Sin retrato</div>`;

  // Stats de plantilla
  let statsHtml="";
  plantilla.forEach(s=>{
    const val=p.stats?.[s.nombre]??"-";
    statsHtml+=`<div class="fp-stat"><div class="fp-stat-val">${esc(val)}</div><div class="fp-stat-nom">${esc(s.nombre)}</div></div>`;
  });

  // Objetos
  let objetosHtml=`<div class="cmd-seccion-titulo" style="margin-top:8px">🎒 Objetos</div>`;
  const objetos=p.objetos||[];
  if(!objetos.length) objetosHtml+=`<div class="cmd-vacio">Sin objetos</div>`;
  else objetos.forEach(obj=>{
    const miToken=Object.entries(tokens).find(([,t])=>t.owner===miNombre&&t.personaje===p.nombre);
    const btnDis=miToken?"":"disabled title='Despliega tu token primero'";
    const tid=miToken?miToken[0]:"";
    objetosHtml+=`<div class="objeto-item">
      <div class="objeto-info"><div class="objeto-nombre">${esc(obj.nombre)}</div><div class="objeto-desc">${esc(obj.descripcion||"")}</div></div>
      <button class="objeto-usar" data-tid="${esc(tid)}" data-obj="${esc(obj.nombre)}" ${btnDis}>Usar</button>
    </div>`;
  });

  cont.innerHTML=`
    <div class="ff-info-top">
      ${portraitHtml}
      <div class="ff-info-datos">
        <div class="ff-nombre">${esc(p.nombre)}</div>
        <div class="ff-clase">${esc(p.clase||"Aventurero")}</div>
        ${p.backstory?`<div class="ff-backstory">${esc(p.backstory)}</div>`:""}
      </div>
    </div>
    <div class="barra-bg"><div class="barra-fill verde" style="width:${pctHp*100}%;background:${esc(colHp)}"></div></div>
    <div class="barra-txt"><span>HP</span><span>${esc(hp)} / ${esc(hpMax)}</span></div>
    <div class="barra-bg"><div class="barra-fill azul" style="width:${pctMp*100}%"></div></div>
    <div class="barra-txt"><span>MP</span><span>${esc(mp)} / ${esc(mpMax)}</span></div>
    <div class="fp-stats-grid" style="margin:8px 0">${statsHtml}</div>
    ${objetosHtml}
    <div class="ficha-acciones" style="margin-top:8px">
      <button class="cmd-btn azul ff-btn-editar">✏️ Editar</button>
      <button class="cmd-btn naranja ff-btn-estado">💊 Estado</button>
    </div>`;

  cont.querySelectorAll(".objeto-usar").forEach(btn=>{
    btn.addEventListener("click",()=>{ if(btn.dataset.tid) usarObjeto(btn.dataset.tid,btn.dataset.obj); });
  });
  cont.querySelector(".ff-btn-editar").addEventListener("click",()=>{
    abrirModalPersonaje("editar",p);
  });
  cont.querySelector(".ff-btn-estado").addEventListener("click",()=>{
    const miToken=Object.entries(tokens).find(([,t])=>t.owner===miNombre&&t.personaje===p.nombre);
    if(!miToken){ agregarChat("Sistema","Despliega primero tu token.","sistema"); return; }
    abrirModificarEstadoToken(miToken[0]);
  });
}

function rellenarTabHabilidades(modal, id, p){
  const cont=modal.querySelector(`#${id}-habs`);
  renderHabilidadesFlotante(cont, p);
}

function renderHabilidadesFlotante(cont, p){
  cont.innerHTML="";
  const habs=p.habilidades||[];

  const lista=document.createElement("div");
  habs.forEach(h=>{
    const row=document.createElement("div"); row.className="hab-item";
    row.innerHTML=`<div><div class="hab-nombre">${esc(h.nombre)}</div><div class="hab-formula">📐 ${esc(h.formula)}</div></div>`;
    if(h.nombre!=="Ataque"){
      const btnOlv=document.createElement("button"); btnOlv.className="gm-stat-del"; btnOlv.textContent="✕";
      btnOlv.title="Olvidar habilidad";
      btnOlv.addEventListener("click",()=>{
        enviar({tipo:"quitar_habilidad_personaje",nombre_personaje:p.nombre,nombre_habilidad:h.nombre});
      });
      row.appendChild(btnOlv);
    }
    lista.appendChild(row);
  });
  cont.appendChild(lista);

  // Botón añadir habilidad
  const btnAdd=document.createElement("button"); btnAdd.className="cmd-btn azul"; btnAdd.textContent="＋ Añadir habilidad";
  btnAdd.style.marginTop="8px";
  cont.appendChild(btnAdd);

  const picker=document.createElement("div"); picker.className="ff-hab-picker oculto";
  const searchInput=document.createElement("input"); searchInput.className="gm-input"; searchInput.placeholder="Buscar habilidad...";
  picker.appendChild(searchInput);
  const pickerList=document.createElement("div");
  picker.appendChild(pickerList);
  cont.appendChild(picker);

  function renderPicker(filtro=""){
    pickerList.innerHTML="";
    const yaT=new Set(habs.map(h=>h.nombre));
    habilidadesGlobales.filter(h=>!yaT.has(h.nombre)&&h.nombre.toLowerCase().includes(filtro.toLowerCase())).forEach(h=>{
      const d=document.createElement("div"); d.className="ctx-item";
      d.innerHTML=`<b>${esc(h.nombre)}</b> <span style="color:var(--muted);font-size:11px">${esc(h.formula)}</span>`;
      d.addEventListener("click",()=>{
        enviar({tipo:"añadir_habilidad_personaje",nombre_personaje:p.nombre,nombre_habilidad:h.nombre});
        picker.classList.add("oculto");
      });
      pickerList.appendChild(d);
    });
    if(!pickerList.children.length){
      pickerList.innerHTML=`<div class="cmd-vacio">No hay habilidades disponibles</div>`;
    }
  }

  btnAdd.addEventListener("click",()=>{ picker.classList.toggle("oculto"); renderPicker(); });
  searchInput.addEventListener("input",()=>renderPicker(searchInput.value));
}

// ─────────────────────────────────────────────────────────────────
// MODAL ATAQUE
// ─────────────────────────────────────────────────────────────────
function abrirModalAtaque(tidDefensor){
  // Necesitamos un token atacante propio
  const miToken=Object.entries(tokens).find(([,t])=>t.owner===miNombre);
  if(!miToken){ agregarChat("Sistema","No tienes un token en el tablero.","sistema"); return; }
  tokenAtacanteId=miToken[0]; tokenDefensorId=tidDefensor;

  const ta=tokens[tokenAtacanteId];
  const habs=ta.habilidades||[];
  maObjetivo.textContent=tokens[tidDefensor]?.personaje||tidDefensor;

  // Sección 1: Ataque neutral
  maAtaqueBase.innerHTML="";
  const ataqueBase=habs.find(h=>h.nombre==="Ataque")||{nombre:"Ataque",formula:"40",descripcion:"Ataque básico (daño fijo: 40)"};
  const btnBase=document.createElement("button"); btnBase.className="ataque-btn";
  btnBase.innerHTML=`<div class="ataque-btn-nombre">${ataqueBase.nombre}</div>
                     <div class="ataque-btn-formula">${ataqueBase.formula} — ${ataqueBase.descripcion||""}</div>`;
  btnBase.addEventListener("click",()=>{
    enviar({tipo:"atacar",token_atacante:tokenAtacanteId,token_defensor:tidDefensor,habilidad:"Ataque"});
    modalAtaque.classList.add("oculto");
  });
  maAtaqueBase.appendChild(btnBase);

  // Sección 2: Otras habilidades
  maHabilidades.innerHTML="";
  const otrasHabs=habs.filter(h=>h.nombre!=="Ataque");
  otrasHabs.forEach(h=>{
    const btn=document.createElement("button"); btn.className="ataque-btn";
    btn.innerHTML=`<div class="ataque-btn-nombre">${h.nombre}</div>
                   <div class="ataque-btn-formula">${h.formula}</div>`;
    btn.addEventListener("click",()=>{
      enviar({tipo:"atacar",token_atacante:tokenAtacanteId,token_defensor:tidDefensor,habilidad:h.nombre});
      modalAtaque.classList.add("oculto");
    });
    maHabilidades.appendChild(btn);
  });
  if(!otrasHabs.length){
    const p=document.createElement("div"); p.className="cmd-vacio"; p.textContent="Sin habilidades adicionales";
    maHabilidades.appendChild(p);
  }

  // Sección 3: Objetos
  const objetos=ta.objetos||[];
  maObjetosSeccion.classList.toggle("oculto",!objetos.length);
  maObjetos.innerHTML="";
  objetos.forEach(obj=>{
    const btn=document.createElement("button"); btn.className="ataque-btn";
    btn.innerHTML=`<div class="ataque-btn-nombre">🎒 ${obj.nombre}</div>
                   <div class="ataque-btn-formula">${obj.descripcion||""}</div>`;
    btn.addEventListener("click",()=>{
      enviar({tipo:"usar_objeto",token_id:tokenAtacanteId,nombre_objeto:obj.nombre});
      modalAtaque.classList.add("oculto");
    });
    maObjetos.appendChild(btn);
  });

  modalAtaque.classList.remove("oculto");
}

function usarObjeto(tokenId, nombreObjeto){
  enviar({tipo:"usar_objeto",token_id:tokenId,nombre_objeto:nombreObjeto});
}

function abrirModificarEstadoToken(tid){
  const t=tokens[tid];
  meHp.value=t.stats?.HP??0;
  meMp.value=t.stats?.MP??0;
  btnAplicarEstado.onclick=()=>{
    enviar({tipo:"modificar_estado",token_id:tid,
            hp:parseInt(meHp.value),mp:parseInt(meMp.value)});
    modalEstado.classList.add("oculto");
  };
  modalEstado.classList.remove("oculto");
}

// ─────────────────────────────────────────────────────────────────
// PERSONAJES
// ─────────────────────────────────────────────────────────────────
function renderMisPersonajes(){
  listaMisPersonajes.innerHTML="";
  if(!misPersonajes.length){
    const p=document.createElement("div"); p.className="cmd-vacio";
    p.textContent="No tienes personajes aún"; listaMisPersonajes.appendChild(p); return;
  }
  misPersonajes.forEach(p=>{
    const div=document.createElement("div");
    div.className=`personaje-item${personajeActivo?.nombre===p.nombre?" activo":""}`;
    div.dataset.nombrePersonaje = p.nombre;
    div.innerHTML=`<div class="pers-dot" style="background:${p.color}"></div>
      <div class="flex1">
        <div class="pers-nombre">${p.nombre}</div>
        <div class="pers-clase">${p.clase||"Aventurero"}</div>
      </div>`;
    div.addEventListener("click",()=>{
      personajeActivo=p; renderMisPersonajes();
      abrirFichaFlotante(p);
      // Si el panel de habilidades está abierto, actualizarlo también
      if(document.getElementById("panel-habilidades") &&
         !document.getElementById("panel-habilidades").classList.contains("oculto")){
        renderHabilidades(p);
      }
    });
    listaMisPersonajes.appendChild(div);
  });
  habilitarDragPersonajes();
}

function mostrarFichaPersonaje(p){
  if(!p) return;
  fpDot.style.background=p.color;
  fpNombre.textContent=p.nombre;
  fpClase.textContent=p.clase||"Aventurero";

  // Mostrar retrato si existe
  const fpPortrait=$("fp-portrait");
  const posiblesPortrait=[
    path.join(PORTRAITS_DIR,`${p.nombre}.png`),
    path.join(PORTRAITS_DIR,`${p.nombre}.jpg`),
    path.join(PORTRAITS_DIR,`${p.nombre}.webp`),
  ];
  const portFile=posiblesPortrait.find(f=>fs.existsSync(f));
  if(portFile){
    fpPortrait.src=portFile; fpPortrait.classList.remove("oculto");
  } else {
    fpPortrait.classList.add("oculto");
  }

  const hp=p.stats?.HP??0, hpMax=p.stats?.HP_max??1;
  const mp=p.stats?.MP??0, mpMax=p.stats?.MP_max??1;
  const pctHp=Math.max(0,Math.min(1,hp/hpMax));
  const pctMp=Math.max(0,Math.min(1,mp/mpMax));
  fpHpBarra.style.width=(pctHp*100)+"%";
  fpHpBarra.style.background=pctHp>.5?"#27ae60":pctHp>.25?"#f39c12":"#c0392b";
  fpHpTxt.textContent=`${hp} / ${hpMax}`;
  fpMpBarra.style.width=(pctMp*100)+"%";
  fpMpTxt.textContent=`${mp} / ${mpMax}`;

  fpStatsGrid.innerHTML="";
  plantilla.forEach(s=>{
    const val=p.stats?.[s.nombre]??"-";
    const div=document.createElement("div"); div.className="fp-stat";
    div.innerHTML=`<div class="fp-stat-val">${val}</div><div class="fp-stat-nom">${s.nombre}</div>`;
    fpStatsGrid.appendChild(div);
  });

  fichaPersonaje.classList.remove("oculto");
}

function renderHabilidades(p){
  listaHabilidades.innerHTML="";
  habilidadesSinPersonaje.classList.add("oculto");
  const habs=p?.habilidades||[];
  habs.forEach(h=>{
    const div=document.createElement("div"); div.className="hab-item";
    div.innerHTML=`<div class="hab-nombre">${h.nombre}</div>
                   <div class="hab-formula">📐 ${h.formula}</div>`;
    listaHabilidades.appendChild(div);
  });
}

function renderObjetos(p){
  const panelObj=$("panel-objetos");
  const listaObj=$("lista-objetos");
  if(!p){ panelObj.classList.add("oculto"); return; }
  panelObj.classList.remove("oculto");
  listaObj.innerHTML="";
  const objetos=p.objetos||[];
  if(!objetos.length){
    const d=document.createElement("div"); d.className="cmd-vacio"; d.textContent="Sin objetos";
    listaObj.appendChild(d); return;
  }
  objetos.forEach(obj=>{
    const div=document.createElement("div"); div.className="objeto-item";
    const info=document.createElement("div"); info.className="objeto-info";
    info.innerHTML=`<div class="objeto-nombre">${obj.nombre}</div>
                    <div class="objeto-desc">${obj.descripcion||""}</div>`;
    const btn=document.createElement("button"); btn.className="objeto-usar";
    btn.textContent="Usar";
    const miToken=Object.entries(tokens).find(([,t])=>t.owner===miNombre&&t.personaje===p.nombre);
    if(miToken){
      btn.addEventListener("click",()=>usarObjeto(miToken[0],obj.nombre));
    } else {
      btn.disabled=true; btn.title="Despliega tu token primero";
    }
    div.appendChild(info); div.appendChild(btn);
    listaObj.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────────
// MODAL PERSONAJE
// ─────────────────────────────────────────────────────────────────
function abrirModalPersonaje(modo, p=null){
  modoEdicion=modo;
  mpTitulo.textContent=modo==="crear"?"Crear personaje":"Editar personaje";
  mpNombre.value    = p?.nombre||"";
  mpNombre.readOnly = modo==="editar";
  mpClase.value     = p?.clase||"";
  mpColor.value     = p?.color||"#3498db";
  mpBackstory.value = p?.backstory||"";

  // Mostrar retrato si existe
  const nombre=p?.nombre||"";
  if(nombre && modo==="editar"){
    const posibles=[
      path.join(PORTRAITS_DIR,`${nombre}.png`),
      path.join(PORTRAITS_DIR,`${nombre}.jpg`),
      path.join(PORTRAITS_DIR,`${nombre}.webp`),
    ];
    const portFile=posibles.find(f=>fs.existsSync(f));
    if(portFile){
      mpPortrait.src=portFile; mpPortrait.classList.remove("oculto"); mpPortraitPh.classList.add("oculto");
    } else {
      mpPortrait.classList.add("oculto"); mpPortraitPh.classList.remove("oculto");
    }
  } else {
    mpPortrait.classList.add("oculto"); mpPortraitPh.classList.remove("oculto");
  }

  mpStatsGrid.innerHTML="";
  plantilla.forEach(s=>{
    const val=p?.stats?.[s.nombre]??10;
    const item=document.createElement("div"); item.className="stat-edit-item";
    item.innerHTML=`<label class="stat-edit-label">${s.nombre}</label>
      <input class="stat-edit-input" type="number" min="0" max="9999"
             data-stat="${s.nombre}" value="${val}"/>`;
    mpStatsGrid.appendChild(item);
  });
  // Agregar HP/MP
  ["HP","HP_max","MP","MP_max"].forEach(campo=>{
    const val=p?.stats?.[campo]??(campo.includes("max")?100:100);
    const item=document.createElement("div"); item.className="stat-edit-item";
    item.innerHTML=`<label class="stat-edit-label">${campo.replace("_"," ")}</label>
      <input class="stat-edit-input" type="number" min="0" max="99999"
             data-stat="${campo}" value="${val}"/>`;
    mpStatsGrid.appendChild(item);
  });

  modalPersonaje.classList.remove("oculto");
}

btnCrearPersonaje.addEventListener("click",()=>abrirModalPersonaje("crear"));
btnEditarPersonaje.addEventListener("click",()=>{
  if(personajeActivo) abrirModalPersonaje("editar",personajeActivo);
});
btnCancelarPers.addEventListener("click",()=>modalPersonaje.classList.add("oculto"));
modalPersClose.addEventListener("click",()=>modalPersonaje.classList.add("oculto"));

btnGuardarPers.addEventListener("click",()=>{
  const stats={};
  mpStatsGrid.querySelectorAll("[data-stat]").forEach(inp=>{
    stats[inp.dataset.stat]=parseInt(inp.value)||0;
  });
  if(modoEdicion==="crear"){
    const nom=mpNombre.value.trim(); if(!nom){alert("Escribe un nombre."); return;}
    enviar({tipo:"crear_personaje",nombre_personaje:nom,
            clase:mpClase.value.trim()||"Aventurero",
            color:mpColor.value, backstory:mpBackstory.value, stats});
  } else {
    enviar({tipo:"editar_personaje",nombre_personaje:personajeActivo.nombre,
            clase:mpClase.value.trim(),color:mpColor.value,
            backstory:mpBackstory.value,stats});
  }
  modalPersonaje.classList.add("oculto");
});

fpCerrar.addEventListener("click",()=>fichaPersonaje.classList.add("oculto"));

// Modificar estado (desde botón panel — mantenido por compatibilidad)
btnModEstado.addEventListener("click",()=>{
  if(!personajeActivo) return;
  const miToken=Object.entries(tokens).find(([,t])=>t.owner===miNombre&&t.personaje===personajeActivo.nombre);
  if(!miToken){agregarChat("Sistema","Despliega primero tu token.","sistema"); return;}
  abrirModificarEstadoToken(miToken[0]);
});

btnCancelarEstado.addEventListener("click",()=>modalEstado.classList.add("oculto"));
modalEstadoClose.addEventListener("click",()=>modalEstado.classList.add("oculto"));
modalAtaqueClose.addEventListener("click",()=>modalAtaque.classList.add("oculto"));

// ─────────────────────────────────────────────────────────────────
// GM: PLANTILLA
// ─────────────────────────────────────────────────────────────────
function renderGMPlantilla(){
  gmAvisoBloq.classList.toggle("oculto",!plantillaBloqueada);
  gmStatsLista.innerHTML="";
  plantilla.forEach((s,i)=>{
    const row=document.createElement("div"); row.className="gm-stat-row";
    const tipoCls=s.tipo==="ofensiva"?"tipo-of":s.tipo==="defensiva"?"tipo-def":"tipo-neu";
    const vsInfo=s.tipo==="ofensiva"&&s.vs?` → ${s.vs}`:"";
    row.innerHTML=`<span>${s.nombre}</span>
      <span class="tipo-badge ${tipoCls}">${s.tipo}${vsInfo}</span>
      <button class="gm-stat-del" data-i="${i}">✕</button>`;
    gmStatsLista.appendChild(row);
  });
  gmStatsLista.querySelectorAll(".gm-stat-del").forEach(btn=>{
    btn.addEventListener("click",()=>{plantilla.splice(parseInt(btn.dataset.i),1);enviar({tipo:"gm_set_plantilla",plantilla});});
  });
  actualizarSelectVs();
}

function actualizarSelectVs(){
  const defs=plantilla.filter(s=>s.tipo==="defensiva");
  gfVs.innerHTML=defs.map(s=>`<option>${s.nombre}</option>`).join("");
  gfVsWrap.style.display=gfTipo.value==="ofensiva"&&defs.length?"":"none";
}

function renderGMPlantillasGuardadas(){
  gmListaPlantillas.innerHTML="";
  Object.keys(plantillasGuardadas).forEach(nom=>{
    const row=document.createElement("div"); row.className="gm-plantilla-item";
    row.innerHTML=`<span>${nom}</span>
      <div style="display:flex;gap:4px">
        <button class="cmd-btn azul" style="padding:3px 7px;font-size:11px;margin:0" data-load="${nom}">Cargar</button>
        <button class="gm-stat-del" data-del="${nom}">✕</button>
      </div>`;
    gmListaPlantillas.appendChild(row);
  });
  gmListaPlantillas.querySelectorAll("[data-load]").forEach(b=>
    b.addEventListener("click",()=>enviar({tipo:"gm_cargar_plantilla",nombre_plantilla:b.dataset.load})));
  gmListaPlantillas.querySelectorAll("[data-del]").forEach(b=>
    b.addEventListener("click",()=>enviar({tipo:"gm_borrar_plantilla_guardada",nombre_plantilla:b.dataset.del})));
}

// GM: stat form
btnAddStat.addEventListener("click",()=>{ gmFormStat.classList.remove("oculto"); btnAddStat.classList.add("oculto"); actualizarSelectVs(); });
gfTipo.addEventListener("change",actualizarSelectVs);
gfCancelar.addEventListener("click",()=>{ gmFormStat.classList.add("oculto"); btnAddStat.classList.remove("oculto"); });
gfOk.addEventListener("click",()=>{
  const nom=gfNombre.value.trim(); if(!nom) return;
  const s={nombre:nom,tipo:gfTipo.value,dado:gfDado.value};
  if(gfTipo.value==="ofensiva"&&gfVs.value) s.vs=gfVs.value;
  plantilla.push(s); enviar({tipo:"gm_set_plantilla",plantilla});
  gfNombre.value=""; gmFormStat.classList.add("oculto"); btnAddStat.classList.remove("oculto");
});
btnGuardarPlant.addEventListener("click",()=>{
  const nom=gmPlantNom.value.trim(); if(!nom) return;
  enviar({tipo:"gm_guardar_plantilla",nombre_plantilla:nom}); gmPlantNom.value="";
});
btnDesbloquear.addEventListener("click",()=>enviar({tipo:"gm_desbloquear_plantilla"}));

// GM: enemigo
btnAñadirEnemigo.addEventListener("click",()=>{
  enviar({tipo:"gm_añadir_token",nombre:gmEnNombre.value.trim()||"Goblin",
          hp:parseInt(gmEnHp.value)||30,color:gmEnColor.value,
          x:Math.round(canvas?.width/2||400)+(Math.random()-.5)*300|0,
          y:Math.round(canvas?.height/2||300)+(Math.random()-.5)*200|0});
  gmEnNombre.value="";
});

// GM: combate
btnIniciarCombate.addEventListener("click",()=>enviar({tipo:"gm_iniciar_combate"}));
btnTerminarCombate.addEventListener("click",()=>enviar({tipo:"gm_terminar_combate"}));
btnSigTurno.addEventListener("click",()=>enviar({tipo:"gm_siguiente_turno"}));

// GM: token seleccionado
function mostrarGMSel(tid){
  const t=tokens[tid]; if(!t) return;
  gmSelNombre.textContent=t.personaje||tid;
  gmSelHp.value=t.stats?.HP??0;
  gmSelMp.value=t.stats?.MP??0;
  gmSelVacio.style.display="none";
  gmSelControles.classList.remove("oculto");
  // Ir al panel GM
  cambiarTab("gm");
}
function ocultarGMSel(){ gmSelVacio.style.display=""; gmSelControles.classList.add("oculto"); }

btnAplicarGmToken.addEventListener("click",()=>{
  if(!tokenSeleccionado) return;
  enviar({tipo:"gm_editar_token",token_id:tokenSeleccionado,
          stats:{HP:parseInt(gmSelHp.value),MP:parseInt(gmSelMp.value)}});
});
btnBorrarGmToken.addEventListener("click",()=>{
  if(!tokenSeleccionado) return;
  if(confirm(`¿Borrar token "${tokens[tokenSeleccionado]?.personaje||tokenSeleccionado}"?`)){
    enviar({tipo:"gm_borrar_token",token_id:tokenSeleccionado});
    ocultarGMSel();
  }
});

// GM: mapa de fondo
function renderGMMapaLista(){
  const listaEl=$("mapa-lista");
  const vacioEl=$("mapa-vacio");
  if(!listaEl) return;
  let archivos=[];
  try {
    if(fs.existsSync(MAPS_DIR)){
      archivos=fs.readdirSync(MAPS_DIR).filter(f=>/\.(png|jpg|jpeg|webp)$/i.test(f));
    }
  } catch(e){}
  listaEl.innerHTML="";
  if(!archivos.length){ vacioEl.classList.remove("oculto"); return; }
  vacioEl.classList.add("oculto");
  archivos.forEach(f=>{
    const div=document.createElement("div");
    div.className=`mapa-item${mapaActivo===f?" activo":""}`;
    div.textContent=f;
    div.addEventListener("click",()=>enviar({tipo:"gm_set_mapa",archivo:f}));
    listaEl.appendChild(div);
  });
}

$("btn-quitar-mapa").addEventListener("click",()=>enviar({tipo:"gm_set_mapa",archivo:null}));

// Cargar lista de mapas cuando el GM abre el panel GM
document.querySelector('[data-panel="gm"]').addEventListener("click",()=>{
  if(esGM) renderGMMapaLista();
});

// GM: habilidades globales — ventana flotante
let ghFlotanteEditando = null; // nombre original si está editando

function abrirGestionHabilidades(){
  const WIN_ID = "gestion-habilidades-flotante";
  const existente = document.getElementById(WIN_ID);
  if(existente){ existente.style.zIndex=++fichaZIndex; return; }

  const modal = document.createElement("div");
  modal.id = WIN_ID;
  modal.className = "ficha-flotante";
  modal.style.cssText = `position:fixed;top:80px;left:${200+Math.random()*60|0}px;z-index:${++fichaZIndex};width:450px;`;

  modal.innerHTML = `
    <div class="ficha-flotante-header">
      <span class="ff-titulo">⚡ Gestionar Habilidades</span>
      <button class="btn-icono ff-cerrar">✕</button>
    </div>
    <div class="ficha-flotante-body" style="padding:12px;overflow-y:auto;max-height:75vh;">
      <div class="cmd-seccion-titulo" style="margin-bottom:8px">Habilidades Globales</div>
      <div id="ghf-lista-global"></div>
      <div class="cmd-seccion-titulo" style="margin-top:14px;margin-bottom:8px" id="ghf-form-titulo">Crear Habilidad</div>
      <div class="gm-form" style="display:block;">
        <input class="gm-input" id="ghf-nombre" placeholder="Nombre (ej: Golpe Fuerte)"/>
        <input class="gm-input" id="ghf-formula" placeholder="Fórmula (ej: Fuerza/4 + 1d20)" value="Fuerza/4 + 1d20"/>
        <input class="gm-input" id="ghf-stat-base" placeholder="Stat base (ej: Fuerza)"/>
        <textarea class="gm-input" id="ghf-desc" placeholder="Descripción" rows="2" style="resize:vertical"></textarea>
        <div class="gm-fila">
          <button class="cmd-btn verde" id="ghf-ok">✓ Crear habilidad</button>
          <button class="cmd-btn" id="ghf-cancelar">✕ Cancelar</button>
        </div>
      </div>
    </div>`;

  modal.querySelector(".ff-cerrar").addEventListener("click",()=>{
    modal.remove();
    ghFlotanteEditando = null;
  });

  // Traer al frente al hacer clic
  modal.addEventListener("mousedown",()=>{ modal.style.zIndex=++fichaZIndex; });

  // Arrastrar
  hacerArrastrable(modal, modal.querySelector(".ficha-flotante-header"));

  // Botón Crear/Guardar
  modal.querySelector("#ghf-ok").addEventListener("click",()=>{
    const nom = modal.querySelector("#ghf-nombre").value.trim();
    if(!nom){ alert("Escribe un nombre."); return; }
    const hab = {
      nombre:      nom,
      formula:     modal.querySelector("#ghf-formula").value.trim() || "Fuerza/4 + 1d20",
      stat_base:   modal.querySelector("#ghf-stat-base").value.trim() || "",
      descripcion: modal.querySelector("#ghf-desc").value.trim() || "",
    };
    if(ghFlotanteEditando !== null){
      enviar({tipo:"gm_editar_habilidad", nombre_original: ghFlotanteEditando, habilidad: hab});
    } else {
      enviar({tipo:"gm_crear_habilidad", habilidad: hab});
    }
    limpiarFormGHF(modal);
  });

  // Botón Cancelar edición
  modal.querySelector("#ghf-cancelar").addEventListener("click",()=>limpiarFormGHF(modal));

  document.body.appendChild(modal);
  renderGHFLista(modal);
}

function limpiarFormGHF(modal){
  ghFlotanteEditando = null;
  modal.querySelector("#ghf-nombre").value = "";
  modal.querySelector("#ghf-formula").value = "Fuerza/4 + 1d20";
  modal.querySelector("#ghf-stat-base").value = "";
  modal.querySelector("#ghf-desc").value = "";
  modal.querySelector("#ghf-form-titulo").textContent = "Crear Habilidad";
  modal.querySelector("#ghf-ok").textContent = "✓ Crear habilidad";
}

function renderGHFLista(modal){
  if(!modal) modal = document.getElementById("gestion-habilidades-flotante");
  if(!modal) return;
  const listaEl = modal.querySelector("#ghf-lista-global");
  listaEl.innerHTML = "";
  if(!habilidadesGlobales.length){
    listaEl.innerHTML = `<div class="cmd-vacio">Sin habilidades globales</div>`;
    return;
  }
  habilidadesGlobales.forEach(h=>{
    const row = document.createElement("div"); row.className = "ghf-hab-row";
    row.innerHTML = `
      <div class="ghf-hab-info">
        <div class="ghf-hab-nombre">${esc(h.nombre)}</div>
        <div class="ghf-hab-detalle">📐 ${esc(h.formula)}${h.stat_base ? ` · ${esc(h.stat_base)}` : ""}${h.descripcion ? ` — ${esc(h.descripcion)}` : ""}</div>
      </div>
      <div class="ghf-hab-acciones"></div>`;
    const acciones = row.querySelector(".ghf-hab-acciones");
    if(h.nombre !== "Ataque"){
      const btnEdit = document.createElement("button"); btnEdit.className = "cmd-btn"; btnEdit.style.fontSize="11px"; btnEdit.style.padding="3px 7px"; btnEdit.textContent = "✏️ Editar";
      btnEdit.addEventListener("click",()=>{
        ghFlotanteEditando = h.nombre;
        modal.querySelector("#ghf-nombre").value = h.nombre;
        modal.querySelector("#ghf-formula").value = h.formula;
        modal.querySelector("#ghf-stat-base").value = h.stat_base || "";
        modal.querySelector("#ghf-desc").value = h.descripcion || "";
        modal.querySelector("#ghf-form-titulo").textContent = `Editar: ${h.nombre}`;
        modal.querySelector("#ghf-ok").textContent = "✓ Guardar cambios";
        modal.querySelector("#ghf-nombre").focus();
      });
      const btnDel = document.createElement("button"); btnDel.className = "gm-stat-del"; btnDel.textContent = "✕";
      btnDel.title = "Eliminar habilidad global";
      btnDel.addEventListener("click",()=>{
        if(confirm(`¿Eliminar la habilidad "${h.nombre}"?`))
          enviar({tipo:"gm_borrar_habilidad", nombre_habilidad: h.nombre});
      });
      acciones.appendChild(btnEdit);
      acciones.appendChild(btnDel);
    }
    listaEl.appendChild(row);
  });
}

// Actualizar lista cuando cambian las habilidades globales
function renderGMHabilidades(){
  renderGHFLista(null);
}

$("btn-abrir-gestion-habilidades") && $("btn-abrir-gestion-habilidades").addEventListener("click", abrirGestionHabilidades);

// ─────────────────────────────────────────────────────────────────
// UI COMBATE
// ─────────────────────────────────────────────────────────────────
function actualizarUI(){
  btnIniciarCombate.classList.toggle("oculto",combateActivo);
  btnTerminarCombate.classList.toggle("oculto",!combateActivo);
  btnSigTurno.classList.toggle("oculto",!combateActivo);
  tbTurno.classList.toggle("oculto",!combateActivo);
  if(combateActivo&&turno.length){
    const nom=tokens[turno[turnoActual]]?.personaje||turno[turnoActual];
    tbTurno.textContent=`⚔️ Turno de ${nom}`;
  }
}

// ─────────────────────────────────────────────────────────────────
// SISTEMA DE LOGS LOCALES
// ─────────────────────────────────────────────────────────────────
function escribirLog(autor, texto){
  try {
    if(!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR,{recursive:true});
    const ahora=new Date();
    const fechaStr=ahora.toISOString().slice(0,10);
    const horaStr=ahora.toTimeString().slice(0,8);
    const nomCamp=campanaActual?.nombre||"local";
    const archivo=path.join(LOGS_DIR,`${nomCamp}_${fechaStr}.log`);
    fs.appendFileSync(archivo,`[${horaStr}] ${autor}: ${texto}\n`,"utf8");
  } catch(e){ console.warn("Error escribiendo log:",e.message); }
}

// ─────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────
function agregarChat(autor,texto,tipo="normal"){
  const div=document.createElement("div"); div.className="msg";
  if(tipo==="sistema"){
    div.classList.add("msg-sistema"); div.textContent=texto;
  } else if(tipo==="dado"){
    div.classList.add("msg-dado");
    div.innerHTML=`<div class="msg-autor">${autor}</div><div>${texto.replace(/\*\*/g,"")}</div>`;
  } else if(tipo==="combate"){
    div.classList.add("msg-combate"); div.textContent=texto;
  } else {
    div.classList.add("msg-normal");
    const a=document.createElement("div");a.className="msg-autor";
    a.textContent=autor; a.style.color=Object.values(tokens).find(t=>t.owner===autor)?.color||"#c0392b";
    const t=document.createElement("div");t.textContent=texto;
    div.appendChild(a);div.appendChild(t);
  }
  $("chat-msgs").appendChild(div);
  $("chat-msgs").scrollTop=$("chat-msgs").scrollHeight;
  escribirLog(autor, texto);
}

function enviarChat(){
  const txt=$("chat-input").value.trim(); if(!txt) return;
  enviar({tipo:"chat",texto:txt}); $("chat-input").value="";
}
$("chat-enviar").addEventListener("click",enviarChat);
$("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter")enviarChat();});

// ─────────────────────────────────────────────────────────────────
// OVERLAY DE DADO EN MAPA
// ─────────────────────────────────────────────────────────────────
let overlayTimeout=null;
function mostrarOverlayDado(autor, resultado, color){
  const overlay=$("dado-overlay");
  const nomEl=$("dado-overlay-nombre");
  const resEl=$("dado-overlay-resultado");
  if(!overlay) return;

  nomEl.textContent=autor;
  resEl.textContent=resultado;
  resEl.style.textShadow=`0 0 20px ${color}, 0 0 40px ${color}`;
  nomEl.style.color=color;

  overlay.style.opacity="1";
  overlay.style.transform="scale(1)";
  overlay.classList.remove("oculto");

  if(overlayTimeout) clearTimeout(overlayTimeout);
  overlayTimeout=setTimeout(()=>{
    overlay.style.opacity="0";
    overlay.style.transform="scale(1.15)";
    setTimeout(()=>overlay.classList.add("oculto"), 500);
  }, 2000);
}

// ─────────────────────────────────────────────────────────────────
// DADOS (panel)
// ─────────────────────────────────────────────────────────────────
dadoBtns.forEach(btn=>{
  btn.addEventListener("click",()=>{
    const dado=btn.dataset.dado;
    enviar({tipo:"chat",texto:`/${dado}`});
  });
});
btnDadoCustom.addEventListener("click",()=>{
  const cant=dadoCustomCant.value||1, caras=dadoCustomCar.value||20;
  enviar({tipo:"chat",texto:`/${cant}d${caras}`});
});

// ─────────────────────────────────────────────────────────────────
// MÚSICA (Rocola)
// ─────────────────────────────────────────────────────────────────
function cargarMusica(){
  musicaLista=[];
  try {
    if(fs.existsSync(MUSIC_DIR)){
      const archivos=fs.readdirSync(MUSIC_DIR).filter(f=>/\.(mp3|ogg|wav|flac)$/i.test(f));
      musicaLista=archivos.map(f=>({nombre:f,ruta:path.join(MUSIC_DIR,f)}));
    }
  } catch(e){}
  renderMusicaLista();
}

function renderMusicaLista(){
  musicaListaEl.innerHTML="";
  if(!musicaLista.length){musicaVacioEl.classList.remove("oculto");return;}
  musicaVacioEl.classList.add("oculto");
  musicaLista.forEach((m,i)=>{
    const div=document.createElement("div"); div.className=`musica-item${i===musicaIndice&&musicaReproduciendo?" activo":""}`;
    div.innerHTML=`<span class="musica-item-ico">🎵</span>${m.nombre}`;
    div.addEventListener("dblclick",()=>{
      if(esGM){
        // El GM sincroniza la música con todos los clientes
        enviar({tipo:"gm_cambiar_musica",archivo:m.nombre});
      } else {
        reproducirMusica(i);
      }
    });
    musicaListaEl.appendChild(div);
  });
}

// Manejar música sincronizada desde el GM
function manejarMusicaCambiada(archivo){
  if(!archivo){
    detenerMusica();
    agregarChat("Sistema","🎵 El GM detuvo la música.","sistema");
    return;
  }
  const entry=musicaLista.find(m=>m.nombre===archivo);
  if(entry){
    const idx=musicaLista.indexOf(entry);
    reproducirMusica(idx);
  } else {
    detenerMusica();
    agregarChat("Sistema",`🎵 No tienes el archivo: ${archivo}`,"sistema");
  }
}

function reproducirMusica(idx){
  if(!musicaLista.length) return;
  musicaIndice=idx;
  const ruta=musicaLista[idx].ruta;

  if(!audioCtx) audioCtx=new AudioContext();

  // Crossfade: fade out old source while loading new one
  const oldSource=audioSource;
  const oldGain=audioGain;
  if(oldSource && oldGain){
    const now=audioCtx.currentTime;
    oldGain.gain.cancelScheduledValues(now);
    oldGain.gain.setValueAtTime(oldGain.gain.value, now);
    oldGain.gain.linearRampToValueAtTime(0, now+1.5);
    setTimeout(()=>{ try{ oldSource.stop(); }catch(e){} }, 1600);
  }
  audioSource=null;

  // New gain node with fade-in
  audioGain=audioCtx.createGain();
  audioGain.gain.setValueAtTime(0, audioCtx.currentTime);
  audioGain.gain.linearRampToValueAtTime(targetVol, audioCtx.currentTime+1.5);
  audioGain.connect(audioCtx.destination);

  fs.readFile(ruta,(err,buf)=>{
    if(err) return;
    audioCtx.decodeAudioData(buf.buffer,(decoded)=>{
      audioSource=audioCtx.createBufferSource();
      audioSource.buffer=decoded;
      audioSource.loop=musicaLoop;
      audioSource.connect(audioGain);
      audioSource.start();
      audioSource.onended=()=>{
        if(musicaLoop) return;
        musicaIndice=(musicaIndice+1)%musicaLista.length;
        reproducirMusica(musicaIndice);
      };
      musicaReproduciendo=true;
      musicaNombreEl.textContent=musicaLista[idx].nombre;
      btnPlay.textContent="⏸";
      renderMusicaLista();
    });
  });
}

function detenerMusica(){
  if(audioSource&&audioGain){
    audioGain.gain.linearRampToValueAtTime(0,audioCtx.currentTime+1);
    setTimeout(()=>{if(audioSource){audioSource.stop();audioSource=null;}},1100);
  }
  musicaReproduciendo=false; btnPlay.textContent="▶";
  renderMusicaLista();
}

btnPlay.addEventListener("click",()=>{
  if(musicaReproduciendo) detenerMusica();
  else reproducirMusica(musicaIndice);
});
btnNext.addEventListener("click",()=>{ musicaIndice=(musicaIndice+1)%musicaLista.length; reproducirMusica(musicaIndice); });
btnPrev.addEventListener("click",()=>{ musicaIndice=(musicaIndice-1+musicaLista.length)%musicaLista.length; reproducirMusica(musicaIndice); });
btnLoop.addEventListener("click",()=>{
  musicaLoop=!musicaLoop;
  if(audioSource) audioSource.loop=musicaLoop;
  btnLoop.classList.toggle("activo",musicaLoop);
});
volMusica.addEventListener("input",()=>{
  targetVol=volMusica.value/100;
  volMusicaTxt.textContent=volMusica.value+"%";
  if(audioGain) audioGain.gain.setValueAtTime(targetVol,audioCtx.currentTime);
});
volSfx.addEventListener("input",()=>{
  targetVolSfx=volSfx.value/100;
  volSfxTxt.textContent=volSfx.value+"%";
  // SFX volume stored for future use when SFX are implemented
});

// ─────────────────────────────────────────────────────────────────
// TABS PANEL COMANDOS
// ─────────────────────────────────────────────────────────────────
function cambiarTab(panelId){
  cmdTabs.forEach(t=>t.classList.toggle("activo",t.dataset.panel===panelId));
  cmdPaneles.forEach(p=>p.classList.toggle("oculto",p.id!==`panel-${panelId}`));
  // Al abrir el panel de habilidades, renderizar con el personaje activo
  if(panelId === "habilidades"){
    if(personajeActivo){
      renderHabilidades(personajeActivo);
    } else {
      listaHabilidades.innerHTML = "";
      habilidadesSinPersonaje.classList.remove("oculto");
    }
  }
}
cmdTabs.forEach(tab=>{
  tab.addEventListener("click",()=>cambiarTab(tab.dataset.panel));
});

// ─────────────────────────────────────────────────────────────────
// VOLVER AL INICIO
// ─────────────────────────────────────────────────────────────────
btnVolverIni.addEventListener("click",()=>{
  if(ws){ws.close();ws=null;}
  detenerMusica();
  sala.classList.add("oculto");
  pInicio.classList.remove("oculto");
  tokens={}; misPersonajes=[]; personajeActivo=null; tokenSeleccionado=null;
  mapaActivo=null; mapaImg=null;
  tbRol.classList.add("oculto");
  // Nota: la sesión se mantiene para autologin (no la borramos aquí)
});

// ─────────────────────────────────────────────────────────────────
// ERRORES
// ─────────────────────────────────────────────────────────────────
function mostrarErrorUnion(txt){
  unionError.textContent=txt; unionError.classList.remove("oculto");
  setTimeout(()=>unionError.classList.add("oculto"),4000);
}

// ─────────────────────────────────────────────────────────────────
// TECLA ESCAPE — cierra modales/menús en orden de prioridad
// ─────────────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  // Suprimir (Delete) — retirar token propio seleccionado del mapa
  if (e.key === "Delete" || e.key === "Supr") {
    // No actuar si el foco está en un input o textarea
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (tokenSeleccionado && tokens[tokenSeleccionado]) {
      const t = tokens[tokenSeleccionado];
      if (t.owner === miNombre) {
        retirarTokenPropio(tokenSeleccionado);
        tokenSeleccionado = null;
        ocultarGMSel();
        dibujar();
      }
    }
    return;
  }

  if (e.key !== "Escape") return;

  // 1. Menú contextual
  if (!ctxMenu.classList.contains("oculto")) {
    ctxMenu.classList.add("oculto");
    $("ctx-submenu").classList.add("oculto");
    return;
  }
  // 2. Modal de ataque
  if (!modalAtaque.classList.contains("oculto")) {
    modalAtaque.classList.add("oculto");
    return;
  }
  // 3. Modal de estado
  if (!modalEstado.classList.contains("oculto")) {
    modalEstado.classList.add("oculto");
    return;
  }
  // 4. Modal de personaje
  if (!modalPersonaje.classList.contains("oculto")) {
    modalPersonaje.classList.add("oculto");
    return;
  }
  // 5. Ficha flotante más reciente (mayor z-index)
  const fichas = Array.from(document.querySelectorAll(".ficha-flotante"));
  if (fichas.length) {
    const fichasConZ = fichas.map(f => ({ el: f, z: parseInt(f.style.zIndex) || 0 }));
    fichasConZ.reduce((a, b) => a.z >= b.z ? a : b).el.remove();
  }
});

// ─────────────────────────────────────────────────────────────────
// DRAG & DROP — personajes desde lista al canvas del mapa
// ─────────────────────────────────────────────────────────────────
let dragPersonajeNombre = null;

function habilitarDragPersonajes() {
  listaMisPersonajes.querySelectorAll(".personaje-item").forEach(div => {
    div.setAttribute("draggable", "true");
    div.addEventListener("dragstart", e => {
      dragPersonajeNombre = div.dataset.nombrePersonaje || null;
      if (dragPersonajeNombre) {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", dragPersonajeNombre);
        div.classList.add("drag-activo");
      }
    });
    div.addEventListener("dragend", () => {
      div.classList.remove("drag-activo");
      dragPersonajeNombre = null;
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// MAPA DE FONDO
// ─────────────────────────────────────────────────────────────────
function cargarImagenMapa(archivo){
  if(!archivo){ mapaImg=null; dibujar(); return; }
  const ruta=path.join(MAPS_DIR, archivo);
  if(fs.existsSync(ruta)){
    const img=new Image();
    img.onload=()=>{ mapaImg=img; dibujar(); };
    img.onerror=()=>{ mapaImg=null; dibujar(); };
    img.src=ruta;
  } else {
    mapaImg=null; dibujar();
  }
}
