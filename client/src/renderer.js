"use strict";
// ── Node.js modules (disponibles en Electron con nodeIntegration) ──
const path = require("path");
const fs   = require("fs");

const WS_URL      = "ws://localhost:8765";
const RESOURCES   = path.join(__dirname, "..", "..", "resources");
const MUSIC_DIR   = path.join(RESOURCES, "music");
const TOKENS_DIR  = path.join(RESOURCES, "characters", "tokens");

// ── Estado local ─────────────────────────────────────────────────
let ws, miNombre = "", esGM = false;
let tokens = {}, plantilla = [], plantillasGuardadas = {}, plantillaBloqueada = false;
let turno = [], turnoActual = 0, combateActivo = false;
let misPersonajes = [];
let personajeActivo = null;   // objeto personaje seleccionado
let tokenSeleccionado = null; // token_id seleccionado en tablero
let modoEdicion = "crear";    // "crear" | "editar"
let tokenAtacanteId = null;
let tokenDefensorId = null;
let campanaActual = null;

// ── Audio ─────────────────────────────────────────────────────────
let audioCtx = null, audioSource = null, audioGain = null;
let musicaLista = [], musicaIndice = 0, musicaLoop = true, musicaReproduciendo = false;
let targetVol = 0.7;

// ── DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

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
const btnDesplegarToken  = $("btn-desplegar-token");
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
const maHabilidades     = $("ma-habilidades");
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

      tbNombre.textContent  = miNombre;
      tbCampana.textContent = campanaActual?.nombre || "local";
      if (esGM) { tbRol.classList.remove("oculto"); }
      document.querySelectorAll(".gm-only").forEach(el => {
        if(esGM) el.classList.remove("oculto");
      });

      msg.mensajes.forEach(m => agregarChat(m.autor, m.texto));
      pInicio.classList.add("oculto");
      sala.classList.remove("oculto");
      panelUnion.classList.add("oculto");

      iniciarCanvas();
      cargarMusica();
      actualizarUI();
      renderMisPersonajes();
      renderGMPlantilla();
      renderGMPlantillasGuardadas();
      break;

    case "modo_cambiado":
      esGM = msg.es_gm;
      if(esGM){
        tbRol.classList.remove("oculto");
        document.querySelectorAll(".gm-only").forEach(el => el.classList.remove("oculto"));
        plantilla           = msg.plantilla            || plantilla;
        plantillasGuardadas = msg.plantillas_guardadas || plantillasGuardadas;
        plantillaBloqueada  = msg.plantilla_bloqueada  || false;
        renderGMPlantilla(); renderGMPlantillasGuardadas();
      } else {
        tbRol.classList.add("oculto");
        document.querySelectorAll(".gm-only").forEach(el => el.classList.add("oculto"));
      }
      break;

    case "personaje_creado":
    case "personaje_actualizado":
      misPersonajes = msg.personajes || [];
      renderMisPersonajes();
      if(msg.personaje && personajeActivo?.nombre === msg.personaje.nombre){
        personajeActivo = msg.personaje;
        mostrarFichaPersonaje(personajeActivo);
      }
      break;

    case "lista_personajes":
      misPersonajes = msg.personajes || [];
      renderMisPersonajes();
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
      dibujar(); break;

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
  document.addEventListener("click", () => ctxMenu.classList.add("oculto"));
}

function ajustar() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width=r.width; canvas.height=r.height; dibujar();
}

function dibujar() {
  if(!ctx) return;
  const W=canvas.width, H=canvas.height;
  ctx.fillStyle="#0d0d1a"; ctx.fillRect(0,0,W,H);
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
    // Click en vacío
    tokenSeleccionado=null; ocultarGMSel(); dibujar();
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
  const tid=tokenBajo(e.clientX,e.clientY);
  if(!tid){ ctxMenu.classList.add("oculto"); return; }
  const t=tokens[tid];
  const esMio=t.owner===miNombre;

  ctxItems.innerHTML="";
  if(esMio){
    agregarCtxItem("👤 Ver datos",()=>abrirFichaToken(tid));
    agregarCtxItem("💊 Modificar estado",()=>abrirModificarEstadoToken(tid));
  } else {
    // Token enemigo u otro jugador: mostrar solo info visible
    agregarCtxItem("🔍 Ver datos",()=>abrirFichaTokenVisible(tid));
    if(combateActivo){
      agregarCtxSep();
      agregarCtxItem("⚔️ Atacar",()=>abrirModalAtaque(tid),"peligro");
    }
  }
  if(esGM){
    agregarCtxSep();
    agregarCtxItem("✏️ Editar (GM)",()=>mostrarGMSel(tid));
    agregarCtxItem("🗑️ Borrar (GM)",()=>{
      if(confirm(`¿Borrar "${t.personaje||tid}"?`)) enviar({tipo:"gm_borrar_token",token_id:tid});
    },"peligro");
  }

  ctxMenu.style.left=`${Math.min(e.clientX, window.innerWidth-200)}px`;
  ctxMenu.style.top =`${Math.min(e.clientY, window.innerHeight-200)}px`;
  ctxMenu.classList.remove("oculto");
  e.stopPropagation();
}

