"""
Implementação Python das ferramentas especificadas em knowledge-base/agent/tools.json
(mais get_open_cases, que não está no tools.json: cobre o contexto dinâmico que o
agent/system-prompt.md esperava receber pré-preenchido em "## Contexto do caso atual" —
aqui o agente busca isso sob demanda, como todas as outras ferramentas).

Convenção: toda função devolve {"erro": ...} em vez de lançar exceção (mesmo padrão de
assistente.py), para a API e o agente tratarem igual.
"""
import json
import re
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

from motor import (DIRECTIVES_BY_ID, KB_ROOT, carregar_amostras, carregar_perfil, conectar,
                   construir_evaluator, operating_mode)
from engine import rules_engine

_STOPWORDS = {"de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na",
             "para", "com", "que", "por", "um", "uma", "ou", "se"}

TIMELINE_TYPES = {"alerta", "pergunta", "resposta_astronauta", "acao", "dado_coletado",
                  "nota_agente", "mensagem_solo", "resposta_solo", "mudanca_nivel"}

MEDKIT = {
    "desfibrilador_dea": {"nome": "Desfibrilador (DEA)", "estoque_pct": 100,
                          "referencia": "DIR-CARD-001 (crítico)"},
    "oxigenio_suplementar": {"nome": "Oxigênio suplementar", "estoque_pct": 85,
                             "referencia": "DIR-CARD-001 (crítico)"},
    "antitermico": {"nome": "Antitérmico", "estoque_pct": 60, "referencia": "DIR-ENV-002 (alerta)"},
    "analgesico": {"nome": "Analgesia (kit médico)", "estoque_pct": 70, "referencia": "DIR-GRAV-002 (crítico)"},
    "soro_fisiologico": {"nome": "Soro fisiológico", "estoque_pct": 55, "referencia": "DIR-ENV-002 (crítico)"},
    "kit_sutura": {"nome": "Kit de sutura", "estoque_pct": 90, "referencia": "uso geral"},
}


def _sem_acento(texto):
    return unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()


def _astronauta(astronaut_id, conn=None):
    fechar = conn is None
    conn = conn or conectar()
    try:
        return carregar_perfil(conn, astronaut_id)
    finally:
        if fechar:
            conn.close()


def _erro_astronauta(astronaut_id):
    conn = conectar()
    disponiveis = [r[0] for r in conn.execute("SELECT id FROM astronaut")]
    conn.close()
    return {"erro": f"astronauta '{astronaut_id}' não existe", "disponiveis": disponiveis}


def _caso(conn, case_id):
    row = conn.execute("SELECT * FROM case_ WHERE case_id = ?", (case_id,)).fetchone()
    return row


def _erro_caso(case_id):
    return {"erro": f"caso '{case_id}' não existe"}


def _agora_astronauta(conn, astronaut_id):
    amostras = carregar_amostras(conn, astronaut_id)
    return amostras[-1]["timestamp"] if amostras else datetime.utcnow().isoformat() + "Z"


# ── telemetria e baseline ────────────────────────────────────────────────

def get_telemetry(astronaut_id: str, metrics: list[str], window: str, resolution: str | None = None) -> dict:
    """Retorna a série temporal de uma ou mais métricas de um astronauta numa janela de tempo
    (ex.: window="7d"). resolution (ex.: "1d") agrega os pontos em baldes com a média."""
    conn = conectar()
    try:
        amostras = carregar_amostras(conn, astronaut_id)
        if not amostras:
            return {"erro": f"sem telemetria para {astronaut_id}"}
        janela = rules_engine.parse_window(window)
        agora = rules_engine.parse_ts(amostras[-1]["timestamp"])
        inicio = agora - janela if janela else None

        serie = {}
        for metric in metrics:
            pontos = []
            for amostra in amostras:
                ts = rules_engine.parse_ts(amostra["timestamp"])
                if inicio and ts < inicio:
                    continue
                valor = rules_engine.get_path(amostra, metric)
                if valor is not None:
                    pontos.append((ts, valor))
            if resolution:
                pontos = _bucketizar(pontos, rules_engine.parse_window(resolution))
            serie[metric] = [{"timestamp": ts.isoformat(), "valor": valor} for ts, valor in pontos]
        return {"astronaut_id": astronaut_id, "window": window, "series": serie}
    finally:
        conn.close()


