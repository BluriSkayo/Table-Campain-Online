import asyncio
import websockets
import json
import yaml
import os
import random
import re
import math

# ── Configuración ───────────────────────────────────────────────
HOST        = "localhost"
PORT        = 8765
GM_PASSWORD = "gm1234"
DATA_DIR    = os.path.dirname(os.path.abspath(__file__))
ARCHIVO     = os.path.join(DATA_DIR, "estado.yaml")

COLORES_DEFAULT = ["#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63","#1abc9c"]

# ── Stats por defecto (según Directrices) ───────────────────────
STATS_DEFAULT = [
    {"nombre": "Fuerza",        "tipo": "ofensiva",  "vs": "Resistencia",    "dado": "d20"},
    {"nombre": "Resistencia",   "tipo": "defensiva", "vs": None,             "dado": "d20"},
    {"nombre": "Poder Mágico",  "tipo": "ofensiva",  "vs": "Defensa Mágica", "dado": "d20"},
    {"nombre": "Defensa Mágica","tipo": "defensiva", "vs": None,             "dado": "d20"},
    {"nombre": "Agilidad",      "tipo": "neutral",   "vs": None,             "dado": "d20"},
]

HABILIDAD_ATAQUE_BASE = {
    "nombre":   "Ataque",
    "formula":  "40",
    "stat_base": "Fuerza",
    "descripcion": "Ataque básico (daño fijo: 40)",
}

OBJETO_POCION = {
    "nombre":      "Poción",
    "descripcion": "Restaura 40 PS",
    "efecto":      "heal_hp",
    "valor":       40,
}

# ── Estado global ───────────────────────────────────────────────
estado = {
    "campanas": {
        "local": {
            "nombre":    "local",
            "jugadores": [],
            "tokens":    {},
            "mapa":      None,
            "modo":      "local",
        }
    },
    "campana_activa": "local",
    "plantilla":      STATS_DEFAULT[:],
    "plantillas_guardadas": {},
    "plantilla_bloqueada":  False,
    "personajes":     {},   # nombre_jugador → [lista de personajes]
    "tokens":         {},   # nombre_token → token_data
    "mensajes":       [],
    "turno":          [],
    "turno_actual":   0,
    "combate_activo": False,
    "mapa_activo":    None,
}

clientes = {}   # websocket → { nombre, es_gm }

# ── Persistencia ────────────────────────────────────────────────
def guardar():
    with open(ARCHIVO, "w", encoding="utf-8") as f:
        yaml.dump(estado, f, allow_unicode=True)

def cargar():
    global estado
    if os.path.exists(ARCHIVO):
        with open(ARCHIVO, "r", encoding="utf-8") as f:
            datos = yaml.safe_load(f)
            if datos:
                # Asegurar que siempre exista la campaña local
                if "campanas" not in datos:
                    datos["campanas"] = estado["campanas"]
                if "local" not in datos.get("campanas", {}):
                    datos["campanas"]["local"] = estado["campanas"]["local"]
                estado.update(datos)
    # Asegurar campos que pueden faltar en estados guardados anteriores
    if "mapa_activo" not in estado:
        estado["mapa_activo"] = None
    print("Estado cargado. Tokens:", list(estado["tokens"].keys()))

# ── Envío ────────────────────────────────────────────────────────
async def enviar(ws, msg):
    try:    await ws.send(json.dumps(msg, ensure_ascii=False))
    except: pass

async def broadcast(msg, excluir=None):
    txt = json.dumps(msg, ensure_ascii=False)
    for ws in list(clientes.keys()):
        if ws == excluir: continue
        try:    await ws.send(txt)
        except: pass

# ── Estado completo ──────────────────────────────────────────────
def paquete_estado(nombre, es_gm):
    return {
        "tipo":                "estado_completo",
        "tokens":              estado["tokens"],
        "mensajes":            estado["mensajes"],
        "tu_nombre":           nombre,
        "es_gm":               es_gm,
        "plantilla":           estado["plantilla"],
        "plantillas_guardadas":estado["plantillas_guardadas"],
        "plantilla_bloqueada": estado["plantilla_bloqueada"],
        "turno":               estado["turno"],
        "turno_actual":        estado["turno_actual"],
        "combate_activo":      estado["combate_activo"],
        "personajes":          estado["personajes"].get(nombre, []),
        "campanas":            estado["campanas"],
        "mapa_activo":         estado["mapa_activo"],
    }

