import json

from mcp.server.fastmcp import FastMCP

import ferramentas_kb as kb
from motor import DIRECTIVES
from prompt_kb import diretiva_investigacao_texto

mcp = FastMCP("monitor-saude-astronautas")

# As 11 ferramentas de knowledge-base/agent/tools.json + get_open_cases (contexto dinâmico do
# caso, no lugar do "## Contexto do caso atual" que o prompt original esperava pré-preenchido)
FERRAMENTAS = (
    kb.get_telemetry, kb.get_baseline, kb.get_directive, kb.search_knowledge, kb.lookup_symptom,
    kb.evaluate_exit_criteria, kb.get_open_cases, kb.ask_astronaut, kb.send_astronaut_message,
    kb.update_case, kb.log_case_note, kb.schedule_followup, kb.notify_crew_medical,
    kb.send_ground_packet, kb.check_medkit,
)
for funcao in FERRAMENTAS:
    mcp.tool()(funcao)


@mcp.prompt()
def diretiva_investigacao() -> str:
    """Diretiva do agente de acompanhamento de saúde (knowledge-base/agent/system-prompt.md)."""
    return diretiva_investigacao_texto()


@mcp.resource("saude://astronautas")
def listar_astronautas() -> str:
    """Astronautas disponíveis no banco de dados."""
    from motor import conectar
    conn = conectar()
    linhas = conn.execute("SELECT id, name, role, mission_name, mission_phase FROM astronaut").fetchall()
    conn.close()
    return json.dumps([dict(r) for r in linhas], ensure_ascii=False)


@mcp.resource("saude://diretivas")
def listar_diretivas() -> str:
    """Diretivas clínicas disponíveis (knowledge-base/directives/*.yaml)."""
    return json.dumps([{"id": d["id"], "title": d["title"], "hazards": d["hazards"]} for d in DIRECTIVES],
                      ensure_ascii=False)


@mcp.resource("saude://hazards")
def listar_hazards() -> str:
    """Os 5 riscos do NASA Human Research Program monitorados pelo sistema."""
    return json.dumps({"RAD": "Radiação espacial", "ISO": "Isolamento e confinamento",
                       "DIST": "Distância da Terra", "GRAV": "Campos de gravidade alterados",
                       "ENV": "Ambientes hostis/fechados"}, ensure_ascii=False)


if __name__ == "__main__":
    mcp.run()
