import json
import sqlite3
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from regras import DB_PATH, KB, avaliar, carregar, fonte_padrao, valido
from simulador import MISSION_START
from simulador import ASTRONAUTS

# Atraso de comunicação só de ida, em minutos (aproximado, para a demo)
ATRASO_MIN = {"iss": (0, 0), "lunar_base": (0.02, 0.03), "mars_transit": (4, 24)}


def _astronauta(astro_id):
    return next((a for a in ASTRONAUTS if a["id"] == astro_id), None)


def _erro_astronauta(astro_id):
    return {"erro": f"astronauta '{astro_id}' não existe", "disponiveis": [a["id"] for a in ASTRONAUTS]}


def consultar_medicoes(astronauta: str, indicador: str | None = None, dias: int = 7,
                       fonte: str | None = None) -> dict:
    """Consulta as medições mais recentes de um astronauta.
    indicador: um nome de indicador, ou vazio para todos. dias: quantos dias para trás.
    fonte: vazio usa a fonte de dados mais recente do astronauta."""
    if _astronauta(astronauta) is None:
        return _erro_astronauta(astronauta)
    if indicador is not None and indicador not in KB:
        return {"erro": f"indicador '{indicador}' não existe", "disponiveis": list(KB)}

    with sqlite3.connect(DB_PATH) as conn:
        df, fonte = carregar(conn, astronauta, fonte)
    if df.empty:
        return {"erro": f"sem medições para {astronauta}"}
    if indicador:
        df = df[df["indicator"] == indicador]
    df = df[df["mission_day"] > df["mission_day"].max() - dias]

    saida = {}
    for ind, grupo in df.groupby("indicator"):
        grupo = grupo[grupo["value"].apply(lambda v: valido(ind, v))]
        saida[ind] = {"unidade": KB[ind]["unidade"],
                      "valores": [{"dia": int(r.mission_day) + 1, "valor": float(r.value)} for r in grupo.itertuples()]}
    return {"astronauta": astronauta, "fonte": fonte, "medicoes": saida}


def avaliar_status(astronauta: str, ate_dia: int | None = None, fonte: str | None = None) -> dict:
    """Roda o motor de regras e devolve verde, amarelo ou vermelho para cada indicador do astronauta,
    com os motivos de cada alerta e a tendência. ate_dia: avalia como se fosse aquele dia (vazio = mais recente)."""
    if _astronauta(astronauta) is None:
        return _erro_astronauta(astronauta)
    return avaliar(astronauta, fonte, ate_dia)


def explicar_indicador(indicador: str) -> dict:
    """Explica um indicador: o que é, por que o espaço o afeta, como medir e quais são as faixas."""
    if indicador not in KB:
        return {"erro": f"indicador '{indicador}' não existe", "disponiveis": list(KB)}
    info = KB[indicador]
    return {k: info[k] for k in ("nome", "unidade", "faixas", "perigo_nasa", "por_que_no_espaco", "como_medir")}


def recomendar_acoes(indicador: str, status: str) -> dict:
    """Devolve as ações recomendadas para um indicador em status amarelo ou vermelho, vindas da base de conhecimento."""
    if indicador not in KB:
        return {"erro": f"indicador '{indicador}' não existe", "disponiveis": list(KB)}
    if status not in ("amarelo", "vermelho"):
        return {"indicador": indicador, "status": status, "acoes": ["Nenhuma ação necessária. Continue a rotina de medições."]}
    info = KB[indicador]
    return {"indicador": indicador, "nome": info["nome"], "status": status,
            "por_que_no_espaco": info["por_que_no_espaco"], "acoes": info["acoes"][status],
            "avisar_medico_de_voo": status == "vermelho"}


def enviar_relatorio_terra(astronauta: str, resumo: str, urgencia: str = "normal") -> dict:
    """Coloca um relatório na fila de envio para o médico de voo na Terra, com o status atual anexado.
    urgencia: 'normal' ou 'alta'. Informa o atraso de comunicação até a mensagem chegar."""
    astro = _astronauta(astronauta)
    if astro is None:
        return _erro_astronauta(astronauta)
    if urgencia not in ("normal", "alta"):
        return {"erro": "urgencia deve ser 'normal' ou 'alta'"}

    lo, hi = ATRASO_MIN[astro["env"]]
    atraso = round(float(np.random.default_rng().uniform(lo, hi)), 2)
    agora = datetime.now()
    status = avaliar(astronauta)
    registro = pd.DataFrame([{
        "criado_em": f"{agora:%Y-%m-%d %H:%M:%S}", "astronauta": astronauta, "urgencia": urgencia,
        "resumo": resumo, "status_geral": status.get("status_geral"),
        "status_anexo": json.dumps(status, ensure_ascii=False),
        "atraso_min": atraso, "chegada_prevista": f"{agora + timedelta(minutes=atraso):%Y-%m-%d %H:%M:%S}",
    }])
    with sqlite3.connect(DB_PATH) as conn:
        registro.to_sql("ground_report", conn, if_exists="append", index=False)

    return {"enviado": True, "astronauta": astronauta, "urgencia": urgencia, "ambiente": astro["env"],
            "atraso_min": atraso, "chegada_prevista": registro.loc[0, "chegada_prevista"],
            "aviso": "A resposta da Terra levará pelo menos o dobro desse tempo. Siga as ações recomendadas enquanto isso."}


# Medições digitadas ou de testes entram na missão atual, no dia mais recente dela
def registrar_medicao(astronauta: str, indicador: str, valor: float, origem: str = "manual") -> dict:
    """Registra uma medição feita pelo astronauta (manual ou teste do app) e devolve o novo status do indicador."""
    if _astronauta(astronauta) is None:
        return _erro_astronauta(astronauta)
    if indicador not in KB or indicador == "radiation_cum_msv":
        return {"erro": f"indicador '{indicador}' não pode ser registrado manualmente"}
    if origem not in ("manual", "test"):
        return {"erro": "origem deve ser 'manual' ou 'test'"}
    if not valido(indicador, valor):
        return {"erro": f"valor {valor} {KB[indicador]['unidade']} é fisicamente impossível. Confira e meça de novo.",
                "rejeitada": True}

    with sqlite3.connect(DB_PATH) as conn:
        fonte = fonte_padrao(conn, astronauta) or "sem-missao"
        row = conn.execute("SELECT MAX(mission_day) FROM measurement WHERE astronaut_id = ? AND source = ?",
                           (astronauta, fonte)).fetchone()
        dia = int(row[0]) if row and row[0] is not None else 0
        conn.execute("INSERT INTO measurement (astronaut_id, timestamp, mission_day, phase, indicator, value, unit, source) "
                     "VALUES (?, ?, ?, 'mission', ?, ?, ?, ?)",
                     (astronauta, str(MISSION_START + timedelta(days=dia)), dia, indicador, float(valor),
                      KB[indicador]["unidade"], f"{origem}:{fonte}"))

    status = avaliar(astronauta)["indicadores"].get(indicador, {})
    return {"registrado": True, "astronauta": astronauta, "indicador": indicador, "valor": valor,
            "dia": dia + 1, "status": status}