function agregarCtxItem(label,fn,cls=""){
  const div=document.createElement("div"); div.className=`ctx-item ${cls}`;
  div.textContent=label; div.addEventListener("click",()=>{fn();ctxMenu.classList.add("oculto");});
  ctxItems.appendChild(div);
}
function agregarCtxSep(){
  const sep=document.createElement("div"); sep.className="ctx-sep"; ctxItems.appendChild(sep);
}

// Ver datos completos del token propio
function abrirFichaToken(tid){
  const t=tokens[tid];
  // Aquí se podría abrir un modal con todos los datos
  // Por ahora mostramos en el panel izquierdo si el personaje coincide
  const p=misPersonajes.find(x=>x.nombre===t.personaje);
  if(p){ personajeActivo=p; mostrarFichaPersonaje(p); cambiarTab("personajes"); }
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
  maHabilidades.innerHTML="";
  habs.forEach(h=>{
    const btn=document.createElement("button"); btn.className="ataque-btn";
    btn.innerHTML=`<div class="ataque-btn-nombre">${h.nombre}</div>
                   <div class="ataque-btn-formula">${h.formula}</div>`;
    btn.addEventListener("click",()=>{
      enviar({tipo:"atacar",token_atacante:tokenAtacanteId,
              token_defensor:tidDefensor,habilidad:h.nombre});
      modalAtaque.classList.add("oculto");
    });
    maHabilidades.appendChild(btn);
  });
  modalAtaque.classList.remove("oculto");
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
    div.innerHTML=`<div class="pers-dot" style="background:${p.color}"></div>
      <div class="flex1">
        <div class="pers-nombre">${p.nombre}</div>
        <div class="pers-clase">${p.clase||"Aventurero"}</div>
      </div>`;
    div.addEventListener("click",()=>{
      personajeActivo=p; renderMisPersonajes(); mostrarFichaPersonaje(p); renderHabilidades(p);
    });
    listaMisPersonajes.appendChild(div);
  });
}

function mostrarFichaPersonaje(p){
  if(!p) return;
  fpDot.style.background=p.color;
  fpNombre.textContent=p.nombre;
  fpClase.textContent=p.clase||"Aventurero";

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

// Desplegar token
btnDesplegarToken.addEventListener("click",()=>{
  if(!personajeActivo) return;
  const cx=canvas?.width/2||400, cy=canvas?.height/2||300;
  enviar({tipo:"desplegar_token",nombre_personaje:personajeActivo.nombre,
          x:Math.round(cx+(Math.random()-.5)*200),y:Math.round(cy+(Math.random()-.5)*150)});
  agregarChat("Sistema",`Token de ${personajeActivo.nombre} desplegado en el mapa.`,"sistema");
});

// Modificar estado (desde botón panel)
btnModEstado.addEventListener("click",()=>{
  if(!personajeActivo) return;
  // Buscar token del personaje activo
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
}

function enviarChat(){
  const txt=$("chat-input").value.trim(); if(!txt) return;
  enviar({tipo:"chat",texto:txt}); $("chat-input").value="";
}
$("chat-enviar").addEventListener("click",enviarChat);
$("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter")enviarChat();});

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
    div.addEventListener("dblclick",()=>reproducirMusica(i));
    musicaListaEl.appendChild(div);
  });
}

function reproducirMusica(idx){
  if(!musicaLista.length) return;
  musicaIndice=idx;
  const ruta=musicaLista[idx].ruta;

  if(!audioCtx) audioCtx=new AudioContext();
  if(audioSource){ audioSource.stop(); audioSource=null; }

  // Fade in
  audioGain=audioCtx.createGain();
  audioGain.gain.setValueAtTime(0,audioCtx.currentTime);
  audioGain.gain.linearRampToValueAtTime(targetVol,audioCtx.currentTime+1.5);
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

// ─────────────────────────────────────────────────────────────────
// TABS PANEL COMANDOS
// ─────────────────────────────────────────────────────────────────
function cambiarTab(panelId){
  cmdTabs.forEach(t=>t.classList.toggle("activo",t.dataset.panel===panelId));
  cmdPaneles.forEach(p=>p.classList.toggle("oculto",p.id!==`panel-${panelId}`));
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
  tbRol.classList.add("oculto");
});

// ─────────────────────────────────────────────────────────────────
// ERRORES
// ─────────────────────────────────────────────────────────────────
function mostrarErrorUnion(txt){
  unionError.textContent=txt; unionError.classList.remove("oculto");
  setTimeout(()=>unionError.classList.add("oculto"),4000);
}
