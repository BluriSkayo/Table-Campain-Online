"""
storage.py — Módulo de persistencia
Cada función lee o escribe un único archivo YAML.
El servidor llama a estas funciones; nunca toca los archivos directamente.
"""

import yaml
import os
import copy

# Directorio donde viven los archivos YAML del servidor
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# ── Helpers internos ─────────────────────────────────────────────

def _ruta(nombre_archivo: str) -> str:
    """Devuelve la ruta completa a un archivo dentro de data/."""
    return os.path.join(DATA_DIR, nombre_archivo)

def _leer(nombre_archivo: str) -> dict:
    """Lee un archivo YAML y devuelve su contenido como dict.
    Si el archivo no existe o está vacío, devuelve {}."""
    ruta = _ruta(nombre_archivo)
    if not os.path.exists(ruta):
        return {}
    with open(ruta, "r", encoding="utf-8") as f:
        datos = yaml.safe_load(f)
        return datos if datos else {}

def _escribir(nombre_archivo: str, datos: dict):
    """Escribe un dict en un archivo YAML.
    Usa deepcopy para evitar anclas YAML (&id001 / *id001)."""
    ruta = _ruta(nombre_archivo)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        yaml.dump(copy.deepcopy(datos), f, allow_unicode=True, default_flow_style=False)

# ── config.yaml ──────────────────────────────────────────────────

def leer_config() -> dict:
    datos = _leer("config.yaml")
    # Valores por defecto si el archivo está vacío o incompleto
    datos.setdefault("servidor", {})
    datos["servidor"].setdefault("host", "localhost")
    datos["servidor"].setdefault("port", 8765)
    datos["servidor"].setdefault("gm_password", "gm1234")
    datos.setdefault("juego", {})
    datos["juego"].setdefault("max_mensajes", 100)
    datos["juego"].setdefault("colores_default", [
        "#3498db","#2ecc71","#f39c12","#9b59b6",
        "#1abc9c","#e67e22","#e91e63","#e74c3c"
    ])
    return datos

# ── users.yaml ───────────────────────────────────────────────────

def leer_usuarios() -> dict:
    datos = _leer("users.yaml")
    datos.setdefault("usuarios", {})
    return datos["usuarios"]

def guardar_usuarios(usuarios: dict):
    _escribir("users.yaml", {"usuarios": usuarios})

def registrar_usuario(username: str, ultima_campana: str = "local"):
    """Crea o actualiza un usuario. Devuelve el dict del usuario."""
    usuarios = leer_usuarios()
    if username not in usuarios:
        usuarios[username] = {
            "username":        username,
            "ultima_campana":  ultima_campana,
            "personajes":      [],
        }
    else:
        usuarios[username]["ultima_campana"] = ultima_campana
    guardar_usuarios(usuarios)
    return usuarios[username]

def actualizar_personajes_usuario(username: str, nombres_personajes: list):
    """Actualiza la lista de nombres de personajes del usuario."""
    usuarios = leer_usuarios()
    if username in usuarios:
        usuarios[username]["personajes"] = nombres_personajes
        guardar_usuarios(usuarios)

# ── characters.yaml ──────────────────────────────────────────────

def leer_personajes_todos() -> dict:
    """Devuelve {username: [lista_personajes]}."""
    datos = _leer("characters.yaml")
    datos.setdefault("personajes", {})
    return datos["personajes"]

def leer_personajes_usuario(username: str) -> list:
    """Devuelve la lista de personajes de un usuario concreto."""
    todos = leer_personajes_todos()
    return todos.get(username, [])

def guardar_personajes_usuario(username: str, personajes: list):
    """Guarda la lista completa de personajes de un usuario."""
    todos = leer_personajes_todos()
    todos[username] = personajes
    _escribir("characters.yaml", {"personajes": todos})
    # Sincronizar lista de nombres en users.yaml
    actualizar_personajes_usuario(username, [p["nombre"] for p in personajes])