def _bucketizar(pontos, duracao):
    if not pontos or duracao is None:
        return pontos
    baldes = {}
    for ts, valor in pontos:
        chave = ts - (ts - pontos[0][0]) % duracao
        baldes.setdefault(chave, []).append(valor)
    return [(chave, sum(vs) / len(vs)) for chave, vs in sorted(baldes.items())]


def get_baseline(astronaut_id: str) -> dict:
    """Retorna os valores de baseline pré-voo e o perfil do astronauta."""
    perfil = _astronauta(astronaut_id)
    if perfil is None:
        return _erro_astronauta(astronaut_id)
    return {"astronaut_id": astronaut_id, "name": perfil["name"], "role": perfil["role"],
            "age": perfil["age"], "mission_name": perfil["mission_name"], "baseline": perfil["baseline"]}


# ── diretivas e base de conhecimento ─────────────────────────────────────

def get_directive(directive_id: str) -> dict:
    """Retorna a diretiva completa (gatilhos, investigação, ações, critério de saída)."""
    if directive_id not in DIRECTIVES_BY_ID:
        return {"erro": f"diretiva '{directive_id}' não existe", "disponiveis": sorted(DIRECTIVES_BY_ID)}
    return DIRECTIVES_BY_ID[directive_id]


HAZARD_POR_ARQUIVO = {"radiation": "RAD", "isolation-confinement": "ISO", "distance-from-earth": "DIST",
                      "gravity": "GRAV", "hostile-environment": "ENV"}


def _titulo(linhas, default):
    return next((l.lstrip("#").strip() for l in linhas if l.lstrip().startswith("#")), default)


def _chunks_conhecimento():
    chunks = []
    for pasta, tem_hazard in ((KB_ROOT / "hazards", True), (KB_ROOT / "protocols", False)):
        for arquivo in sorted(pasta.glob("*.md")):
            hazard = HAZARD_POR_ARQUIVO.get(arquivo.stem) if tem_hazard else None
            texto = arquivo.read_text(encoding="utf-8")
            texto = re.sub(r"\A---\n.*?\n---\n", "", texto, count=1, flags=re.S)  # tira o front-matter YAML
            secoes = re.split(r"\n(?=## )", texto)
            titulo_doc = _titulo(secoes[0].splitlines(), arquivo.stem)
            for secao in secoes:
                linhas = secao.strip().splitlines()
                if not linhas:
                    continue
                titulo_secao = _titulo(linhas, titulo_doc)
                chunks.append({"fonte": f"{arquivo.relative_to(KB_ROOT)} — {titulo_secao}",
                               "hazard": hazard, "titulo_doc": titulo_doc, "texto": secao})
    return chunks


_CHUNKS_CACHE = None


def search_knowledge(query: str, hazard_filter: list[str] | None = None, top_k: int = 5) -> dict:
    """Busca por palavra-chave (sem acento) na base de conhecimento: hazards/*.md e protocols/*.md.
    Devolve trechos com a fonte, ordenados por relevância."""
    global _CHUNKS_CACHE
    if _CHUNKS_CACHE is None:
        _CHUNKS_CACHE = _chunks_conhecimento()
    termos = set(_sem_acento(query).split()) - _STOPWORDS
    if not termos:
        return {"erro": "query vazia"}

    resultados = []
    for chunk in _CHUNKS_CACHE:
        if hazard_filter and chunk["hazard"] is not None and chunk["hazard"] not in hazard_filter:
            continue
        texto_normalizado = _sem_acento(chunk["texto"])
        pontuacao = sum(texto_normalizado.count(termo) for termo in termos)
        if pontuacao > 0:
            resultados.append((pontuacao, chunk))
    resultados.sort(key=lambda par: -par[0])
    return {"query": query, "resultados": [{"fonte": c["fonte"], "trecho": c["texto"], "pontuacao": p}
                                            for p, c in resultados[:top_k]]}


_SYMPTOMS = None


def lookup_symptom(symptom_code: str) -> dict:
    """Consulta o índice de sintomas e retorna as diretivas/condições candidatas e o que verificar."""
    global _SYMPTOMS
    if _SYMPTOMS is None:
        import yaml
        _SYMPTOMS = yaml.safe_load((KB_ROOT / "symptoms" / "index.yaml").read_text(encoding="utf-8"))
    if symptom_code not in _SYMPTOMS:
        return {"erro": f"sintoma '{symptom_code}' não existe", "disponiveis": sorted(_SYMPTOMS)}
    return {"symptom_code": symptom_code, **_SYMPTOMS[symptom_code]}


