"""
Script de Migración Histórica: Excel (1_asistencia_informada) -> PostgreSQL (app_rrhh.b_1_asistencias)
Adaptado para tablas con 'nombre' y 'apellido' separados en la base de datos.
"""

import os
import re
import sys
import unicodedata
import uuid
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

RUTA_ARCHIVO_EXCEL = "BBDD_asist_roster.xlsx"
NOMBRE_HOJA = "1_asistencia_informada"
MODO_SIMULACION_DRY_RUN = "--commit" not in sys.argv


# [FN-07.15] Generar UUID v5 determinista e idempotente para registros sin identificador
def generar_uuid_asistencia_estable(
    id_usuario: str,
    fecha_iso: str,
    activo_franco: str,
    lugar: str,
    id_proyecto: str | None,
    hora_ini: str | None,
    hora_fin: str | None,
    horas_ded: float,
    ocurrencia: int = 1
) -> str:
    semilla = f"{id_usuario}|{fecha_iso}|{activo_franco}|{lugar}|{id_proyecto or ''}|{hora_ini or ''}|{hora_fin or ''}|{horas_ded}|{ocurrencia}"
    return str(uuid.uuid5(uuid.NAMESPACE_OID, semilla))

USUARIOS_EXCLUSIVOS_ROSTER = [
    "Gabriel Juarez",
    "Maximiliano Kromm",
    "Fernando Aimar",
    "Norberto José Luis Botto",
    "Ivan Emanuel Altamirano",
    "Alejo Ferrero",
    "Facundo Ezequiel Calgaro",
    "Rodolfo Julian Lescano",
    "Agustina Ferrante",
    "José María Zufiaurre"
]


