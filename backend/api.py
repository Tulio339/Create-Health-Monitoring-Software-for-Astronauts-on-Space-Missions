import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ferramentas_kb as kb
from engine import rules_engine
from motor import avaliar_astronauta, carregar_amostras, carregar_perfil, conectar, mission_start_date

FRONTEND = Path(__file__).parent / "frontend"

app = FastAPI(title="Monitor de Saúde de Astronautas — agente do knowledge-base")

# O frontend (Vite) roda em outra origem; sem isso o navegador bloqueia as chamadas mesmo com
# HTTP 200 (a aba Rede mostra sucesso, mas o JS não consegue ler a resposta). Libera qualquer
# porta em localhost/127.0.0.1 porque o Vite muda de porta sozinho se a 5173 já estiver ocupada.
app.add_middleware(CORSMiddleware, allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])


class Mensagem(BaseModel):
    astronauta: str
    mensagem: str


class Relatorio(BaseModel):
    case_id: str
    resumo: str
    urgencia: str = "normal"  # normal | alta


# As funções devolvem {"erro": ...} em vez de lançar exceção; aqui isso vira HTTP 400
def ok_ou_erro(resultado):
    if isinstance(resultado, dict) and "erro" in resultado:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    return resultado


# Alias achatado dos indicadores do frontend (frontend/src/types.ts) para o payload aninhado de
# telemetry.schema.json. glucose/amsler_marks/amsler_central não existem no schema original do
# knowledge-base (nenhuma diretiva os usa); são extensões nossas, guardadas mas nunca avaliadas
# por nenhum gatilho — ver FLUXO.md.
_ALIAS_METRICAS = {
    "heart_rate": "vitals.hr_rest", "bp_systolic": "vitals.bp_sys", "bp_diastolic": "vitals.bp_dia",
    "temperature": "vitals.core_temp_c", "spo2": "vitals.spo2_pct", "sleep": "vitals.sleep_hours",
    "mood": "behavioral.mood_score", "exercise": "fitness.exercise_minutes",
    "radiation": "radiation.cumulative_career_msv", "reaction_time": "cognitive.pvt_mean_rt_ms",
    "glucose": "lab.glucose_mg_dl", "amsler_marks": "ocular.amsler_marks", "amsler_central": "ocular.amsler_central",
}


def _get_path(amostra, dotted):
    node = amostra
    for chave in dotted.split("."):
        if not isinstance(node, dict) or chave not in node:
            return None
        node = node[chave]
    return node


def _set_path(amostra, dotted, valor):
    partes = dotted.split(".")
    node = amostra
    for chave in partes[:-1]:
        node = node.setdefault(chave, {})
    node[partes[-1]] = valor


def _flatten_ultima_amostra(conn, astronaut_id):
    amostras = carregar_amostras(conn, astronaut_id)
    if not amostras:
        return {}
    saida = {nome: _get_path(amostras[-1], caminho) for nome, caminho in _ALIAS_METRICAS.items()}
    if saida.get("mood") is not None:
        saida["mood"] = saida["mood"] / 2  # knowledge-base usa 0-10; o frontend usa 1-5
    return saida


# unidades do frontend (frontend/src/lib/classify.ts) para cada alias
_ALIAS_UNIDADES = {"heart_rate": "bpm", "bp_systolic": "mmHg", "bp_diastolic": "mmHg", "temperature": "°C",
                   "spo2": "%", "sleep": "h", "mood": "", "exercise": "min", "radiation": "mSv",
                   "reaction_time": "ms", "glucose": "mg/dL", "amsler_marks": "áreas", "amsler_central": "áreas"}


# fonte guardada na coluna `telemetry.source` -> MeasurementSource do frontend (types.ts)
def _fonte_frontend(fonte_bruta):
    if fonte_bruta and fonte_bruta.startswith("frontend:"):
        valor = fonte_bruta.removeprefix("frontend:")
        if valor in ("manual", "self_report", "cognitive_test", "vision_test", "device"):
            return valor
    return "wearable"  # cenario:*/sensores:* -> telemetria simulada


