"""
server.py — Servidor WebSocket de Mesa de Rol
La lógica de juego vive aquí.
La persistencia (leer/escribir archivos) está en storage.py.
"""

import asyncio
import websockets
import json
import random
import re
import copy

import storage

# ── Cargar configuración ─────────────────────────────────────────
cfg            = storage.leer_config()
HOST           = cfg["servidor"]["host"]
PORT           = cfg["servidor"]["port"]
GM_PASSWORD    = cfg["servidor"]["gm_password"]
MAX_MENSAJES   = cfg["juego"]["max_mensajes"]
COLORES        = cfg["juego"]["colores_default"]
NUM_CAPAS      = 3  # número de capas de imagen del mapa

# ── Estado en memoria (cargado al arrancar desde los YAML) ───────
#
# Dividimos el estado en secciones que corresponden a cada archivo:
#   campaigns  ← campaigns.yaml  (plantilla, mensajes, campañas, mapa)
#   tokens_d   ← tokens.yaml     (tokens activos, estado de combate)
#   personajes ← characters.yaml (personajes de cada jugador)
#   habilidades← abilities.yaml  (habilidades globales)
#
# Los usuarios se leen bajo demanda desde users.yaml.
#
campaigns  = {}
tokens     = {}
combate    = {}
personajes = {}   # username → [lista]
habilidades= []

clientes   = {}   # websocket → { nombre, es_gm }

# ── Cargar todo al arrancar ──────────────────────────────────────
def cargar_todo():
    global campaigns, tokens, combate, personajes, habilidades

    campaigns   = storage.leer_campaigns()
    tok_data    = storage.leer_tokens()
    tokens      = tok_data["tokens"]
    combate     = tok_data["combate"]
    personajes  = storage.leer_personajes_todos()
    habilidades = storage.leer_habilidades()

    print("Cargado:")
    print(f"  Tokens:     {len(tokens)}")
    print(f"  Personajes: {sum(len(v) for v in personajes.values())} en {len(personajes)} jugadores")
    print(f"  Habilidades:{len(habilidades)}")

# ── Guardar parcialmente (solo lo que cambió) ────────────────────
def guardar_tokens_y_combate():
    storage.guardar_tokens(tokens, combate)

def guardar_campaigns():
    storage.guardar_campaigns(campaigns)

def guardar_personajes(username: str):
    storage.guardar_personajes_usuario(username, personajes.get(username, []))

def guardar_habilidades():
    storage.guardar_habilidades(habilidades)

# ── Helpers de envío ─────────────────────────────────────────────
async def enviar(ws, msg):
    try:    await ws.send(json.dumps(msg, ensure_ascii=False))
    except: pass

async def broadcast(msg, excluir=None):
    txt = json.dumps(msg, ensure_ascii=False)
    for ws in list(clientes.keys()):
        if ws == excluir: continue
        try:    await ws.send(txt)
        except: pass

