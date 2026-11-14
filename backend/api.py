import sqlite3
from pathlib import Path

import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from assistente import (avaliar_status, consultar_medicoes, enviar_relatorio_terra,
                        explicar_indicador, recomendar_acoes, registrar_medicao)
from regras import DB_PATH, KB
from simulador import ASTRONAUTS

FRONTEND = Path(__file__).parent / "frontend"

app = FastAPI(title="Monitor de Saúde de Astronautas")


class Medicao(BaseModel):
    astronauta: str
    indicador: str
    valor: float
    origem: str = "manual"


class Relatorio(BaseModel):
    astronauta: str
    resumo: str
    urgencia: str = "normal"


class Mensagem(BaseModel):
    astronauta: str
    mensagem: str


# As funções devolvem {"erro": ...} em vez de lançar exceção; aqui isso vira HTTP 400
def ok_ou_erro(resultado):
    if isinstance(resultado, dict) and "erro" in resultado:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    return resultado


@app.get("/api/astronauts")
def listar_astronautas():
    saida = []
    for a in ASTRONAUTS:
        status = avaliar_status(a["id"])
        saida.append({"id": a["id"], "nome": a["name"], "ambiente": a["env"],
                      "status_geral": status.get("status_geral", "sem dados")})
    return saida


@app.get("/api/astronauts/{astronauta}/status")
def status(astronauta: str):
    resultado = ok_ou_erro(avaliar_status(astronauta))
    # Anexa ações e nome em português a cada indicador, para o painel não precisar de outra chamada
    for indicador, item in resultado["indicadores"].items():
        item["nome"] = KB[indicador]["nome"]
        if item["status"] != "verde":
            item["acoes"] = recomendar_acoes(indicador, item["status"])["acoes"]
    return resultado


@app.get("/api/astronauts/{astronauta}/measurements")
def medicoes(astronauta: str, indicador: str | None = None, dias: int = 30):
    return ok_ou_erro(consultar_medicoes(astronauta, indicador, dias))


@app.get("/api/indicators")
def listar_indicadores():
    return {k: {"nome": v["nome"], "unidade": v["unidade"], "como_medir": v["como_medir"]} for k, v in KB.items()}


@app.get("/api/indicators/{indicador}")
def indicador(indicador: str):
    return ok_ou_erro(explicar_indicador(indicador))


@app.post("/api/measurements")
def nova_medicao(m: Medicao):
    return ok_ou_erro(registrar_medicao(m.astronauta, m.indicador, m.valor, m.origem))


@app.post("/api/reports")
def novo_relatorio(r: Relatorio):
    return ok_ou_erro(enviar_relatorio_terra(r.astronauta, r.resumo, r.urgencia))


@app.get("/api/reports")
def listar_relatorios():
    with sqlite3.connect(DB_PATH) as conn:
        try:
            df = pd.read_sql("SELECT criado_em, astronauta, urgencia, resumo, status_geral, atraso_min, chegada_prevista "
                             "FROM ground_report ORDER BY criado_em DESC LIMIT 20", conn)
        except pd.errors.DatabaseError:
            return []
    return df.to_dict(orient="records")


# O agente é criado na primeira mensagem e reaproveitado; o histórico fica em memória por astronauta
agente_cache = {}
historicos = {}


@app.post("/api/chat")
async def chat(m: Mensagem):
    try:
        if "agente" not in agente_cache:
            from agente import montar_agente
            agente_cache["agente"], _ = await montar_agente("assistente")
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
        raise HTTPException(status_code=503, detail=f"Assistente indisponível ({type(erro).__name__}). "
                                                    "Confira se o Ollama está aberto com o modelo baixado.")


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def pagina():
    return FileResponse(FRONTEND / "index.html")


# Sem reload: no Windows o modo reload impede o agente de abrir o servidor MCP como subprocesso
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