# ── abilities.yaml ───────────────────────────────────────────────

OBJETO_POCION = {
    "nombre":      "Poción",
    "descripcion": "Restaura 40 PS",
    "efecto":      "heal_hp",
    "valor":       40,
}

HABILIDAD_ATAQUE_BASE = {
    "nombre":      "Ataque",
    "formula":     "40",
    "stat_base":   "Fuerza",
    "descripcion": "Ataque básico (daño fijo: 40)",
}

def leer_habilidades() -> list:
    datos = _leer("abilities.yaml")
    habs = datos.get("habilidades", [])
    # Asegurar que "Ataque" siempre está
    if not any(h["nombre"] == "Ataque" for h in habs):
        habs.insert(0, copy.deepcopy(HABILIDAD_ATAQUE_BASE))
    return habs

def guardar_habilidades(habilidades: list):
    _escribir("abilities.yaml", {"habilidades": habilidades})

# ── tokens.yaml ──────────────────────────────────────────────────

def leer_tokens() -> dict:
    datos = _leer("tokens.yaml")
    datos.setdefault("tokens", {})
    datos.setdefault("combate", {"activo": False, "turno": [], "turno_actual": 0})
    return datos

def guardar_tokens(tokens: dict, combate: dict):
    _escribir("tokens.yaml", {"tokens": tokens, "combate": combate})

# ── campaigns.yaml ───────────────────────────────────────────────

STATS_DEFAULT = [
    {"nombre": "Fuerza",        "tipo": "ofensiva",  "vs": "Resistencia",    "dado": "d20"},
    {"nombre": "Resistencia",   "tipo": "defensiva", "vs": None,             "dado": "d20"},
    {"nombre": "Poder Mágico",  "tipo": "ofensiva",  "vs": "Defensa Mágica", "dado": "d20"},
    {"nombre": "Defensa Mágica","tipo": "defensiva", "vs": None,             "dado": "d20"},
    {"nombre": "Agilidad",      "tipo": "neutral",   "vs": None,             "dado": "d20"},
]

def _capa_defecto() -> dict:
    return {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True}

def _capas_defecto() -> list:
    return [_capa_defecto(), _capa_defecto(), _capa_defecto()]

def leer_campaigns() -> dict:
    datos = _leer("campaigns.yaml")
    datos.setdefault("campanas", {
        "local": {"nombre": "local", "modo": "local", "capas_mapa": _capas_defecto(), "jugadores": []}
    })
    if "local" not in datos["campanas"]:
        datos["campanas"]["local"] = {"nombre": "local", "modo": "local", "capas_mapa": _capas_defecto(), "jugadores": []}

    # Migración: convertir mapa_activo (formato viejo) a capas_mapa (formato nuevo)
    for camp in datos["campanas"].values():
        if "mapa_activo" in camp and "capas_mapa" not in camp:
            archivo_viejo = camp.pop("mapa_activo")
            camp["capas_mapa"] = [
                {"archivo": archivo_viejo, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
                _capa_defecto(),
                _capa_defecto(),
            ]
        elif "capas_mapa" not in camp:
            camp["capas_mapa"] = _capas_defecto()

    datos.setdefault("plantilla", copy.deepcopy(STATS_DEFAULT))
    datos.setdefault("plantilla_bloqueada", False)
    datos.setdefault("plantillas_guardadas", {})
    datos.setdefault("mensajes", [])
    return datos

def guardar_campaigns(datos: dict):
    _escribir("campaigns.yaml", datos)

# ── music.yaml ───────────────────────────────────────────────────

def leer_musica() -> dict:
    datos = _leer("music.yaml")
    datos.setdefault("musica", {"archivo_actual": None})
    return datos["musica"]

def guardar_musica(archivo_actual):
    _escribir("music.yaml", {"musica": {"archivo_actual": archivo_actual}})