# ── Sistema de fórmulas ──────────────────────────────────────────
def tirar_dado(x, y):
    """Tira x dados de y caras. Devuelve suma."""
    return sum(random.randint(1, y) for _ in range(x))

def evaluar_formula(formula: str, stats: dict) -> tuple[int, str]:
    """
    Evalúa una fórmula como 'Fuerza/4 + 1d20'.
    Devuelve (resultado_int, detalle_str).
    El servidor es el único que ejecuta esto.
    """
    expr = formula.strip()
    detalle_partes = []

    # Reemplazar dados XdY → valor aleatorio
    def reemplazar_dado(m):
        x = int(m.group(1)) if m.group(1) else 1
        y = int(m.group(2))
        resultado = tirar_dado(x, y)
        detalle_partes.append(f"{x}d{y}={resultado}")
        return str(resultado)

    expr_eval = re.sub(r'(\d*)d(\d+)', reemplazar_dado, expr, flags=re.IGNORECASE)

    # Reemplazar nombres de stats → valores numéricos
    for nombre_stat, valor in sorted(stats.items(), key=lambda x: -len(x[0])):
        patron = re.compile(re.escape(nombre_stat), re.IGNORECASE)
        if patron.search(expr_eval):
            expr_eval = patron.sub(str(int(valor)), expr_eval)
            detalle_partes.append(f"{nombre_stat}={valor}")

    # Evaluar expresión aritmética segura
    try:
        # Solo permitir números y operadores
        if re.search(r'[^0-9+\-*/().\s]', expr_eval):
            raise ValueError(f"Carácter inválido en fórmula: {expr_eval}")
        resultado = int(eval(expr_eval, {"__builtins__": {}}, {}))
    except Exception as e:
        resultado = 0
        detalle_partes.append(f"ERROR: {e}")

    detalle = f"[{formula}] → {' | '.join(detalle_partes)} = {resultado}"
    return resultado, detalle

def tirar_simple(dado_str: str) -> tuple[int, int]:
    """Tirar 'dX' o 'XdY'. Devuelve (resultado, caras)."""
    m = re.match(r'(\d*)d(\d+)', dado_str, re.IGNORECASE)
    if not m:
        return 0, 20
    x = int(m.group(1)) if m.group(1) else 1
    y = int(m.group(2))
    return tirar_dado(x, y), y

# ── Personaje vacío por defecto ──────────────────────────────────
def personaje_vacio(nombre_personaje, nombre_jugador, color="#3498db"):
    stats = {s["nombre"]: 10 for s in estado["plantilla"]}
    stats["HP"]  = 100
    stats["HP_max"] = 100
    stats["MP"]  = 50
    stats["MP_max"] = 50
    return {
        "nombre":      nombre_personaje,
        "owner":       nombre_jugador,
        "clase":       "Aventurero",
        "backstory":   "",
        "color":       color,
        "stats":       stats,
        "habilidades": [HABILIDAD_ATAQUE_BASE.copy()],
        "objetos":     [OBJETO_POCION.copy()],
        "info_visible": ["HP", "nombre", "clase"],
    }