def evaluate_exit_criteria(astronaut_id: str, directive_id: str) -> dict:
    """Roda o motor de regras para checar se os critérios de saída da diretiva estão atendidos agora."""
    if directive_id not in DIRECTIVES_BY_ID:
        return {"erro": f"diretiva '{directive_id}' não existe", "disponiveis": sorted(DIRECTIVES_BY_ID)}
    conn = conectar()
    try:
        amostras = carregar_amostras(conn, astronaut_id)
        perfil = carregar_perfil(conn, astronaut_id)
        if not amostras or perfil is None:
            return _erro_astronauta(astronaut_id)
        evaluator = construir_evaluator(amostras, perfil.get("baseline", {}))
        criterios = rules_engine.evaluate_exit_criteria(DIRECTIVES_BY_ID[directive_id], evaluator)
        return {"astronaut_id": astronaut_id, "directive_id": directive_id, "criterios": criterios,
                "todos_atendidos": bool(criterios) and all(c["met"] for c in criterios)}
    finally:
        conn.close()


# ── contexto dinâmico do caso (substitui o template {{...}} do system-prompt.md) ─────────

def get_open_cases(astronaut_id: str) -> dict:
    """Contexto atual do astronauta: dia/fase da missão, modo de operação (latência de comunicação),
    casos abertos e alertas mais recentes. Chame isso no início de toda investigação."""
    conn = conectar()
    try:
        perfil = carregar_perfil(conn, astronaut_id)
        if perfil is None:
            return _erro_astronauta(astronaut_id)
        amostras = carregar_amostras(conn, astronaut_id)
        ultima = amostras[-1] if amostras else {}
        mission = ultima.get("mission", {})
        from motor import mission_day_atual
        casos = conn.execute("SELECT * FROM case_ WHERE astronaut_id = ? AND status != 'encerrado'",
                             (astronaut_id,)).fetchall()
        alertas = conn.execute("SELECT * FROM alert WHERE astronaut_id = ? ORDER BY created_at DESC LIMIT 5",
                               (astronaut_id,)).fetchall()
        return {
            "astronaut_id": astronaut_id, "mission_name": perfil["mission_name"],
            "mission_day": mission_day_atual(conn, astronaut_id), "mission_phase": perfil["mission_phase"],
            "comm_latency_s": mission.get("comm_latency_s"),
            "operating_mode": operating_mode(mission.get("comm_latency_s"), mission.get("comm_available", 1)),
            "casos_abertos": [{"case_id": c["case_id"], "status": c["status"], "level": c["level"],
                               "directives": json.loads(c["directives_json"]), "summary": c["summary"]}
                              for c in casos],
            "alertas_recentes": [{"alert_id": a["alert_id"], "directive_id": a["directive_id"],
                                  "level": a["level"], "created_at": a["created_at"]} for a in alertas],
        }
    finally:
        conn.close()


# ── ações do agente sobre um caso ────────────────────────────────────────

def ask_astronaut(astronaut_id: str, case_id: str, questions: list[dict]) -> dict:
    """Envia perguntas para o app do astronauta (no máx. 3, de preferência estruturadas)."""
    conn = conectar()
    try:
        if _astronauta(astronaut_id, conn) is None:
            return _erro_astronauta(astronaut_id)
        if _caso(conn, case_id) is None:
            return _erro_caso(case_id)
        if len(questions) > 3:
            return {"erro": "no máximo 3 perguntas por vez"}
        agora = _agora_astronauta(conn, astronaut_id)
        cursor = conn.execute("INSERT INTO case_event (case_id, kind, created_at, payload_json) "
                              "VALUES (?, 'pergunta', ?, ?)",
                              (case_id, agora, json.dumps(questions, ensure_ascii=False)))
        resumo = "; ".join(q["text"] for q in questions)
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'pergunta', ?)",
                    (case_id, agora, resumo))
        conn.commit()
        return {"question_id": cursor.lastrowid, "status": "aguardando_resposta", "perguntas": questions}
    finally:
        conn.close()


