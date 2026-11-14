import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv()

# Troque pelo .env sem mexer no código, ex.: MODELO=google_genai:gemini-2.5-flash
MODELO = os.getenv("MODELO", "ollama:qwen2.5:7b")

SERVIDOR_PATH = Path(__file__).with_name("servidor_mcp.py")

# O agente sobe o servidor MCP como subprocesso e conversa com ele por stdio
SERVIDORES = {
    "saude": {
        "command": sys.executable,
        "args": [str(SERVIDOR_PATH)],
        "transport": "stdio",
    }
}


# O MCP esconde o erro do servidor ("Connection closed"); importar antes revela o traceback real
def verificar_servidor():
    teste = subprocess.run([sys.executable, "-c", "import servidor_mcp"], cwd=SERVIDOR_PATH.parent,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
    if teste.returncode != 0:
        print("O servidor MCP não consegue iniciar. Erro real:\n")
        print(teste.stderr)
        sys.exit(1)


# Único modo: agente de investigação/acompanhamento de casos (knowledge-base/agent/).
# As 15 tools são as de ferramentas_kb.py (ver servidor_mcp.py).
MODOS = {
    "investigacao": {"diretiva": "diretiva_investigacao", "tools": None,
                     "boas_vindas": "Agente de acompanhamento de saúde a bordo. Diga quem você é "
                                    "(ex.: sou o AST-C) e pergunte como está."},
}


async def montar_agente(modo="investigacao"):
    client = MultiServerMCPClient(SERVIDORES)
    permitidas = MODOS[modo]["tools"]
    tools = await client.get_tools()
    if permitidas is not None:
        tools = [t for t in tools if t.name in permitidas]
    diretiva = await client.get_prompt("saude", MODOS[modo]["diretiva"])
    return create_agent(model=MODELO, tools=tools, system_prompt=diretiva[0].content), tools


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--modo", choices=list(MODOS), default="investigacao")
    modo = parser.parse_args().modo

    verificar_servidor()
    agente, tools = await montar_agente(modo)
    print(f"Modelo: {MODELO} | Tools: {[t.name for t in tools]}")
    print(MODOS[modo]["boas_vindas"] + " Digite 'sair' para encerrar.")

    historico = []
    while (pedido := input("\n> ").strip()).lower() != "sair":
        historico.append({"role": "user", "content": pedido})
        resultado = await agente.ainvoke({"messages": historico})
        historico = resultado["messages"]
        print(historico[-1].content)


if __name__ == "__main__":
    asyncio.run(main())