# ── Manejador ────────────────────────────────────────────────────
async def manejar(ws, msg):
    tipo   = msg.get("tipo")
    info   = clientes.get(ws, {})
    nombre = info.get("nombre")
    es_gm  = info.get("es_gm", False)

    # ─── UNIRSE ────────────────────────────────────────────────
    if tipo == "unirse":
        nom = msg.get("nombre", "Aventurero").strip()[:20]
        if not nom:
            await enviar(ws, {"tipo":"error","texto":"El nombre no puede estar vacío."}); return
        usados = [v["nombre"] for v in clientes.values()]
        if nom in usados:
            await enviar(ws, {"tipo":"error","texto":"Ese nombre ya está en uso."}); return

        color = COLORES_DEFAULT[len(clientes) % len(COLORES_DEFAULT)]
        clientes[ws] = {"nombre": nom, "es_gm": False}

        # Inicializar lista de personajes si no existe
        if nom not in estado["personajes"]:
            estado["personajes"][nom] = []
            guardar()

        print(f"[+] {nom}")
        await enviar(ws, paquete_estado(nom, False))
        await broadcast({"tipo":"chat","autor":"Sistema",
                         "texto":f"{nom} entró a la sala.",
                         "tokens":estado["tokens"]}, excluir=ws)

    # ─── CHAT / COMANDOS ────────────────────────────────────────
    elif tipo == "chat":
        texto = msg.get("texto","").strip()
        if not texto or not nombre: return

        # /dX  dados
        if re.match(r'^/\d*d\d+', texto, re.IGNORECASE):
            dado_str = texto[1:].split()[0]
            try:
                resultado, caras = tirar_simple(dado_str)
                assert 1 < caras <= 10000
                txt_dado = f"🎲 tiró 1{dado_str.lower()} → **{resultado}**"
                estado["mensajes"].append({"autor":nombre,"texto":txt_dado})
                estado["mensajes"] = estado["mensajes"][-100:]
                guardar()
                await broadcast({"tipo":"chat","autor":nombre,"texto":txt_dado,"es_dado":True})
            except:
                await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":"Formato: /d20  /2d6  /d100"})
            return

        # /mode gm <pwd>
        if texto.lower().startswith("/mode gm"):
            partes = texto.split()
            pwd = partes[2] if len(partes) >= 3 else ""
            if pwd == GM_PASSWORD:
                clientes[ws]["es_gm"] = True
                await enviar(ws,{"tipo":"modo_cambiado","es_gm":True,
                                 "plantilla":estado["plantilla"],
                                 "plantillas_guardadas":estado["plantillas_guardadas"],
                                 "plantilla_bloqueada":estado["plantilla_bloqueada"]})
                await broadcast({"tipo":"chat","autor":"Sistema",
                                 "texto":f"👑 {nombre} es ahora el Game Master."})
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
        entrada = {"autor":nombre,"texto":texto}
        estado["mensajes"].append(entrada)
        estado["mensajes"] = estado["mensajes"][-100:]
        guardar()
        await broadcast({"tipo":"chat","autor":nombre,"texto":texto})

    # ─── MOVER TOKEN ────────────────────────────────────────────
    elif tipo == "mover_token":
        objetivo = msg.get("token_id", nombre)
        # Solo puede mover el suyo o el GM mueve cualquiera
        token = estado["tokens"].get(objetivo)
        if not token: return
        if token.get("owner") != nombre and not es_gm: return
        token["x"] = msg["x"]; token["y"] = msg["y"]
        guardar()
        await broadcast({"tipo":"token_movido","token_id":objetivo,"x":msg["x"],"y":msg["y"]})

    # ─── PERSONAJES: CREAR ──────────────────────────────────────
    elif tipo == "crear_personaje":
        if not nombre: return
        nom_p = msg.get("nombre_personaje","Personaje").strip()[:30]
        color = msg.get("color", COLORES_DEFAULT[len(estado["personajes"].get(nombre,[])) % len(COLORES_DEFAULT)])
        p = personaje_vacio(nom_p, nombre, color)
        p["backstory"] = msg.get("backstory","")
        p["clase"]     = msg.get("clase","Aventurero")
        # Sobrescribir stats si se enviaron
        if msg.get("stats"):
            for k,v in msg["stats"].items():
                p["stats"][k] = v

        if nombre not in estado["personajes"]:
            estado["personajes"][nombre] = []

        # Evitar duplicados
        existentes = [x["nombre"] for x in estado["personajes"][nombre]]
        if nom_p in existentes:
            await enviar(ws,{"tipo":"error","texto":"Ya tienes un personaje con ese nombre."}); return

        estado["personajes"][nombre].append(p)
        guardar()
        await enviar(ws,{"tipo":"personaje_creado","personaje":p,
                         "personajes":estado["personajes"][nombre]})
        await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":f"✅ Personaje '{nom_p}' creado."})

    # ─── PERSONAJES: EDITAR ─────────────────────────────────────
    elif tipo == "editar_personaje":
        if not nombre: return
        nom_p = msg.get("nombre_personaje")
        lista = estado["personajes"].get(nombre,[])
        p = next((x for x in lista if x["nombre"]==nom_p), None)
        if not p and not es_gm: return
        # El GM puede editar cualquier personaje
        if not p and es_gm:
            for jugador, plist in estado["personajes"].items():
                p = next((x for x in plist if x["nombre"]==nom_p), None)
                if p: break
        if not p: return

        for campo in ["backstory","clase","color","info_visible"]:
            if campo in msg: p[campo] = msg[campo]
        if msg.get("stats"):
            p["stats"].update(msg["stats"])
        if msg.get("habilidades") is not None:
            p["habilidades"] = msg["habilidades"]
            # Asegurar que "Ataque" siempre esté
            if not any(h["nombre"]=="Ataque" for h in p["habilidades"]):
                p["habilidades"].insert(0, HABILIDAD_ATAQUE_BASE.copy())
        guardar()
        await enviar(ws,{"tipo":"personaje_actualizado","personaje":p,
                         "personajes":estado["personajes"].get(nombre,[])})

    # ─── PERSONAJES: LISTAR ─────────────────────────────────────
    elif tipo == "pedir_personajes":
        target = msg.get("jugador", nombre)
        # Solo el dueño o el GM puede pedir la lista completa
        if target != nombre and not es_gm:
            await enviar(ws,{"tipo":"error","texto":"Sin permiso."}); return
        await enviar(ws,{"tipo":"lista_personajes",
                         "jugador":target,
                         "personajes":estado["personajes"].get(target,[])})

    # ─── DESPLEGAR TOKEN EN MAPA ─────────────────────────────────
    elif tipo == "desplegar_token":
        nom_p = msg.get("nombre_personaje")
        lista = estado["personajes"].get(nombre,[])
        p = next((x for x in lista if x["nombre"]==nom_p), None)
        if not p: return
        token_id = f"{nombre}_{nom_p}"
        estado["tokens"][token_id] = {
            "token_id":   token_id,
            "personaje":  nom_p,
            "owner":      nombre,
            "x": msg.get("x",300), "y": msg.get("y",300),
            "color":      p["color"],
            "clase":      p["clase"],
            "stats":      dict(p["stats"]),
            "habilidades":list(p["habilidades"]),
            "objetos":    list(p.get("objetos", [])),
            "info_visible": list(p.get("info_visible",["HP","nombre"])),
            "es_enemigo": False,
        }
        guardar()
        await broadcast({"tipo":"token_añadido","token":estado["tokens"][token_id]})

    # ─── GM: AÑADIR TOKEN ENEMIGO ────────────────────────────────
    elif tipo == "gm_añadir_token" and es_gm:
        nom_e = msg.get("nombre","Enemigo")
        token_id = nom_e
        if token_id in estado["tokens"]:
            token_id = nom_e + str(random.randint(2,99))
        stats = {s["nombre"]:10 for s in estado["plantilla"]}
        stats["HP"] = msg.get("hp",30); stats["HP_max"] = msg.get("hp",30)
        stats["MP"] = 0; stats["MP_max"] = 0
        if msg.get("stats"): stats.update(msg["stats"])
        estado["tokens"][token_id] = {
            "token_id":   token_id,
            "personaje":  nom_e,
            "owner":      "__gm__",
            "x": msg.get("x",300), "y": msg.get("y",300),
            "color":      msg.get("color","#e74c3c"),
            "clase":      msg.get("clase","Enemigo"),
            "stats":      stats,
            "habilidades":[HABILIDAD_ATAQUE_BASE.copy()],
            "info_visible":["HP","nombre"],
            "es_enemigo": True,
        }
        guardar()
        await broadcast({"tipo":"token_añadido","token":estado["tokens"][token_id]})

    # ─── GM: BORRAR TOKEN ────────────────────────────────────────
    elif tipo == "gm_borrar_token" and es_gm:
        tid = msg.get("token_id")
        if tid in estado["tokens"]:
            del estado["tokens"][tid]
            guardar()
            await broadcast({"tipo":"token_borrado","token_id":tid})

    # ─── GM: EDITAR TOKEN ────────────────────────────────────────
    elif tipo == "gm_editar_token" and es_gm:
        tid = msg.get("token_id")
        if tid in estado["tokens"]:
            t = estado["tokens"][tid]
            for campo in ["color","clase","info_visible"]:
                if campo in msg: t[campo] = msg[campo]
            if msg.get("stats"): t["stats"].update(msg["stats"])
            guardar()
            await broadcast({"tipo":"token_actualizado","token":t})

    # ─── MODIFICAR ESTADO PROPIO ─────────────────────────────────
    elif tipo == "modificar_estado":
        # Jugador modifica HP/MP/efectos de su propio token
        tid = msg.get("token_id")
        if not tid or tid not in estado["tokens"]: return
        t = estado["tokens"][tid]
        if t.get("owner") != nombre and not es_gm: return
        if "hp" in msg:
            t["stats"]["HP"] = max(0, int(msg["hp"]))
        if "mp" in msg:
            t["stats"]["MP"] = max(0, int(msg["mp"]))
        guardar()
        await broadcast({"tipo":"token_actualizado","token":t})

    # ─── ATACAR ──────────────────────────────────────────────────
    elif tipo == "atacar":
        tid_atacante  = msg.get("token_atacante")
        tid_defensor  = msg.get("token_defensor")
        nombre_hab    = msg.get("habilidad","Ataque")

        if not tid_atacante or not tid_defensor: return
        if tid_atacante not in estado["tokens"] or tid_defensor not in estado["tokens"]: return

        ta = estado["tokens"][tid_atacante]
        td = estado["tokens"][tid_defensor]

        # Verificar permiso: solo el dueño del token atacante (o GM)
        if ta.get("owner") != nombre and not es_gm: return

        # Buscar habilidad
        hab = next((h for h in ta.get("habilidades",[]) if h["nombre"]==nombre_hab), None)
        if not hab:
            hab = HABILIDAD_ATAQUE_BASE.copy()

        # Evaluar fórmula EN EL SERVIDOR
        formula  = hab.get("formula","40")
        stats_at = ta.get("stats",{})
        daño, detalle = evaluar_formula(formula, stats_at)
        daño = max(0, daño)

        # Aplicar daño
        hp_actual = td["stats"].get("HP",0)
        td["stats"]["HP"] = max(0, hp_actual - daño)
        guardar()

        txt = f"⚔️ {ta['personaje']} usó {nombre_hab} en {td['personaje']}: {daño} daño | {detalle}"
        if td["stats"]["HP"] == 0:
            txt += f" ☠️ {td['personaje']} derrotado!"

        estado["mensajes"].append({"autor":"Combate","texto":txt})
        estado["mensajes"] = estado["mensajes"][-100:]
        guardar()

        await broadcast({"tipo":"resultado_ataque",
                         "token_atacante":tid_atacante,
                         "token_defensor":tid_defensor,
                         "daño":daño,
                         "hp_restante":td["stats"]["HP"],
                         "tokens":estado["tokens"],
                         "texto_sistema":txt})

    # ─── GM: PLANTILLA ──────────────────────────────────────────
    elif tipo == "gm_set_plantilla" and es_gm:
        estado["plantilla"] = msg.get("plantilla", STATS_DEFAULT[:])
        guardar()
        await broadcast({"tipo":"plantilla_actualizada",
                         "plantilla":estado["plantilla"],
                         "plantilla_bloqueada":estado["plantilla_bloqueada"]})

    elif tipo == "gm_guardar_plantilla" and es_gm:
        nom_p = msg.get("nombre_plantilla","Sin nombre")
        estado["plantillas_guardadas"][nom_p] = list(estado["plantilla"])
        guardar()
        await enviar(ws,{"tipo":"plantillas_guardadas_actualizadas",
                         "plantillas_guardadas":estado["plantillas_guardadas"]})
        await enviar(ws,{"tipo":"chat","autor":"Sistema","texto":f"💾 Plantilla '{nom_p}' guardada."})

    elif tipo == "gm_cargar_plantilla" and es_gm:
        nom_p = msg.get("nombre_plantilla")
        if nom_p in estado["plantillas_guardadas"]:
            estado["plantilla"]           = list(estado["plantillas_guardadas"][nom_p])
            estado["plantilla_bloqueada"] = False
            guardar()
            await broadcast({"tipo":"plantilla_actualizada",
                             "plantilla":estado["plantilla"],
                             "plantilla_bloqueada":False})

    elif tipo == "gm_borrar_plantilla_guardada" and es_gm:
        nom_p = msg.get("nombre_plantilla")
        if nom_p in estado["plantillas_guardadas"]:
            del estado["plantillas_guardadas"][nom_p]
            guardar()
            await enviar(ws,{"tipo":"plantillas_guardadas_actualizadas",
                             "plantillas_guardadas":estado["plantillas_guardadas"]})

    elif tipo == "gm_desbloquear_plantilla" and es_gm:
        estado["plantilla_bloqueada"] = False
        guardar()
        await broadcast({"tipo":"plantilla_actualizada",
                         "plantilla":estado["plantilla"],
                         "plantilla_bloqueada":False})

    # ─── GM: MAPA ────────────────────────────────────────────────
    elif tipo == "gm_set_mapa" and es_gm:
        archivo = msg.get("archivo")  # None to clear
        estado["mapa_activo"] = archivo
        guardar()
        await broadcast({"tipo":"mapa_cambiado","archivo":archivo})

    # ─── USAR OBJETO ─────────────────────────────────────────────
    elif tipo == "usar_objeto":
        tid     = msg.get("token_id")
        nom_obj = msg.get("nombre_objeto")
        if not tid or tid not in estado["tokens"]: return
        t = estado["tokens"][tid]
        if t.get("owner") != nombre and not es_gm: return

        objetos = t.get("objetos", [])
        obj = next((o for o in objetos if o["nombre"] == nom_obj), None)
        if not obj: return

        efecto = obj.get("efecto", "")
        texto  = ""
        if efecto == "heal_hp":
            valor    = int(obj.get("valor", 0))
            hp_antes = t["stats"].get("HP", 0)
            hp_max   = t["stats"].get("HP_max", 100)
            t["stats"]["HP"] = min(hp_max, hp_antes + valor)
            texto = (f"💊 {t['personaje']} usó {nom_obj}: "
                     f"+{valor} PS ({hp_antes} → {t['stats']['HP']})")

        # Consume the object (single use)
        t["objetos"] = [o for o in objetos if o["nombre"] != nom_obj]

        # Sync object list back to the character record
        lista_p = estado["personajes"].get(nombre, [])
        p = next((x for x in lista_p if x["nombre"] == t.get("personaje")), None)
        if p:
            p["objetos"] = list(t["objetos"])

        estado["mensajes"].append({"autor":"Sistema","texto":texto})
        estado["mensajes"] = estado["mensajes"][-100:]
        guardar()
        await broadcast({"tipo":"objeto_usado","token_id":tid,
                         "tokens":estado["tokens"],"texto":texto})
        # Send updated character list to owner
        if lista_p:
            await enviar(ws,{"tipo":"lista_personajes","jugador":nombre,
                             "personajes":lista_p})

    # ─── GM: COMBATE ────────────────────────────────────────────
    elif tipo == "gm_iniciar_combate" and es_gm:
        stat_ini = next((s for s in estado["plantilla"]
                         if "agil" in s.get("nombre","").lower()), None)
        orden = []
        for tid, t in estado["tokens"].items():
            base     = t.get("stats",{}).get(stat_ini["nombre"] if stat_ini else "Agilidad", 0)
            roll,_   = tirar_simple("d20")
            orden.append((tid, base+roll))
        orden.sort(key=lambda x:x[1], reverse=True)
        estado["turno"]          = [x[0] for x in orden]
        estado["turno_actual"]   = 0
        estado["combate_activo"] = True
        guardar()
        primero = estado["turno"][0] if estado["turno"] else "?"
        await broadcast({"tipo":"combate_iniciado",
                         "turno":estado["turno"],"turno_actual":0,
                         "combate_activo":True,"tokens":estado["tokens"],
                         "texto_sistema":f"⚔️ ¡Combate! Turno de {primero}."})

    elif tipo == "gm_terminar_combate" and es_gm:
        estado["turno"]=[]; estado["turno_actual"]=0; estado["combate_activo"]=False
        guardar()
        await broadcast({"tipo":"combate_terminado","combate_activo":False,
                         "texto_sistema":"🏳️ Combate terminado."})

    elif tipo == "gm_siguiente_turno" and es_gm:
        if estado["turno"]:
            estado["turno_actual"] = (estado["turno_actual"]+1) % len(estado["turno"])
            guardar()
            sig = estado["turno"][estado["turno_actual"]]
            nom_sig = estado["tokens"].get(sig,{}).get("personaje",sig)
            await broadcast({"tipo":"turno_cambiado",
                             "turno_actual":estado["turno_actual"],
                             "turno":estado["turno"],
                             "texto_sistema":f"⏭️ Turno de {nom_sig}."})

# ── Ciclo de vida ────────────────────────────────────────────────
async def conexion(ws):
    print(f"[→] {ws.remote_address}")
    try:
        async for raw in ws:
            try:   await manejar(ws, json.loads(raw))
            except json.JSONDecodeError: pass
            except Exception as e:
                print(f"Error manejando mensaje: {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        info = clientes.pop(ws, {})
        nom  = info.get("nombre")
        if nom:
            print(f"[-] {nom}")
            await broadcast({"tipo":"chat","autor":"Sistema",
                             "texto":f"{nom} abandonó la sala."})

async def main():
    cargar()
    print(f"Servidor Mesa de Rol en ws://{HOST}:{PORT}")
    print(f"Contraseña GM: {GM_PASSWORD}\n")
    async with websockets.serve(conexion, HOST, PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
