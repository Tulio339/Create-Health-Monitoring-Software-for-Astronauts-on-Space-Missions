"""Monta o system prompt do agente a partir de knowledge-base/agent/system-prompt.md.

Isolado de servidor_mcp.py de propósito: não depende do pacote `mcp`, então dá pra testar sem
precisar instalar as dependências do agente.
"""
import re

from motor import KB_ROOT


def diretiva_investigacao_texto():
    """system-prompt.md menos o cabeçalho explicativo e a seção '## Contexto do caso atual' —
    esse contexto (dia de missão, modo de operação, casos abertos) agora vem de get_open_cases,
    chamado sob demanda, em vez de preenchido uma vez num template estático."""
    texto = (KB_ROOT / "agent" / "system-prompt.md").read_text(encoding="utf-8")
    texto = texto.split("---\n", 1)[1]  # tira o cabeçalho "> Use o texto abaixo..."
    texto = texto.split("## Contexto do caso atual")[0]
    texto = re.sub(r"\{\{mission_name\}\}", "atual", texto)
    texto = re.sub(r"\{\{comm_latency_s\}\}\s*s agora,\s*modo \*\*\{\{operating_mode\}\}\*\*",
                   "o que varia ao longo da missão; chame `get_open_cases` para saber a latência e o modo agora",
                   texto)
    return texto.strip() + (
        "\n\n## Contexto do caso atual\n"
        "Chame `get_open_cases(astronaut_id)` logo no início de toda investigação e de novo se a "
        "conversa demorar: ele devolve o dia/fase da missão, o modo de operação (latência de "
        "comunicação), os casos abertos e os alertas mais recentes. Nunca assuma esses dados — eles "
        "mudam ao longo da missão e da conversa."
    )