def normalizar_texto(texto) -> str:
    if pd.isna(texto) or texto is None:
        return ""
    limpio = str(texto).strip().lower().replace(",", " ")
    limpio = unicodedata.normalize("NFD", limpio)
    limpio = "".join(c for c in limpio if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", limpio)


def tokens_nombre(texto) -> frozenset:
    norm = normalizar_texto(texto)
    return frozenset(norm.split(" ")) if norm else frozenset()


TOKENS_USUARIOS_ROSTER = {tokens_nombre(nombre) for nombre in USUARIOS_EXCLUSIVOS_ROSTER}


def es_usuario_exclusivo_roster(nombre_empleado: str) -> bool:
    tok_emp = tokens_nombre(nombre_empleado)
    if not tok_emp:
        return False
    for tok_roster in TOKENS_USUARIOS_ROSTER:
        if tok_emp == tok_roster or (len(tok_emp) >= 2 and tok_emp.issubset(tok_roster)):
            return True
    return False


def limpiar_hora(valor):
    if pd.isna(valor) or valor is None or str(valor).strip() == "":
        return None
    texto = str(valor).strip()
    if re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", texto):
        return texto
    return None


def buscar_proyecto_por_servicio(servicio_raw, mapa_exacto: dict, lista_proyectos_bd: list):
    serv_norm = normalizar_texto(servicio_raw)
    if not serv_norm:
        return None

    if serv_norm.startswith("dedicado al area") or serv_norm in (
        "ingenieria", "rrhh", "aplicaciones", "nucleo", "ventas y marketing",
        "licencia - medica", "licencia medica", "vacaciones", "campo", "tiempo dedicado al area"
    ):
        return None

    if serv_norm in mapa_exacto:
        return mapa_exacto[serv_norm]

    match_cod = re.match(r"^(\d{3}-[a-z]+-[a-z]+(?:-\d+)?)", serv_norm)
    if match_cod:
        prefijo = match_cod.group(1)
        for p in lista_proyectos_bd:
            if prefijo in p["denom_norm"]:
                return p["id_proyecto"]

    for p in lista_proyectos_bd:
        if len(serv_norm) >= 10 and (serv_norm in p["denom_norm"] or p["denom_norm"] in serv_norm):
            return p["id_proyecto"]

    return None


def traducir_fila_a_esquema_pg(
    fila,
    tiene_proyecto: bool,
    es_emp_roster: bool,
    lugar_habitual_emp: str
) -> dict:
    tipo_ocf_raw = str(fila.get("tipo_ocf") or "").strip().lower()
    feriado_raw = str(fila.get("feriado") or "NO").strip().upper()
    servicio_raw = str(fila.get("servicio") or "").strip().lower()

    if tipo_ocf_raw == "roster":
        activo_franco = "activo"
        lugar = "roster"
    elif tipo_ocf_raw == "campo":
        activo_franco = "activo"
        lugar = "obra"
    elif tipo_ocf_raw == "oficina":
        activo_franco = "activo"
        lugar = "oficina"
    elif tipo_ocf_raw == "franco obra trabajado":
        activo_franco = "activo"
        lugar = "obra"
    elif tipo_ocf_raw == "franco":
        activo_franco = "franco"
        lugar = "roster" if es_emp_roster else (lugar_habitual_emp if lugar_habitual_emp in ("oficina", "obra") else "oficina")
    elif tipo_ocf_raw == "vacaciones":
        activo_franco = "vacaciones"
        lugar = lugar_habitual_emp if lugar_habitual_emp in ("oficina", "obra") else "oficina"
    elif tipo_ocf_raw == "licencia":
        activo_franco = "licencia"
        lugar = lugar_habitual_emp if lugar_habitual_emp in ("oficina", "obra") else "oficina"
    else:
        activo_franco = "activo"
        lugar = "oficina"

    if activo_franco != "activo":
        tipo_dia = "dia_normal"
    else:
        if feriado_raw == "SI":
            tipo_dia = "feriado_trabajado"
        elif "trabajado" in tipo_ocf_raw or "trabajado" in servicio_raw:
            tipo_dia = "franco_trabajado"
        else:
            tipo_dia = "dia_normal"

    es_dedicado_area = (
        "dedicado al area" in normalizar_texto(servicio_raw)
        or servicio_raw in ("ingenieria", "ingeniería", "rrhh", "aplicaciones", "nucleo", "núcleo", "ventas y marketing")
    )
    if tiene_proyecto or lugar in ("obra", "roster"):
        dedicado_a = "proyectos"
    elif es_dedicado_area:
        dedicado_a = "areas"
    else:
        dedicado_a = "proyectos"

    return {
        "activo_franco": activo_franco,
        "lugar": lugar,
        "tipo_dia": tipo_dia,
        "dedicado_a": dedicado_a
    }


def ejecutar_migracion():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ ERROR: Falta la variable DATABASE_URL en el archivo .env.")
        return

    if not os.path.exists(RUTA_ARCHIVO_EXCEL):
        print(f"❌ ERROR: No se encontró el archivo {RUTA_ARCHIVO_EXCEL}.")
        return

    print(f"📂 Leyendo archivo Excel: {RUTA_ARCHIVO_EXCEL}...")
    df = pd.read_excel(RUTA_ARCHIVO_EXCEL, sheet_name=NOMBRE_HOJA)
    df["fecha_dt"] = pd.to_datetime(df["fecha"]).dt.date
    df = df.sort_values(by=["fecha_dt", "empleado"]).reset_index(drop=True)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # 1. Consultar usuarios y su lugar_habitual desde a_1_sueldos_base
            cursor.execute("""
                SELECT 
                    u.id_usuario, 
                    TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS nombre_completo, 
                    u.correo,
                    COALESCE(s.lugar_habitual::TEXT, 'oficina') AS lugar_habitual
                FROM app_rrhh.a_1_usuarios u
                LEFT JOIN app_rrhh.a_1_sueldos_base s ON u.id_usuario = s.id_usuario;
            """)
            usuarios_bd = cursor.fetchall()

            mapa_por_email = {}
            mapa_por_nombre = {}
            mapa_por_tokens = {}
            mapa_lugar_habitual = {}

            for u in usuarios_bd:
                uid = str(u["id_usuario"])
                mapa_lugar_habitual[uid] = u["lugar_habitual"]
                if u["correo"]:
                    mapa_por_email[normalizar_texto(u["correo"])] = uid
                if u["nombre_completo"]:
                    mapa_por_nombre[normalizar_texto(u["nombre_completo"])] = uid
                    mapa_por_tokens[tokens_nombre(u["nombre_completo"])] = uid

            # Consultar proyectos de app_proyectos.b_1_proyectos_servicios usando la columna real 'codificacion_serv'
            cursor.execute("SELECT id_proyecto, codificacion_serv FROM app_proyectos.b_1_proyectos_servicios;")
            proyectos_bd = cursor.fetchall()

            ids_proyectos_validos = set()
            mapa_proyecto_exacto = {}
            lista_proyectos_norm = []

            for p in proyectos_bd:
                pid = str(p["id_proyecto"]).lower()
                ids_proyectos_validos.add(pid)
                denom_norm = normalizar_texto(p["codificacion_serv"])
                if denom_norm:
                    mapa_proyecto_exacto[denom_norm] = pid
                    lista_proyectos_norm.append({"id_proyecto": pid, "denom_norm": denom_norm})

            insertados = 0
            omitidos_duplicados = 0
            empleados_no_encontrados = set()
            proyectos_recuperados_por_nombre = 0
            ocurrencias_por_dia = {}

            sql_insert = """
                INSERT INTO app_rrhh.b_1_asistencias (
                    id_asistencia, id_usuario, fecha, activo_franco, lugar,
                    tipo_dia, dedicado_a, hora_inicio, hora_fin, horas_dedicadas,
                    id_proyecto, costo_manual, fecha_hora_carga
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, COALESCE(%s, CURRENT_TIMESTAMP)
                )
                ON CONFLICT (id_asistencia) DO NOTHING;
            """

            for _, fila in df.iterrows():
                nom_raw = str(fila.get("empleado") or "")
                mail_norm = normalizar_texto(fila.get("usuario_mail"))
                nom_norm = normalizar_texto(nom_raw)
                tok_emp = tokens_nombre(nom_raw)

                id_usuario = (
                    mapa_por_email.get(mail_norm)
                    or mapa_por_nombre.get(nom_norm)
                    or mapa_por_tokens.get(tok_emp)
                )

                if not id_usuario:
                    empleados_no_encontrados.add(f"{nom_raw} ({fila.get('usuario_mail')})")
                    continue

                id_proy_raw = fila.get("id_proyecto")
                id_proyecto_final = None

                if pd.notna(id_proy_raw) and str(id_proy_raw).strip() != "":
                    candidato_id = str(id_proy_raw).strip().lower()
                    if candidato_id in ids_proyectos_validos:
                        id_proyecto_final = candidato_id

                if id_proyecto_final is None:
                    id_encontrado = buscar_proyecto_por_servicio(
                        fila.get("servicio"),
                        mapa_proyecto_exacto,
                        lista_proyectos_norm
                    )
                    if id_encontrado:
                        id_proyecto_final = id_encontrado
                        proyectos_recuperados_por_nombre += 1

                es_roster = es_usuario_exclusivo_roster(nom_raw)
                lugar_hab = mapa_lugar_habitual.get(id_usuario, "oficina")

                traduccion = traducir_fila_a_esquema_pg(
                    fila=fila,
                    tiene_proyecto=(id_proyecto_final is not None),
                    es_emp_roster=es_roster,
                    lugar_habitual_emp=lugar_hab
                )

                hora_ini = limpiar_hora(fila.get("hora_inicio"))
                hora_fin = limpiar_hora(fila.get("hora_fin"))
                horas_ded = float(fila.get("horas")) if pd.notna(fila.get("horas")) else 0.0
                horas_ded = max(0.0, min(24.0, horas_ded))

                clave_ocurrencia = (id_usuario, str(fila["fecha_dt"]))
                ocurrencias_por_dia[clave_ocurrencia] = ocurrencias_por_dia.get(clave_ocurrencia, 0) + 1
                ocurrencia_num = ocurrencias_por_dia[clave_ocurrencia]

                raw_id = str(fila.get("id_asistencia") or "").strip()
                id_asistencia = None
                if raw_id and raw_id.lower() != "nan":
                    try:
                        id_asistencia = str(uuid.UUID(raw_id))
                    except Exception:
                        id_asistencia = None

                if not id_asistencia:
                    id_asistencia = generar_uuid_asistencia_estable(
                        id_usuario=id_usuario,
                        fecha_iso=str(fila["fecha_dt"]),
                        activo_franco=traduccion["activo_franco"],
                        lugar=traduccion["lugar"],
                        id_proyecto=id_proyecto_final,
                        hora_ini=hora_ini,
                        hora_fin=hora_fin,
                        horas_ded=horas_ded,
                        ocurrencia=ocurrencia_num
                    )

                fecha_hora_carga = None
                if pd.notna(fila.get("fecha_hora")):
                    fecha_hora_carga = pd.to_datetime(fila.get("fecha_hora")).to_pydatetime()

                cursor.execute(
                    sql_insert,
                    (
                        id_asistencia,
                        id_usuario,
                        fila["fecha_dt"],
                        traduccion["activo_franco"],
                        traduccion["lugar"],
                        traduccion["tipo_dia"],
                        traduccion["dedicado_a"],
                        hora_ini,
                        hora_fin,
                        horas_ded,
                        id_proyecto_final,
                        fecha_hora_carga
                    )
                )

                if cursor.rowcount > 0:
                    insertados += 1
                else:
                    omitidos_duplicados += 1

            if MODO_SIMULACION_DRY_RUN:
                conn.rollback()
                print("\n🧪 [MODO SIMULACIÓN] Rollback ejecutado. No se modificó la base de datos (pase el argumento --commit para persistir).")
            else:
                conn.commit()
                print("\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE! (Modo --commit activo)")

            print(f"   ✔️ Registros insertados: {insertados}")
            print(f"   🔍 Proyectos vinculados buscando por servicio: {proyectos_recuperados_por_nombre}")
            print(f"   ⏩ Duplicados omitidos: {omitidos_duplicados}")

            if empleados_no_encontrados:
                print("\n⚠️ Empleados no encontrados en a_1_usuarios:")
                for emp in sorted(empleados_no_encontrados):
                    print(f"   - {emp}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR DURANTE LA MIGRACIÓN: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    ejecutar_migracion()