def send_astronaut_message(astronaut_id: str, case_id: str, level: str, message: str,
                           actions: list[str] | None = None) -> dict:
    """Mostra uma mensagem/recomendação no app do astronauta."""
    conn = conectar()
    try:
        if _astronauta(astronaut_id, conn) is None:
            return _erro_astronauta(astronaut_id)
        if _caso(conn, case_id) is None:
            return _erro_caso(case_id)
        agora = _agora_astronauta(conn, astronaut_id)
        payload = {"message": message, "actions": actions or []}
        conn.execute("INSERT INTO case_event (case_id, kind, created_at, level_or_priority, payload_json) "
                     "VALUES (?, 'mensagem_astronauta', ?, ?, ?)",
                     (case_id, agora, level, json.dumps(payload, ensure_ascii=False)))
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'acao', ?)",
                    (case_id, agora, f"[{level}] {message}"))
        conn.commit()
        return {"enviado": True, "astronaut_id": astronaut_id, "case_id": case_id, "level": level}
    finally:
        conn.close()


def update_case(case_id: str, status: str | None = None, level: str | None = None,
                hypotheses: list[dict] | None = None, summary: str | None = None,
                close_reason: str | None = None) -> dict:
    """Atualiza status, nível, hipóteses ou resumo do caso."""
    conn = conectar()
    try:
        caso = _caso(conn, case_id)
        if caso is None:
            return _erro_caso(case_id)
        STATUS_VALIDOS = {"aberto", "investigando", "acompanhando", "aguardando_solo", "encerrado"}
        if status is not None and status not in STATUS_VALIDOS:
            return {"erro": f"status deve ser um de {sorted(STATUS_VALIDOS)}"}
        agora = _agora_astronauta(conn, caso["astronaut_id"])
        campos, valores = [], []
        if status is not None:
            campos.append("status = ?"); valores.append(status)
            if status == "encerrado":
                campos.append("closed_at = ?"); valores.append(agora)
        if level is not None:
            campos.append("level = ?"); valores.append(level)
        if hypotheses is not None:
            campos.append("hypotheses_json = ?"); valores.append(json.dumps(hypotheses, ensure_ascii=False))
        if summary is not None:
            campos.append("summary = ?"); valores.append(summary)
        if campos:
            conn.execute(f"UPDATE case_ SET {', '.join(campos)} WHERE case_id = ?", (*valores, case_id))
        if level is not None and level != caso["level"]:
            conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'mudanca_nivel', ?)",
                        (case_id, agora, f"{caso['level']} -> {level}"))
        if status is not None and status != caso["status"]:
            texto = f"status: {caso['status']} -> {status}" + (f" ({close_reason})" if close_reason else "")
            conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'nota_agente', ?)",
                        (case_id, agora, texto))
        conn.commit()
        return {"atualizado": True, "case_id": case_id, "status": status or caso["status"], "level": level or caso["level"]}
    finally:
        conn.close()


def log_case_note(case_id: str, type: str, content: str) -> dict:
    """Registra uma nota na linha do tempo do caso (decisão, raciocínio, dado coletado)."""
    if type not in TIMELINE_TYPES:
        return {"erro": f"type deve ser um de {sorted(TIMELINE_TYPES)}"}
    conn = conectar()
    try:
        caso = _caso(conn, case_id)
        if caso is None:
            return _erro_caso(case_id)
        agora = _agora_astronauta(conn, caso["astronaut_id"])
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, ?, ?)",
                    (case_id, agora, type, content))
        conn.commit()
        return {"registrado": True, "case_id": case_id}
    finally:
        conn.close()


def schedule_followup(case_id: str, prazo: str, reason: str | None = None) -> dict:
    """Agenda a próxima reavaliação automática do caso. prazo: ex. 30m, 6h, 1d (equivale a 'in' na spec)."""
    duracao = rules_engine.parse_window(prazo)
    if duracao is None:
        return {"erro": "prazo inválido, use algo como 30m, 6h ou 1d"}
    conn = conectar()
    try:
        caso = _caso(conn, case_id)
        if caso is None:
            return _erro_caso(case_id)
        agora = rules_engine.parse_ts(_agora_astronauta(conn, caso["astronaut_id"]))
        proxima = (agora + duracao).isoformat()
        conn.execute("UPDATE case_ SET next_review_at = ? WHERE case_id = ?", (proxima, case_id))
        conteudo = f"Próxima reavaliação em {prazo}" + (f": {reason}" if reason else "")
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'nota_agente', ?)",
                    (case_id, agora.isoformat(), conteudo))
        conn.commit()
        return {"case_id": case_id, "next_review_at": proxima}
    finally:
        conn.close()


