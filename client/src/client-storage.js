"use strict";
/**
 * client-storage.js — Módulo de persistencia local del cliente
 *
 * Guarda y lee datos en client/data/ usando archivos YAML.
 * Permite autologin y acceso offline a personajes.
 *
 * Se carga como <script> en index.html antes de renderer.js.
 * Expone window.ClientStorage para que renderer.js lo use.
 */

// Usamos una función inmediata para que las variables no contaminen
// el scope global, pero sí exponemos ClientStorage en window.
(function() {

  // Accedemos a path y fs dentro de funciones, no en el nivel raíz,
  // para evitar problemas de inicialización en Electron.
  function _path() { return require("path"); }
  function _fs()   { return require("fs");   }

  // ── Rutas ──────────────────────────────────────────────────────
  function _dataDir() {
    // __dirname apunta a client/src/, subimos un nivel a client/data/
    return _path().join(__dirname, "..", "data");
  }
  function _userFile()       { return _path().join(_dataDir(), "user.yaml"); }
  function _charactersFile() { return _path().join(_dataDir(), "characters.yaml"); }

  // ── Helpers YAML ───────────────────────────────────────────────
  function _leer(ruta) {
    try {
      const fs = _fs();
      if (!fs.existsSync(ruta)) return {};
      const texto = fs.readFileSync(ruta, "utf8");
      // jsyaml se carga desde CDN en index.html — está disponible aquí
      if (typeof jsyaml !== "undefined") return jsyaml.load(texto) || {};
      return JSON.parse(texto);
    } catch(e) {
      console.warn("[ClientStorage] Error leyendo", ruta, e.message);
      return {};
    }
  }

  function _escribir(ruta, datos) {
    try {
      const fs   = _fs();
      const path = _path();
      const dir  = path.dirname(ruta);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let texto;
      if (typeof jsyaml !== "undefined") {
        texto = jsyaml.dump(datos, { allowUnicode: true, lineWidth: -1 });
      } else {
        texto = JSON.stringify(datos, null, 2);
      }
      fs.writeFileSync(ruta, texto, "utf8");
    } catch(e) {
      console.warn("[ClientStorage] Error escribiendo", ruta, e.message);
    }
  }

  // ── API pública ─────────────────────────────────────────────────

  /**
   * Carga la sesión guardada.
   * @returns {{ username: string, ultima_campana: string } | null}
   */
  function cargarSesion() {
    const datos = _leer(_userFile());
    const u = datos?.usuario;
    if (u?.username) return u;
    return null;
  }

  /**
   * Guarda el nombre de usuario para autologin.
   */
  function guardarSesion(username, ultimaCampana = "local") {
    _escribir(_userFile(), {
      usuario: { username, ultima_campana: ultimaCampana }
    });
  }

  /**
   * Borra la sesión guardada.
   */
  function borrarSesion() {
    _escribir(_userFile(), { usuario: { username: "", ultima_campana: "local" } });
  }

  /**
   * Carga los personajes guardados localmente (caché offline).
   * @returns {{ ultima_sync: string|null, personajes: Array }}
   */
  function cargarPersonajesLocales() {
    const datos = _leer(_charactersFile());
    return {
      ultima_sync: datos?.ultima_sync || null,
      personajes:  datos?.personajes  || [],
    };
  }

  /**
   * Guarda la lista de personajes localmente.
   */
  function guardarPersonajesLocales(personajes) {
    _escribir(_charactersFile(), {
      ultima_sync: new Date().toISOString(),
      personajes,
    });
  }

  // ── Exponer en window para que renderer.js lo use ───────────────
  window.ClientStorage = {
    cargarSesion,
    guardarSesion,
    borrarSesion,
    cargarPersonajesLocales,
    guardarPersonajesLocales,
  };

})();
