"""
Motor: adapta o SQLite do backend para o motor de regras determinístico do
knowledge-base (engine/rules_engine.py) e gerencia o ciclo de vida dos casos
(agent/investigation-workflow.md: aberto -> investigando -> acompanhando ->
[aguardando_solo] -> encerrado).

A IA nunca decide se um alerta dispara; isso é sempre este módulo + rules_engine.
"""
import json
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
KB_ROOT = BASE_DIR.parent / "knowledge-base"
if not KB_ROOT.exists():
    raise RuntimeError(f"knowledge-base/ não encontrado em {KB_ROOT} (esperado como pasta irmã de backend/)")
sys.path.insert(0, str(KB_ROOT))
from engine import rules_engine  # noqa: E402

DB_PATH = BASE_DIR / "dados_simulados" / "health.db"
DIRECTIVES = rules_engine.load_directives()
DIRECTIVES_BY_ID = {d["id"]: d for d in DIRECTIVES}

# protocols/escalation.md: modo de operação por latência de comunicação (uma via)
LATENCIA_ASSISTIDO_S = 10
LATENCIA_HIBRIDO_S = 300


def construir_evaluator(amostras, baseline):
    """rules_engine.Evaluator espera '_ts' já calculado em cada amostra (normalmente feito
    por rules_engine.run()); como chamamos o Evaluator diretamente, fazemos isso aqui."""
    for amostra in amostras:
        amostra["_ts"] = rules_engine.parse_ts(amostra["timestamp"])
    return rules_engine.Evaluator(amostras, baseline)


def operating_mode(comm_latency_s, comm_available=1):
    if not comm_available or comm_latency_s is None or comm_latency_s > LATENCIA_HIBRIDO_S:
        return "autonomo"
    if comm_latency_s < LATENCIA_ASSISTIDO_S:
        return "assistido"
    return "hibrido"