def _serie_medicoes_frontend(conn, astronaut_id):
    """Série completa no formato Measurement do frontend (frontend/src/types.ts).

    Duas conversões não são só renomeação:
    - mood: knowledge-base usa 0-10, o frontend usa 1-5 -> divide por 2.
    - radiation: knowledge-base guarda a dose ACUMULADA (radiation.cumulative_career_msv); o
      frontend soma cada leitura como se fosse a dose DO PERÍODO (ver dashboard.ts). Por isso aqui
      mandamos o incremento (dose_rate_msv_h × horas desde a amostra anterior), não o total.
    """
    amostras = carregar_amostras(conn, astronaut_id)
    medicoes = []
    ts_anterior = None
    for amostra in amostras:
        ts = amostra["timestamp"]
        fonte = _fonte_frontend(amostra.get("_source"))
        delta_h = 1.0
        if ts_anterior is not None:
            delta_h = max((rules_engine.parse_ts(ts) - rules_engine.parse_ts(ts_anterior)).total_seconds() / 3600, 0.0)
        ts_anterior = ts
        for nome, caminho in _ALIAS_METRICAS.items():
            if nome == "radiation":
                taxa = _get_path(amostra, "radiation.dose_rate_msv_h")
                valor = taxa * delta_h if taxa is not None else None
            else:
                valor = _get_path(amostra, caminho)
                if nome == "mood" and valor is not None:
                    valor = valor / 2
            if valor is not None:
                medicoes.append({"astronaut_id": astronaut_id, "indicator": nome, "value": round(valor, 3),
                                 "unit": _ALIAS_UNIDADES[nome], "timestamp": ts, "source": fonte})
    return medicoes


NIVEL_RANK = {"verde": 0, "atencao": 1, "alerta": 2, "critico": 3}


@app.get("/api/astronauts")
def listar_astronautas():
    conn = conectar()
    try:
        linhas = conn.execute("SELECT id, name, role, mission_name, mission_phase FROM astronaut").fetchall()
        saida = []
        for row in linhas:
            casos = conn.execute("SELECT level FROM case_ WHERE astronaut_id = ? AND status != 'encerrado'",
                                 (row["id"],)).fetchall()
            status_geral = max((c["level"] for c in casos), key=NIVEL_RANK.get, default="verde")
            saida.append({"id": row["id"], "nome": row["name"], "name": row["name"], "role": row["role"],
                          "mission_name": row["mission_name"], "mission_phase": row["mission_phase"],
                          "mission_start": mission_start_date(conn, row["id"]),
                          "status_geral": status_geral, "casos_abertos": len(casos),
                          **_flatten_ultima_amostra(conn, row["id"])})
        return saida
    finally:
        conn.close()


@app.get("/api/measurements")
def medicoes(astronaut_id: str | None = None):
    """Série completa no formato Measurement do frontend (ver _serie_medicoes_frontend)."""
    conn = conectar()
    try:
        ids = [astronaut_id] if astronaut_id else [r["id"] for r in conn.execute("SELECT id FROM astronaut")]
        saida = []
        for aid in ids:
            if carregar_perfil(conn, aid) is not None:
                saida.extend(_serie_medicoes_frontend(conn, aid))
        return saida
    finally:
        conn.close()


class MedicaoIn(BaseModel):
    astronaut_id: str
    indicator: str
    value: float
    unit: str = ""
    timestamp: str
    source: str = "manual"