# ── Paquete de estado completo para un cliente ───────────────────
def paquete_estado(nombre: str, es_gm: bool) -> dict:
    campana_local = campaigns["campanas"].get("local", {})
    capas_mapa = campana_local.get("capas_mapa", [
        {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
        {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
        {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
    ])
    paquete = {
        "tipo":                 "estado_completo",
        "tokens":               tokens,
        "mensajes":             [],   # cada cliente lleva su propio log
        "tu_nombre":            nombre,
        "es_gm":                es_gm,
        "plantilla":            campaigns["plantilla"],
        "plantillas_guardadas": campaigns["plantillas_guardadas"],
        "plantilla_bloqueada":  campaigns["plantilla_bloqueada"],
        "turno":                combate["turno"],
        "turno_actual":         combate["turno_actual"],
        "combate_activo":       combate["activo"],
        "personajes":           personajes.get(nombre, []),
        "campanas":             campaigns["campanas"],
        "capas_mapa":           capas_mapa,
        "habilidades_globales": habilidades,
    }
    if es_gm:
        paquete["todos_personajes"] = personajes
    return paquete

# ── Personaje vacío por defecto ──────────────────────────────────
def personaje_vacio(nombre_personaje: str, username: str, color: str = "#3498db") -> dict:
    stats = {s["nombre"]: 10 for s in campaigns["plantilla"]}
    stats.update({"HP": 100, "HP_max": 100, "MP": 50, "MP_max": 50})
    return {
        "nombre":       nombre_personaje,
        "owner":        username,
        "clase":        "Aventurero",
        "backstory":    "",
        "color":        color,
        "stats":        stats,
        "habilidades":  [copy.deepcopy(storage.HABILIDAD_ATAQUE_BASE)],
        "objetos":      [copy.deepcopy(storage.OBJETO_POCION)] if hasattr(storage, "OBJETO_POCION") else [],
        "info_visible": ["HP", "nombre", "clase"],
    }

# ── Sistema de fórmulas ──────────────────────────────────────────
def tirar_dado(x: int, y: int) -> int:
    return sum(random.randint(1, y) for _ in range(x))

def evaluar_formula(formula: str, stats_at: dict, stats_def: dict = None) -> tuple:
    if stats_def is None:
        stats_def = {}
    expr = formula.strip()
    detalles = []

    def reemplazar_dado(m):
        x = int(m.group(1)) if m.group(1) else 1
        y = int(m.group(2))
        r = tirar_dado(x, y)
        detalles.append(f"{x}d{y}={r}")
        return str(r)

    expr = re.sub(r'(\d*)d(\d+)', reemplazar_dado, expr, flags=re.IGNORECASE)

    for stat, val in sorted(stats_at.items(), key=lambda x: -len(x[0])):
        p = re.compile(r'(?<![a-zA-Z0-9_])a' + re.escape(stat), re.IGNORECASE)
        if p.search(expr):
            expr = p.sub(str(int(val)), expr)
            detalles.append(f"a{stat}={val}")

    for stat, val in sorted(stats_def.items(), key=lambda x: -len(x[0])):
        p = re.compile(r'(?<![a-zA-Z0-9_])o' + re.escape(stat), re.IGNORECASE)
        if p.search(expr):
            expr = p.sub(str(int(val)), expr)
            detalles.append(f"o{stat}={val}")

    for stat, val in sorted(stats_at.items(), key=lambda x: -len(x[0])):
        p = re.compile(r'(?<![a-zA-Z0-9_])' + re.escape(stat) + r'(?![a-zA-Z0-9_])', re.IGNORECASE)
        if p.search(expr):
            expr = p.sub(str(int(val)), expr)
            detalles.append(f"{stat}={val}")

    try:
        if re.search(r'[^0-9+\-*/().\s]', expr):
            raise ValueError(f"Carácter inválido: {expr}")
        resultado = int(eval(expr, {"__builtins__": {}}, {}))
    except Exception as e:
        resultado = 0
        detalles.append(f"ERROR:{e}")

    return resultado, f"[{formula}] → {' | '.join(detalles)} = {resultado}"

def tirar_simple(dado_str: str) -> tuple:
    m = re.match(r'(\d*)d(\d+)', dado_str, re.IGNORECASE)
    if not m: return 0, 20
    x = int(m.group(1)) if m.group(1) else 1
    y = int(m.group(2))
    return tirar_dado(x, y), y

# ── Manejador principal ──────────────────────────────────────────
async def manejar(ws, msg: dict):
    tipo   = msg.get("tipo")
    info   = clientes.get(ws, {})
    nombre = info.get("nombre")
    es_gm  = info.get("es_gm", False)

    # ─── UNIRSE ────────────────────────────────────────────────
    if tipo == "unirse":
        nom = msg.get("nombre", "").strip()[:20]
        if not nom:
            await enviar(ws, {"tipo":"error","texto":"El nombre no puede estar vacío."}); return
        if nom in [v["nombre"] for v in clientes.values()]:
            await enviar(ws, {"tipo":"error","texto":"Ese nombre ya está en uso."}); return

        clientes[ws] = {"nombre": nom, "es_gm": False}

        # Registrar usuario y cargar sus personajes
        storage.registrar_usuario(nom)
        if nom not in personajes:
            personajes[nom] = storage.leer_personajes_usuario(nom)

        print(f"[+] {nom}")
        await enviar(ws, paquete_estado(nom, False))
        await broadcast({"tipo":"chat","autor":"Sistema",
                         "texto":f"{nom} entró a la sala.",
                         "tokens":tokens}, excluir=ws)

    # ─── CHAT / COMANDOS ────────────────────────────────────────
    elif tipo == "chat":
        texto = msg.get("texto","").strip()
        if not texto or not nombre: return

        # /dX dados
        if re.match(r'^/\d*d\d+', texto, re.IGNORECASE):
            dado_str = texto[1:].split()[0]
            m_dado = re.match(r'^(\d*)d(\d+)$', dado_str, re.IGNORECASE)
            if m_dado:
                n     = int(m_dado.group(1)) if m_dado.group(1) else 1
                caras = int(m_dado.group(2))
                if 1 < caras <= 10000 and 1 <= n <= 99:
                    resultados = [random.randint(1,caras) for _ in range(n)]
                    total      = sum(resultados)
                    txt_dado   = (f"🎲 tiró {dado_str} → **{total}**" if n==1
                                  else f"🎲 tiró {n}d{caras} → {' + '.join(map(str,resultados))} = **{total}**")
                    _agregar_mensaje(nombre, txt_dado)
                    await broadcast({"tipo":"chat","autor":nombre,"texto":txt_dado,
                                     "es_dado":True,"mostrar_en_mapa":True,"resultado":total})
                else:
                    await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":"Formato: /d20  /2d6  /d100"})
            return

        # /mode gm <pwd>
        if texto.lower().startswith("/mode gm"):
            partes = texto.split()
            pwd = partes[2] if len(partes) >= 3 else ""
            if pwd == GM_PASSWORD:
                clientes[ws]["es_gm"] = True
                await enviar(ws,{"tipo":"modo_cambiado","es_gm":True,
                                 "plantilla":campaigns["plantilla"],
                                 "plantillas_guardadas":campaigns["plantillas_guardadas"],
                                 "plantilla_bloqueada":campaigns["plantilla_bloqueada"],
                                 "todos_personajes":personajes,
                                 "habilidades_globales":habilidades})
                await broadcast({"tipo":"chat","autor":"Sistema","texto":f"👑 {nombre} es ahora el Game Master."})
            else:
                await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":"❌ Contraseña incorrecta."})
            return

        # /mode player
        if texto.lower() == "/mode player":
            clientes[ws]["es_gm"] = False
            await enviar(ws,{"tipo":"modo_cambiado","es_gm":False})
            await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":f"🧙 {nombre} volvió al modo jugador."})
            return

        # Mensaje normal
        _agregar_mensaje(nombre, texto)
        await broadcast({"tipo":"chat","autor":nombre,"texto":texto})

    # ─── MOVER TOKEN ────────────────────────────────────────────
    elif tipo == "mover_token":
        tid = msg.get("token_id")
        t   = tokens.get(tid)
        if not t: return
        if t.get("owner") != nombre and not es_gm: return
        t["x"] = msg["x"]; t["y"] = msg["y"]
        guardar_tokens_y_combate()
        await broadcast({"tipo":"token_movido","token_id":tid,"x":msg["x"],"y":msg["y"]})

    # ─── RETIRAR TOKEN (dueño retira su propio token del mapa) ─────
    elif tipo == "retirar_token":
        tid = msg.get("token_id")
        if not tid or tid not in tokens: return
        if tokens[tid].get("owner") != nombre:
            return  # solo el dueño puede retirar su propio token
        del tokens[tid]
        guardar_tokens_y_combate()
        await broadcast({"tipo":"token_borrado","token_id":tid})

    # ─── CREAR PERSONAJE ────────────────────────────────────────
    elif tipo == "crear_personaje":
        if not nombre: return
        nom_p = msg.get("nombre_personaje","Personaje").strip()[:30]
        color = msg.get("color", COLORES[len(personajes.get(nombre,[])) % len(COLORES)])
        p = personaje_vacio(nom_p, nombre, color)
        p["backstory"] = msg.get("backstory","")
        p["clase"]     = msg.get("clase","Aventurero")
        if msg.get("stats"):
            for k,v in msg["stats"].items():
                p["stats"][k] = v

        if nombre not in personajes:
            personajes[nombre] = []

        if nom_p in [x["nombre"] for x in personajes[nombre]]:
            await enviar(ws,{"tipo":"error","texto":"Ya tienes un personaje con ese nombre."}); return

        personajes[nombre].append(p)
        guardar_personajes(nombre)

        await enviar(ws,{"tipo":"personaje_creado","personaje":p,"personajes":personajes[nombre]})
        await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":f"✅ Personaje '{nom_p}' creado."})
        for ws_gm, gi in clientes.items():
            if gi.get("es_gm"):
                await enviar(ws_gm,{"tipo":"todos_personajes_actualizados","todos_personajes":personajes})

    # ─── EDITAR PERSONAJE ────────────────────────────────────────
    elif tipo == "editar_personaje":
        if not nombre: return
        nom_p = msg.get("nombre_personaje")
        owner = nombre

        p = next((x for x in personajes.get(nombre,[]) if x["nombre"]==nom_p), None)
        if not p and es_gm:
            for jug, plist in personajes.items():
                found = next((x for x in plist if x["nombre"]==nom_p), None)
                if found: p = found; owner = jug; break
        if not p: return

        for campo in ["backstory","clase","color","info_visible"]:
            if campo in msg: p[campo] = msg[campo]
        if msg.get("stats"):
            p["stats"].update(msg["stats"])
        if msg.get("habilidades") is not None:
            p["habilidades"] = msg["habilidades"]
            if not any(h["nombre"]=="Ataque" for h in p["habilidades"]):
                p["habilidades"].insert(0, copy.deepcopy(storage.HABILIDAD_ATAQUE_BASE))

        guardar_personajes(owner)
        await enviar(ws,{"tipo":"personaje_actualizado","personaje":p,"personajes":personajes.get(nombre,[])})

    # ─── PEDIR PERSONAJES ────────────────────────────────────────
    elif tipo == "pedir_personajes":
        target = msg.get("jugador", nombre)
        if target != nombre and not es_gm:
            await enviar(ws,{"tipo":"error","texto":"Sin permiso."}); return
        await enviar(ws,{"tipo":"lista_personajes","jugador":target,
                         "personajes":personajes.get(target,[])})

    # ─── DESPLEGAR TOKEN ────────────────────────────────────────
    elif tipo == "desplegar_token":
        nom_p = msg.get("nombre_personaje")
        p = None; owner_name = nombre
        if es_gm:
            for jug, plist in personajes.items():
                found = next((x for x in plist if x["nombre"]==nom_p), None)
                if found: p = found; owner_name = jug; break
        else:
            p = next((x for x in personajes.get(nombre,[]) if x["nombre"]==nom_p), None)
        if not p: return

        tid = f"{owner_name}_{nom_p}"
        tokens[tid] = {
            "token_id":   tid,
            "personaje":  nom_p,
            "owner":      owner_name,
            "x": msg.get("x",300), "y": msg.get("y",300),
            "color":      p["color"],
            "clase":      p["clase"],
            "stats":      dict(p["stats"]),
            "habilidades":list(p["habilidades"]),
            "objetos":    list(p.get("objetos",[])),
            "info_visible":list(p.get("info_visible",["HP","nombre"])),
            "es_enemigo": False,
        }
        guardar_tokens_y_combate()
        await broadcast({"tipo":"token_añadido","token":tokens[tid]})

    # ─── GM: BORRAR TOKEN ────────────────────────────────────────
    elif tipo == "gm_borrar_token" and es_gm:
        tid = msg.get("token_id")
        if tid in tokens:
            del tokens[tid]
            guardar_tokens_y_combate()
            await broadcast({"tipo":"token_borrado","token_id":tid})

    # ─── GM: EDITAR TOKEN ────────────────────────────────────────
    elif tipo == "gm_editar_token" and es_gm:
        tid = msg.get("token_id")
        if tid in tokens:
            t = tokens[tid]
            for campo in ["color","clase","info_visible"]:
                if campo in msg: t[campo] = msg[campo]
            if msg.get("stats"): t["stats"].update(msg["stats"])
            guardar_tokens_y_combate()
            await broadcast({"tipo":"token_actualizado","token":t})

    # ─── MODIFICAR ESTADO ────────────────────────────────────────
    elif tipo == "modificar_estado":
        tid = msg.get("token_id")
        if not tid or tid not in tokens: return
        t = tokens[tid]
        if t.get("owner") != nombre and not es_gm: return
        if "hp" in msg: t["stats"]["HP"] = max(0, int(msg["hp"]))
        if "mp" in msg: t["stats"]["MP"] = max(0, int(msg["mp"]))
        guardar_tokens_y_combate()
        await broadcast({"tipo":"token_actualizado","token":t})

    # ─── ATACAR ──────────────────────────────────────────────────
    elif tipo == "atacar":
        tid_at = msg.get("token_atacante")
        tid_df = msg.get("token_defensor")
        nom_hab= msg.get("habilidad","Ataque")
        if not tid_at or not tid_df: return
        if tid_at not in tokens or tid_df not in tokens: return
        ta = tokens[tid_at]; td = tokens[tid_df]
        if ta.get("owner") != nombre and not es_gm: return

        hab = next((h for h in ta.get("habilidades",[]) if h["nombre"]==nom_hab),
                   copy.deepcopy(storage.HABILIDAD_ATAQUE_BASE))
        daño, detalle = evaluar_formula(hab.get("formula","40"), ta.get("stats",{}), td.get("stats",{}))
        daño = max(0, daño)
        td["stats"]["HP"] = max(0, td["stats"].get("HP",0) - daño)
        guardar_tokens_y_combate()

        txt = f"⚔️ {ta['personaje']} usó {nom_hab} en {td['personaje']}: {daño} daño | {detalle}"
        if td["stats"]["HP"] == 0:
            txt += f" ☠️ {td['personaje']} derrotado!"
        _agregar_mensaje("Combate", txt)
        await broadcast({"tipo":"resultado_ataque","token_atacante":tid_at,"token_defensor":tid_df,
                         "daño":daño,"hp_restante":td["stats"]["HP"],"tokens":tokens,"texto_sistema":txt})

    # ─── USAR OBJETO ─────────────────────────────────────────────
    elif tipo == "usar_objeto":
        tid = msg.get("token_id"); nom_obj = msg.get("nombre_objeto")
        if not tid or tid not in tokens: return
        t = tokens[tid]
        if t.get("owner") != nombre and not es_gm: return
        obj = next((o for o in t.get("objetos",[]) if o["nombre"]==nom_obj), None)
        if not obj: return
        texto = ""
        if obj.get("efecto") == "heal_hp":
            valor = int(obj.get("valor",0))
            antes = t["stats"].get("HP",0)
            t["stats"]["HP"] = min(t["stats"].get("HP_max",100), antes + valor)
            texto = f"💊 {t['personaje']} usó {nom_obj}: +{valor} PS ({antes} → {t['stats']['HP']})"
        t["objetos"] = [o for o in t.get("objetos",[]) if o["nombre"]!=nom_obj]
        # Sincronizar con el personaje
        for p in personajes.get(nombre,[]):
            if p["nombre"] == t.get("personaje"):
                p["objetos"] = list(t["objetos"])
                guardar_personajes(nombre)
                break
        guardar_tokens_y_combate()
        _agregar_mensaje("Sistema", texto)
        await broadcast({"tipo":"objeto_usado","token_id":tid,"tokens":tokens,"texto":texto})
        await enviar(ws,{"tipo":"lista_personajes","jugador":nombre,"personajes":personajes.get(nombre,[])})

    # ─── GM: PLANTILLA ──────────────────────────────────────────
    elif tipo == "gm_set_plantilla" and es_gm:
        campaigns["plantilla"] = msg.get("plantilla", storage.STATS_DEFAULT[:])
        guardar_campaigns()
        await broadcast({"tipo":"plantilla_actualizada","plantilla":campaigns["plantilla"],
                         "plantilla_bloqueada":campaigns["plantilla_bloqueada"]})

    elif tipo == "gm_guardar_plantilla" and es_gm:
        nom_p = msg.get("nombre_plantilla","Sin nombre")
        campaigns["plantillas_guardadas"][nom_p] = list(campaigns["plantilla"])
        guardar_campaigns()
        await enviar(ws,{"tipo":"plantillas_guardadas_actualizadas",
                         "plantillas_guardadas":campaigns["plantillas_guardadas"]})
        await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":f"💾 Plantilla '{nom_p}' guardada."})

    elif tipo == "gm_cargar_plantilla" and es_gm:
        nom_p = msg.get("nombre_plantilla")
        if nom_p in campaigns["plantillas_guardadas"]:
            campaigns["plantilla"]           = list(campaigns["plantillas_guardadas"][nom_p])
            campaigns["plantilla_bloqueada"] = False
            guardar_campaigns()
            await broadcast({"tipo":"plantilla_actualizada","plantilla":campaigns["plantilla"],
                             "plantilla_bloqueada":False,"habilidades_globales":habilidades})

    elif tipo == "gm_borrar_plantilla_guardada" and es_gm:
        nom_p = msg.get("nombre_plantilla")
        if nom_p in campaigns["plantillas_guardadas"]:
            del campaigns["plantillas_guardadas"][nom_p]
            guardar_campaigns()
            await enviar(ws,{"tipo":"plantillas_guardadas_actualizadas",
                             "plantillas_guardadas":campaigns["plantillas_guardadas"]})

    elif tipo == "gm_desbloquear_plantilla" and es_gm:
        campaigns["plantilla_bloqueada"] = False
        guardar_campaigns()
        await broadcast({"tipo":"plantilla_actualizada","plantilla":campaigns["plantilla"],
                         "plantilla_bloqueada":False})

    # ─── GM: MAPA (nuevo sistema de capas) ──────────────────────
    elif tipo == "gm_set_capa_mapa" and es_gm:
        num_capa = msg.get("capa")
        if not isinstance(num_capa, int) or num_capa < 0 or num_capa >= NUM_CAPAS: return
        campana = campaigns["campanas"].get("local", {})
        if "capas_mapa" not in campana:
            campana["capas_mapa"] = [
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
            ]
        capa = campana["capas_mapa"][num_capa]
        for campo in ["archivo", "x", "y", "scaleX", "scaleY", "visible"]:
            if campo in msg:
                capa[campo] = msg[campo]
        guardar_campaigns()
        await broadcast({"tipo": "capas_mapa_actualizadas", "capas_mapa": campana["capas_mapa"]})

    # ─── GM: MAPA (formato antiguo, compatibilidad) ──────────────
    elif tipo == "gm_set_mapa" and es_gm:
        archivo = msg.get("archivo")
        campana = campaigns["campanas"].get("local", {})
        if "capas_mapa" not in campana:
            campana["capas_mapa"] = [
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
                {"archivo": None, "x": 0, "y": 0, "scaleX": 1.0, "scaleY": 1.0, "visible": True},
            ]
        campana["capas_mapa"][0]["archivo"] = archivo
        guardar_campaigns()
        await broadcast({"tipo": "capas_mapa_actualizadas", "capas_mapa": campana["capas_mapa"]})

    # ─── GM: COMBATE ────────────────────────────────────────────
    elif tipo == "gm_iniciar_combate" and es_gm:
        stat_ini = next((s for s in campaigns["plantilla"] if "agil" in s.get("nombre","").lower()), None)
        orden = []
        for tid, t in tokens.items():
            base = t.get("stats",{}).get(stat_ini["nombre"] if stat_ini else "Agilidad", 0)
            roll, _ = tirar_simple("d20")
            orden.append((tid, base + roll))
        orden.sort(key=lambda x: x[1], reverse=True)
        combate["turno"]    = [x[0] for x in orden]
        combate["turno_actual"] = 0
        combate["activo"]   = True
        guardar_tokens_y_combate()
        primero = tokens.get(combate["turno"][0],{}).get("personaje","?") if combate["turno"] else "?"
        await broadcast({"tipo":"combate_iniciado","turno":combate["turno"],"turno_actual":0,
                         "combate_activo":True,"tokens":tokens,"texto_sistema":f"⚔️ ¡Combate! Turno de {primero}."})

    elif tipo == "gm_terminar_combate" and es_gm:
        combate.update({"turno":[],"turno_actual":0,"activo":False})
        guardar_tokens_y_combate()
        await broadcast({"tipo":"combate_terminado","combate_activo":False,"texto_sistema":"🏳️ Combate terminado."})

    elif tipo == "gm_siguiente_turno" and es_gm:
        if combate["turno"]:
            combate["turno_actual"] = (combate["turno_actual"]+1) % len(combate["turno"])
            guardar_tokens_y_combate()
            sig = tokens.get(combate["turno"][combate["turno_actual"]],{}).get("personaje","?")
            await broadcast({"tipo":"turno_cambiado","turno_actual":combate["turno_actual"],
                             "turno":combate["turno"],"texto_sistema":f"⏭️ Turno de {sig}."})

    # ─── GM: MÚSICA SINCRONIZADA ─────────────────────────────────
    elif tipo == "gm_cambiar_musica" and es_gm:
        archivo = msg.get("archivo")
        storage.guardar_musica(archivo)
        await broadcast({"tipo":"musica_cambiada","archivo":archivo})

    # ─── GM: HABILIDADES GLOBALES ────────────────────────────────
    elif tipo == "gm_crear_habilidad" and es_gm:
        hab = msg.get("habilidad",{})
        if not hab.get("nombre"): return
        if any(h["nombre"]==hab["nombre"] for h in habilidades): return
        habilidades.append({"nombre":hab.get("nombre",""),"formula":hab.get("formula","0"),
                            "stat_base":hab.get("stat_base",""),"descripcion":hab.get("descripcion","")})
        guardar_habilidades()
        await broadcast({"tipo":"habilidades_globales_actualizadas","habilidades_globales":habilidades})

    elif tipo == "gm_borrar_habilidad" and es_gm:
        nom_h = msg.get("nombre_habilidad")
        if nom_h == "Ataque": return
        habilidades[:] = [h for h in habilidades if h["nombre"]!=nom_h]
        guardar_habilidades()
        await broadcast({"tipo":"habilidades_globales_actualizadas","habilidades_globales":habilidades})

    elif tipo == "gm_editar_habilidad" and es_gm:
        nom_orig = msg.get("nombre_original")
        hab      = msg.get("habilidad",{})
        if not nom_orig or not hab.get("nombre"): return
        if nom_orig == "Ataque": return
        nueva = {"nombre":hab["nombre"],"formula":hab.get("formula","0"),
                 "stat_base":hab.get("stat_base",""),"descripcion":hab.get("descripcion","")}
        idx = next((i for i,h in enumerate(habilidades) if h["nombre"]==nom_orig), None)
        if idx is None: return
        habilidades[idx] = nueva
        # Actualizar en personajes
        afectados = set()
        for jug, plist in personajes.items():
            for p in plist:
                for i,h in enumerate(p.get("habilidades",[])):
                    if h["nombre"]==nom_orig:
                        p["habilidades"][i] = copy.deepcopy(nueva); afectados.add(jug)
        for jug in afectados:
            guardar_personajes(jug)
        # Actualizar en tokens
        for t in tokens.values():
            for i,h in enumerate(t.get("habilidades",[])):
                if h["nombre"]==nom_orig: t["habilidades"][i] = copy.deepcopy(nueva)
        guardar_habilidades()
        guardar_tokens_y_combate()
        await broadcast({"tipo":"habilidades_globales_actualizadas","habilidades_globales":habilidades})
        for ws_c, ci in clientes.items():
            if ci.get("nombre") in afectados:
                await enviar(ws_c,{"tipo":"personajes_actualizados",
                                   "personajes":personajes.get(ci["nombre"],[])})

    elif tipo == "añadir_habilidad_personaje":
        if not nombre: return
        nom_p   = msg.get("nombre_personaje")
        nom_hab = msg.get("nombre_habilidad")
        p = next((x for x in personajes.get(nombre,[]) if x["nombre"]==nom_p), None)
        if not p: return
        gh = next((h for h in habilidades if h["nombre"]==nom_hab), None)
        if not gh: return
        if any(h["nombre"]==nom_hab for h in p["habilidades"]): return
        p["habilidades"].append(copy.deepcopy(gh))
        guardar_personajes(nombre)
        await enviar(ws,{"tipo":"personaje_actualizado","personaje":p,"personajes":personajes.get(nombre,[])})

    elif tipo == "quitar_habilidad_personaje":
        if not nombre: return
        nom_p   = msg.get("nombre_personaje")
        nom_hab = msg.get("nombre_habilidad")
        if nom_hab == "Ataque": return
        p = next((x for x in personajes.get(nombre,[]) if x["nombre"]==nom_p), None)
        if not p: return
        p["habilidades"] = [h for h in p["habilidades"] if h["nombre"]!=nom_hab]
        guardar_personajes(nombre)
        await enviar(ws,{"tipo":"personaje_actualizado","personaje":p,"personajes":personajes.get(nombre,[])})

# ── Helper: agregar mensaje al historial ─────────────────────────
def _agregar_mensaje(autor: str, texto: str):
    campaigns["mensajes"].append({"autor":autor,"texto":texto})
    campaigns["mensajes"] = campaigns["mensajes"][-MAX_MENSAJES:]
    guardar_campaigns()

# ── Ciclo de vida de conexión ────────────────────────────────────
async def conexion(ws):
    print(f"[→] {ws.remote_address}")
    try:
        async for raw in ws:
            try:   await manejar(ws, json.loads(raw))
            except json.JSONDecodeError: pass
            except Exception as e:
                print(f"[ERROR] {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        info = clientes.pop(ws, {})
        nom  = info.get("nombre")
        if nom:
            print(f"[-] {nom}")
            await broadcast({"tipo":"chat","autor":"Sistema","texto":f"{nom} abandonó la sala."})

# ── Arranque ─────────────────────────────────────────────────────
async def main():
    cargar_todo()
    print(f"\nServidor Mesa de Rol en ws://{HOST}:{PORT}")
    print(f"Contraseña GM: {GM_PASSWORD}\n")
    async with websockets.serve(conexion, HOST, PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