def conectar():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS astronaut (
        id TEXT PRIMARY KEY, name TEXT, role TEXT, age INTEGER,
        mission_name TEXT, mission_phase TEXT, baseline_json TEXT,
        first_sample_ts TEXT, mission_day_base INTEGER
    );
    CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT, astronaut_id TEXT, timestamp TEXT,
        module TEXT, data_json TEXT, source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_astro_ts ON telemetry (astronaut_id, timestamp);
    CREATE TABLE IF NOT EXISTS alert (
        alert_id TEXT PRIMARY KEY, astronaut_id TEXT, directive_id TEXT,
        level TEXT, created_at TEXT, data_json TEXT
    );
    CREATE TABLE IF NOT EXISTS case_ (
        case_id TEXT PRIMARY KEY, astronaut_id TEXT, status TEXT, level TEXT,
        directives_json TEXT, alert_ids_json TEXT, opened_at TEXT, closed_at TEXT,
        summary TEXT, hypotheses_json TEXT, pending_questions_json TEXT,
        next_review_at TEXT, follow_up_until TEXT, exit_criteria_status_json TEXT,
        ground_packet_json TEXT
    );
    CREATE TABLE IF NOT EXISTS case_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, at TEXT, type TEXT, content TEXT
    );
    CREATE TABLE IF NOT EXISTS case_event (
        id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, kind TEXT, created_at TEXT,
        recipient TEXT, level_or_priority TEXT, payload_json TEXT,
        answered INTEGER DEFAULT 0, answer TEXT, answered_at TEXT
    );
    """)
    conn.commit()


# ── telemetria ────────────────────────────────────────────────────────────

def carregar_amostras(conn, astronaut_id):
    """Reconstrói a lista de amostras aninhadas (formato telemetry.schema.json) a partir do banco.
    `_source` (coluna de proveniência, ex. 'cenario:x', 'frontend:manual') vem junto, prefixado com
    `_` pra não colidir com nenhum campo do schema; rules_engine ignora chaves que não conhece."""
    rows = conn.execute("SELECT timestamp, module, data_json, source FROM telemetry "
                        "WHERE astronaut_id = ? ORDER BY timestamp", (astronaut_id,)).fetchall()
    amostras = []
    for r in rows:
        amostra = json.loads(r["data_json"])
        amostra.update(astronaut_id=astronaut_id, timestamp=r["timestamp"], module=r["module"], _source=r["source"])
        amostras.append(amostra)
    return amostras


def ultima_amostra(conn, astronaut_id):
    rows = carregar_amostras(conn, astronaut_id)
    return rows[-1] if rows else None


def carregar_perfil(conn, astronaut_id):
    row = conn.execute("SELECT * FROM astronaut WHERE id = ?", (astronaut_id,)).fetchone()
    if row is None:
        return None
    return {"astronaut_id": row["id"], "name": row["name"], "role": row["role"], "age": row["age"],
            "mission_name": row["mission_name"], "mission_phase": row["mission_phase"],
            "baseline": json.loads(row["baseline_json"] or "{}"),
            "first_sample_ts": row["first_sample_ts"], "mission_day_base": row["mission_day_base"]}


def mission_day_atual(conn, astronaut_id):
    """Dia de missão calculado a partir da amostra mais recente, nunca cacheado (evita ficar desatualizado)."""
    perfil = carregar_perfil(conn, astronaut_id)
    ultima = ultima_amostra(conn, astronaut_id)
    if perfil is None or ultima is None or not perfil["first_sample_ts"]:
        return perfil["mission_day_base"] if perfil else None
    inicio = rules_engine.parse_ts(perfil["first_sample_ts"])
    agora = rules_engine.parse_ts(ultima["timestamp"])
    return perfil["mission_day_base"] + (agora - inicio).days


def mission_start_date(conn, astronaut_id):
    """Data (AAAA-MM-DD) do dia de missão 1, calculada de trás pra frente a partir da primeira
    amostra recebida e do dia de missão que o perfil diz que ela representa."""
    perfil = carregar_perfil(conn, astronaut_id)
    if perfil is None or not perfil["first_sample_ts"] or perfil["mission_day_base"] is None:
        return None
    inicio_amostras = rules_engine.parse_ts(perfil["first_sample_ts"])
    from datetime import timedelta
    return (inicio_amostras - timedelta(days=perfil["mission_day_base"])).date().isoformat()


# ── motor de regras ──────────────────────────────────────────────────────

def avaliar_astronauta(astronaut_id, conn=None):
    """Roda todas as diretivas contra os dados atuais do astronauta. Persiste os alertas e
    abre/atualiza casos. Devolve (alertas, correlacoes)."""
    fechar = conn is None
    conn = conn or conectar()
    try:
        amostras = carregar_amostras(conn, astronaut_id)
        perfil = carregar_perfil(conn, astronaut_id)
        if not amostras or perfil is None:
            return [], {}
        alertas, correlacoes = rules_engine.run(amostras, perfil, DIRECTIVES)
        agora = amostras[-1]["timestamp"]
        for alerta in alertas:
            conn.execute("INSERT INTO alert (alert_id, astronaut_id, directive_id, level, created_at, data_json) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (alerta["alert_id"], astronaut_id, alerta["directive_id"], alerta["level"],
                         agora, json.dumps(alerta, ensure_ascii=False)))
        conn.commit()
        _abrir_ou_atualizar_casos(conn, astronaut_id, alertas, correlacoes, agora)
        return alertas, correlacoes
    finally:
        if fechar:
            conn.close()


def _log_timeline(conn, case_id, at, tipo, conteudo):
    conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, ?, ?)",
                (case_id, at, tipo, conteudo))


def _caso_aberto_para_diretiva(conn, astronaut_id, directive_id):
    rows = conn.execute("SELECT * FROM case_ WHERE astronaut_id = ? AND status != 'encerrado'",
                        (astronaut_id,)).fetchall()
    for row in rows:
        if directive_id in json.loads(row["directives_json"]):
            return row
    return None


def _caso_correlacionado(conn, astronaut_id, directive_id, correlacoes):
    """Acha um caso aberto que compartilha um sintoma relatado com esta diretiva (agrupa no mesmo caso)."""
    diretivas_relacionadas = {d for ids in correlacoes.values() if directive_id in ids for d in ids}
    if not diretivas_relacionadas:
        return None
    rows = conn.execute("SELECT * FROM case_ WHERE astronaut_id = ? AND status != 'encerrado'",
                        (astronaut_id,)).fetchall()
    for row in rows:
        if diretivas_relacionadas & set(json.loads(row["directives_json"])):
            return row
    return None


NIVEL_RANK = {"atencao": 0, "alerta": 1, "critico": 2}


def _abrir_ou_atualizar_casos(conn, astronaut_id, alertas, correlacoes, agora):
    for alerta in alertas:
        if not alerta.get("opens_case"):
            continue
        directive_id, level = alerta["directive_id"], alerta["level"]
        caso = (_caso_aberto_para_diretiva(conn, astronaut_id, directive_id)
                or _caso_correlacionado(conn, astronaut_id, directive_id, correlacoes))
        if caso is None:
            case_id = f"CASE-{uuid.uuid4().hex[:8]}"
            diretiva = DIRECTIVES_BY_ID[directive_id]
            resumo = f"{diretiva['title']}: {alerta['triggers'][0]['description']}"
            conn.execute("INSERT INTO case_ (case_id, astronaut_id, status, level, directives_json, "
                        "alert_ids_json, opened_at, summary) VALUES (?, ?, 'aberto', ?, ?, ?, ?, ?)",
                        (case_id, astronaut_id, level, json.dumps([directive_id]),
                         json.dumps([alerta["alert_id"]]), agora, resumo))
            _log_timeline(conn, case_id, agora, "alerta", resumo)
            if level == "critico":
                _log_timeline(conn, case_id, agora, "nota_agente",
                              "Nível crítico na abertura: notificação imediata à tripulação é obrigatória "
                              "(ver notify_crew_medical) antes de investigar.")
        else:
            case_id = caso["case_id"]
            diretivas = set(json.loads(caso["directives_json"])) | {directive_id}
            alert_ids = json.loads(caso["alert_ids_json"]) + [alerta["alert_id"]]
            novo_nivel = level if NIVEL_RANK[level] > NIVEL_RANK[caso["level"]] else caso["level"]
            conn.execute("UPDATE case_ SET directives_json = ?, alert_ids_json = ?, level = ? WHERE case_id = ?",
                        (json.dumps(sorted(diretivas)), json.dumps(alert_ids), novo_nivel, case_id))
            if novo_nivel != caso["level"]:
                _log_timeline(conn, case_id, agora, "mudanca_nivel",
                              f"{caso['level']} -> {novo_nivel} ({directive_id})")
            elif directive_id not in json.loads(caso["directives_json"]):
                _log_timeline(conn, case_id, agora, "nota_agente",
                              f"Correlacionado com {directive_id} (sintoma em comum)")
    conn.commit()


def reavaliar_casos_pendentes(astronaut_id, conn=None):
    """Segue o passo 4 de investigation-workflow.md: para cada caso com reavaliação vencida,
    roda evaluate_exit_criteria. Critérios atendidos fecha (ou manda pra aguardando_solo se crítico,
    que exige registro do CMO/médico de voo antes de encerrar)."""
    fechar = conn is None
    conn = conn or conectar()
    try:
        amostras = carregar_amostras(conn, astronaut_id)
        perfil = carregar_perfil(conn, astronaut_id)
        if not amostras or perfil is None:
            return []
        agora_ts = rules_engine.parse_ts(amostras[-1]["timestamp"])
        evaluator = construir_evaluator(amostras, perfil.get("baseline", {}))
        pendentes = conn.execute(
            "SELECT * FROM case_ WHERE astronaut_id = ? AND status != 'encerrado' AND next_review_at IS NOT NULL",
            (astronaut_id,)).fetchall()
        atualizados = []
        for caso in pendentes:
            if rules_engine.parse_ts(caso["next_review_at"]) > agora_ts:
                continue
            diretiva_id = json.loads(caso["directives_json"])[0]
            status_saida = rules_engine.evaluate_exit_criteria(DIRECTIVES_BY_ID[diretiva_id], evaluator)
            atendidos = bool(status_saida) and all(c["met"] for c in status_saida)
            conn.execute("UPDATE case_ SET exit_criteria_status_json = ?, next_review_at = NULL WHERE case_id = ?",
                        (json.dumps(status_saida, ensure_ascii=False), caso["case_id"]))
            if atendidos and caso["level"] == "critico":
                conn.execute("UPDATE case_ SET status = 'aguardando_solo' WHERE case_id = ?", (caso["case_id"],))
                _log_timeline(conn, caso["case_id"], amostras[-1]["timestamp"], "nota_agente",
                              "Critérios de saída atendidos, mas nível crítico exige registro do CMO/médico de voo "
                              "antes de encerrar.")
            elif atendidos:
                conn.execute("UPDATE case_ SET status = 'encerrado', closed_at = ? WHERE case_id = ?",
                            (amostras[-1]["timestamp"], caso["case_id"]))
                _log_timeline(conn, caso["case_id"], amostras[-1]["timestamp"], "nota_agente",
                              "Critérios de saída atendidos. Caso encerrado.")
            else:
                _log_timeline(conn, caso["case_id"], amostras[-1]["timestamp"], "nota_agente",
                              "Reavaliado: critérios de saída ainda não atendidos.")
            atualizados.append(caso["case_id"])
        conn.commit()
        return atualizados
    finally:
        if fechar:
            conn.close()