@app.post("/api/measurements")
def registrar_medicoes(medicoes: list[MedicaoIn]):
    """Registra medições feitas pelo astronauta (formulário, teste de reação, grade de Amsler)
    como telemetria de verdade e roda o motor de regras na hora — pode abrir/atualizar um caso.

    Medições com o mesmo timestamp (ex.: sistólica+diastólica, ou marcas+centro do Amsler) viram
    UMA amostra só, como uma leitura real do telemetry.schema.json. radiation é um caso especial:
    o valor que chega é o incremento (dose desta leitura), mas o schema guarda dose ACUMULADA —
    ver _serie_medicoes_frontend para a conversão inversa (GET).
    """
    if not medicoes:
        return {"erro": "lista de medições vazia"}
    astro_id = medicoes[0].astronaut_id
    invalidos = [m.indicator for m in medicoes if m.indicator not in _ALIAS_METRICAS]
    if invalidos:
        return {"erro": f"indicador(es) {invalidos} não aceito(s) pelo backend", "disponiveis": sorted(_ALIAS_METRICAS)}
    if any(m.astronaut_id != astro_id for m in medicoes):
        return {"erro": "todas as medições de uma chamada devem ser do mesmo astronauta"}

    conn = conectar()
    try:
        if carregar_perfil(conn, astro_id) is None:
            raise HTTPException(status_code=404, detail=f"astronauta '{astro_id}' não existe")

        por_timestamp: dict[str, dict] = {}
        for m in medicoes:
            por_timestamp.setdefault(m.timestamp, {})[m.indicator] = m.value

        amostras_existentes = carregar_amostras(conn, astro_id)
        for ts in sorted(por_timestamp):
            valores = por_timestamp[ts]
            amostra = {}
            if "radiation" in valores:
                anteriores = [a for a in amostras_existentes if a["timestamp"] < ts]
                anterior = anteriores[-1] if anteriores else None
                cum_career = (_get_path(anterior, "radiation.cumulative_career_msv") or 0.0) if anterior else 0.0
                cum_mission = (_get_path(anterior, "radiation.cumulative_mission_msv") or 0.0) if anterior else 0.0
                delta_h = 1.0
                if anterior is not None:
                    delta_h = max((rules_engine.parse_ts(ts) - rules_engine.parse_ts(anterior["timestamp"]))
                                 .total_seconds() / 3600, 0.01)
                incremento = valores.pop("radiation")
                _set_path(amostra, "radiation.dose_rate_msv_h", round(incremento / delta_h, 4))
                _set_path(amostra, "radiation.cumulative_career_msv", round(cum_career + incremento, 3))
                _set_path(amostra, "radiation.cumulative_mission_msv", round(cum_mission + incremento, 3))
            if "mood" in valores:
                _set_path(amostra, _ALIAS_METRICAS["mood"], valores.pop("mood") * 2)  # frontend 1-5 -> knowledge-base 0-10
            for nome, valor in valores.items():
                _set_path(amostra, _ALIAS_METRICAS[nome], valor)

            fonte = f"frontend:{medicoes[0].source}"
            conn.execute("INSERT INTO telemetry (astronaut_id, timestamp, module, data_json, source) "
                        "VALUES (?, ?, 'manual', ?, ?)",
                        (astro_id, ts, json.dumps(amostra, ensure_ascii=False), fonte))
            amostras_existentes.append({**amostra, "astronaut_id": astro_id, "timestamp": ts, "module": "manual"})
        conn.commit()

        alertas, _ = avaliar_astronauta(astro_id, conn)
        return {"registrado": True, "astronaut_id": astro_id, "timestamps": sorted(por_timestamp),
                "alertas_ativos": [{"directive_id": a["directive_id"], "level": a["level"]} for a in alertas]}
    finally:
        conn.close()


@app.get("/api/baselines")
def baselines(astronaut_id: str | None = None):
    """Baseline no formato do frontend (astronaut_id, indicator, mean, std).

    O knowledge-base só guarda a média do pré-voo (profile.baseline); não existe desvio-padrão
    em lugar nenhum do modelo. Aproximamos std como 5% da média, só para o cálculo de "quantos
    desvios da sua linha de base" do frontend não quebrar — não é um valor medido.
    """
    conn = conectar()
    try:
        ids = [astronaut_id] if astronaut_id else [r["id"] for r in conn.execute("SELECT id FROM astronaut")]
        saida = []
        for aid in ids:
            perfil = carregar_perfil(conn, aid)
            if perfil is None:
                continue
            for nome, caminho in _ALIAS_METRICAS.items():
                if caminho not in perfil["baseline"]:
                    continue
                media = perfil["baseline"][caminho]
                if nome == "mood":
                    media = media / 2
                saida.append({"astronaut_id": aid, "indicator": nome, "mean": round(media, 3),
                             "std": round(abs(media) * 0.05, 3) or 0.1})
        return saida
    finally:
        conn.close()


@app.get("/api/astronauts/{astronauta}/status")
def status(astronauta: str):
    conn = conectar()
    try:
        perfil = carregar_perfil(conn, astronauta)
        if perfil is None:
            raise HTTPException(status_code=404, detail=f"astronauta '{astronauta}' não existe")
        contexto = ok_ou_erro(kb.get_open_cases(astronauta))
        contexto["indicadores"] = _flatten_ultima_amostra(conn, astronauta)
        return contexto
    finally:
        conn.close()


@app.get("/api/astronauts/{astronauta}/telemetry")
def telemetria(astronauta: str, metrics: str, window: str = "7d", resolution: str | None = None):
    """metrics: lista separada por vírgula (ex.: vitals.hr_rest,env.co2_mmhg)."""
    return ok_ou_erro(kb.get_telemetry(astronauta, metrics.split(","), window, resolution))