def notify_crew_medical(case_id: str, recipients: list[str], message: str) -> dict:
    """Notifica o CMO e/ou o comandante a bordo."""
    if not set(recipients) <= {"cmo", "comandante"}:
        return {"erro": "recipients deve ser uma lista com 'cmo' e/ou 'comandante'"}
    conn = conectar()
    try:
        caso = _caso(conn, case_id)
        if caso is None:
            return _erro_caso(case_id)
        agora = _agora_astronauta(conn, caso["astronaut_id"])
        conn.execute("INSERT INTO case_event (case_id, kind, created_at, recipient, payload_json) "
                     "VALUES (?, 'notificacao_tripulacao', ?, ?, ?)",
                     (case_id, agora, ",".join(recipients), json.dumps({"message": message}, ensure_ascii=False)))
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'acao', ?)",
                    (case_id, agora, f"Notificação a {recipients}: {message}"))
        conn.commit()
        return {"notificado": True, "case_id": case_id, "recipients": recipients}
    finally:
        conn.close()


# atraso de comunicação só de ida, por modo de operação (protocols/escalation.md)
_ATRASO_PADRAO_S = {"assistido": 5, "hibrido": 120, "autonomo": 900}


def send_ground_packet(case_id: str, one_liner: str, questions: list[str], default_plan_if_no_answer: str,
                       recipient: str | None = None, priority: str = "rotina",
                       answer_deadline: str | None = None) -> dict:
    """Envia o pacote assíncrono do caso para o solo (médico de voo, psicólogo, especialistas)."""
    conn = conectar()
    try:
        caso = _caso(conn, case_id)
        if caso is None:
            return _erro_caso(case_id)
        amostras = carregar_amostras(conn, caso["astronaut_id"])
        ultima = amostras[-1] if amostras else {}
        mission = ultima.get("mission", {})
        agora_dt = rules_engine.parse_ts(_agora_astronauta(conn, caso["astronaut_id"]))
        latencia = mission.get("comm_latency_s")
        modo = operating_mode(latencia, mission.get("comm_available", 1))
        atraso_s = latencia if latencia is not None else _ATRASO_PADRAO_S[modo]
        chegada = (agora_dt + timedelta(seconds=atraso_s)).isoformat()

        payload = {"one_liner": one_liner, "questions": questions,
                  "default_plan_if_no_answer": default_plan_if_no_answer, "recipient": recipient,
                  "priority": priority, "answer_deadline": answer_deadline}
        conn.execute("INSERT INTO case_event (case_id, kind, created_at, recipient, level_or_priority, payload_json) "
                     "VALUES (?, 'pacote_solo', ?, ?, ?, ?)",
                     (case_id, agora_dt.isoformat(), recipient, priority, json.dumps(payload, ensure_ascii=False)))
        conn.execute("UPDATE case_ SET status = 'aguardando_solo', ground_packet_json = ? WHERE case_id = ?",
                    (json.dumps(payload, ensure_ascii=False), case_id))
        conn.execute("INSERT INTO case_timeline (case_id, at, type, content) VALUES (?, ?, 'mensagem_solo', ?)",
                    (case_id, agora_dt.isoformat(), one_liner))
        conn.commit()
        return {"enviado": True, "case_id": case_id, "modo_operacao": modo, "atraso_ida_s": atraso_s,
                "chegada_prevista": chegada,
                "aviso": "A resposta do solo leva pelo menos o dobro desse atraso. Siga o plano padrão até lá."}
    finally:
        conn.close()


def check_medkit(item: str | None = None) -> dict:
    """Consulta o estoque de itens do kit médico de bordo. Vazio = inventário completo."""
    if item is None:
        return {"itens": MEDKIT}
    if item not in MEDKIT:
        return {"erro": f"item '{item}' não existe", "disponiveis": sorted(MEDKIT)}
    return {"item": item, **MEDKIT[item]}
