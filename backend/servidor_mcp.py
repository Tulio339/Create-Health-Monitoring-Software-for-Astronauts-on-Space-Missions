import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from assistente import (avaliar_status, consultar_medicoes, enviar_relatorio_terra,
                        explicar_indicador, recomendar_acoes)
from ferramentas import RANGES, exportar_lote, gerar_cenario, gerar_indicador, listar_lotes
from simulador import ASTRONAUTS, INDICATORS, SCENARIOS

DIRETIVAS = Path(__file__).parent / "diretivas"

mcp = FastMCP("monitor-saude-astronautas")

# Tools do agente gerador de dados
for funcao in (gerar_indicador, gerar_cenario, listar_lotes, exportar_lote):
    mcp.tool()(funcao)

# Tools do assistente de saúde
for funcao in (avaliar_status, consultar_medicoes, explicar_indicador, recomendar_acoes, enviar_relatorio_terra):
    mcp.tool()(funcao)


# Prompts: as diretivas que definem o comportamento de cada agente
@mcp.prompt()
def diretiva_gerador() -> str:
    """Diretiva do agente gerador de dados simulados de saúde de astronautas."""
    return (DIRETIVAS / "DIRETIVA.md").read_text(encoding="utf-8")


@mcp.prompt()
def diretiva_assistente() -> str:
    """Diretiva do assistente de saúde que conversa com o astronauta."""
    return (DIRETIVAS / "DIRETIVA_ASSISTENTE.md").read_text(encoding="utf-8")


# Resources: dados só de leitura que o agente consulta para não adivinhar nomes
@mcp.resource("saude://astronautas")
def listar_astronautas() -> str:
    """Astronautas disponíveis na simulação."""
    return json.dumps([{"id": a["id"], "nome": a["name"], "ambiente": a["env"]} for a in ASTRONAUTS],
                      ensure_ascii=False)


@mcp.resource("saude://indicadores")
def listar_indicadores() -> str:
    """Indicadores de saúde com unidade e faixa normal."""
    return json.dumps({name: {"unidade": INDICATORS[name]["unit"], "faixa_normal": list(RANGES[name])}
                       for name in RANGES}, ensure_ascii=False)


@mcp.resource("saude://cenarios")
def listar_cenarios() -> str:
    """Cenários de problemas de saúde que podem ser simulados."""
    return json.dumps(list(SCENARIOS), ensure_ascii=False)


if __name__ == "__main__":
    mcp.run()