@app.get("/api/astronauts/{astronauta}/cases")
def casos_do_astronauta(astronauta: str):
    conn = conectar()
    try:
        if carregar_perfil(conn, astronauta) is None:
            raise HTTPException(status_code=404, detail=f"astronauta '{astronauta}' não existe")
        linhas = conn.execute("SELECT * FROM case_ WHERE astronaut_id = ? ORDER BY opened_at DESC",
                             (astronauta,)).fetchall()
        return [_serializar_caso(r) for r in linhas]
    finally:
        conn.close()


def _serializar_caso(row):
    d = dict(row)
    for campo in ("directives_json", "alert_ids_json", "hypotheses_json", "pending_questions_json",
                 "exit_criteria_status_json", "ground_packet_json"):
        bruto = d.pop(campo)
        padrao = None if campo == "ground_packet_json" else []
        d[campo[:-5]] = json.loads(bruto) if bruto else padrao
    return d


@app.get("/api/cases/{case_id}")
def caso(case_id: str):
    conn = conectar()
    try:
        row = conn.execute("SELECT * FROM case_ WHERE case_id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"caso '{case_id}' não existe")
        resultado = _serializar_caso(row)
        resultado["timeline"] = [dict(r) for r in conn.execute(
            "SELECT at, type, content FROM case_timeline WHERE case_id = ? ORDER BY id", (case_id,))]
        resultado["events"] = [dict(r) for r in conn.execute(
            "SELECT kind, created_at, recipient, level_or_priority, payload_json, answered, answer "
            "FROM case_event WHERE case_id = ? ORDER BY id", (case_id,))]
        return resultado
    finally:
        conn.close()


@app.get("/api/directives")
def listar_diretivas():
    from motor import DIRECTIVES
    return [{"id": d["id"], "title": d["title"], "hazards": d["hazards"]} for d in DIRECTIVES]


@app.get("/api/directives/{directive_id}")
def diretiva(directive_id: str):
    return ok_ou_erro(kb.get_directive(directive_id))


@app.post("/api/reports")
def novo_relatorio(r: Relatorio):
    prioridade = "emergencia" if r.urgencia == "alta" else "rotina"
    return ok_ou_erro(kb.send_ground_packet(
        r.case_id, one_liner=r.resumo, questions=[],
        default_plan_if_no_answer="Seguir as ações já recomendadas pela diretiva até a resposta do solo.",
        priority=prioridade))


@app.get("/api/reports")
def listar_relatorios():
    conn = conectar()
    try:
        linhas = conn.execute(
            "SELECT case_id, created_at, recipient, level_or_priority, payload_json FROM case_event "
            "WHERE kind = 'pacote_solo' ORDER BY created_at DESC LIMIT 20").fetchall()
        saida = []
        for r in linhas:
            d = dict(r)
            d["payload"] = json.loads(d.pop("payload_json"))
            saida.append(d)
        return saida
    finally:
        conn.close()


# O agente é criado na primeira mensagem e reaproveitado; o histórico fica em memória por astronauta
agente_cache = {}
historicos = {}


@app.post("/api/chat")
async def chat(m: Mensagem):
    try:
        if "agente" not in agente_cache:
            from agente import montar_agente
            agente_cache["agente"], _ = await montar_agente("investigacao")
        historico = historicos.setdefault(m.astronauta, [
            {"role": "user", "content": f"Eu sou o astronauta {m.astronauta}."},
            {"role": "assistant", "content": f"Entendido, {m.astronauta}. Como posso ajudar?"},
        ])
        historico.append({"role": "user", "content": m.mensagem})
        resultado = await agente_cache["agente"].ainvoke({"messages": historico})
        historicos[m.astronauta] = resultado["messages"]
        return {"resposta": resultado["messages"][-1].content}
    except Exception as erro:
        agente_cache.clear()
        raise HTTPException(status_code=503, detail=f"Agente indisponível ({type(erro).__name__}). "
                                                    "Confira se o Ollama está aberto com o modelo baixado.")


if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")

    @app.get("/")
    def pagina():
        return FileResponse(FRONTEND / "index.html")


# Sem reload: no Windows o modo reload impede o agente de abrir o servidor MCP como subprocesso
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
