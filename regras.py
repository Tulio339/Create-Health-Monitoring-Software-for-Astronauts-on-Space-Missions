import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from simulador import INDICATORS

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "dados_simulados" / "health.db"
KB = json.loads((BASE_DIR / "conhecimento" / "indicadores.json").read_text(encoding="utf-8"))

NIVEL = {"verde": 0, "amarelo": 1, "vermelho": 2}
JANELA_TENDENCIA = 7
Z_FORA_DO_NORMAL = 2.5
SALTO_RADIACAO_MSV = 5.0


def pior(*status):
    return max(status, key=NIVEL.get)


# Usa a missão mais recente do astronauta (ex.: a dos sensores que está rodando), ignorando registros manuais
def fonte_padrao(conn, astronauta):
    row = conn.execute("SELECT source FROM measurement WHERE astronaut_id = ? "
                       "AND source NOT LIKE 'manual:%' AND source NOT LIKE 'test:%' ORDER BY rowid DESC LIMIT 1",
                       (astronauta,)).fetchone()
    return row[0] if row else None


# Junta os dados da missão com o que o astronauta registrou à mão nela (source "manual:<fonte>" ou "test:<fonte>")
def carregar(conn, astronauta, fonte=None, ate_dia=None):
    fonte = fonte or fonte_padrao(conn, astronauta)
    df = pd.read_sql("SELECT mission_day, indicator, value, unit, source FROM measurement "
                     "WHERE astronaut_id = ? AND source IN (?, ?, ?) AND phase = 'mission' "
                     "ORDER BY mission_day, rowid",
                     conn, params=(astronauta, fonte, f"manual:{fonte}", f"test:{fonte}"))
    df = df.reset_index(drop=True)
    if ate_dia is not None:
        df = df[df["mission_day"] <= ate_dia - 1]
    return df, fonte


def carregar_baseline(conn, astronauta):
    try:
        df = pd.read_sql("SELECT indicator, mean, std FROM baseline WHERE astronaut_id = ?", conn, params=(astronauta,))
    except pd.errors.DatabaseError:
        return {}
    return {r.indicator: (r.mean, r.std) for r in df.itertuples()}


# Rejeita valores fisicamente impossíveis, como 366 °C (erro de digitação)
def valido(indicador, valor):
    if indicador == "radiation_cum_msv":
        return valor >= 0
    cfg = INDICATORS.get(indicador)
    return cfg is None or cfg["min"] <= valor <= cfg["max"]


def classificar_faixa(indicador, valor):
    faixas = KB[indicador]["faixas"]
    for status in ("verde", "amarelo"):
        lo, hi = faixas[status]
        if lo <= valor <= hi:
            return status
    return "vermelho"


def avaliar_indicador(indicador, serie, baseline):
    valor = float(serie.iloc[-1])
    status = classificar_faixa(indicador, valor)
    motivos = []
    if status == "amarelo":
        motivos.append(f"valor {valor} fora da faixa normal")
    elif status == "vermelho":
        motivos.append(f"valor {valor} fora da faixa segura")
    tendencia = "estável"

    if indicador == "radiation_cum_msv":
        if len(serie) >= 2 and serie.iloc[-1] - serie.iloc[-2] > SALTO_RADIACAO_MSV:
            status = pior(status, "amarelo")
            motivos.append(f"salto de {serie.iloc[-1] - serie.iloc[-2]:.1f} mSv em um dia (possível tempestade solar)")
        return {"status": status, "valor": valor, "motivos": motivos, "tendencia": "acumulando"}

    if indicador in baseline:
        media, desvio = baseline[indicador]
        # Desvio mínimo evita que oscilações pequenas pareçam anormais quando o pré-voo varia pouco
        desvio = max(desvio, KB[indicador]["variacao_relevante"])
        sinal = 1 if KB[indicador]["direcao_ruim"] == "alta" else -1
        z = (valor - media) / desvio
        if z * sinal > Z_FORA_DO_NORMAL:
            status = pior(status, "amarelo")
            motivos.append(f"{'acima' if z > 0 else 'abaixo'} do seu normal pré-voo ({media:.1f})")

        janela = serie.iloc[-JANELA_TENDENCIA:]
        if len(janela) == JANELA_TENDENCIA:
            variacao = np.polyfit(np.arange(len(janela)), janela.to_numpy(), 1)[0] * (len(janela) - 1)
            if abs(variacao) > 2 * desvio:
                tendencia = "subindo" if variacao > 0 else "caindo"
            if variacao * sinal > 3 * desvio:
                status = pior(status, "amarelo")
                motivos.append(f"{tendencia} {abs(variacao):.1f} {KB[indicador]['unidade']} nos últimos {len(janela)} dias")

    return {"status": status, "valor": valor, "motivos": motivos, "tendencia": tendencia}


def avaliar(astronauta, fonte=None, ate_dia=None):
    with sqlite3.connect(DB_PATH) as conn:
        df, fonte = carregar(conn, astronauta, fonte, ate_dia)
        baseline = carregar_baseline(conn, astronauta)
    if df.empty:
        return {"erro": f"sem medições para {astronauta}"}

    resultado, invalidas = {}, []
    for indicador, grupo in df.groupby("indicator"):
        mascara = grupo["value"].apply(lambda v: valido(indicador, v))
        invalidas += [{"indicador": indicador, "dia": int(r.mission_day) + 1, "valor": float(r.value)}
                      for r in grupo[~mascara].itertuples()]
        serie = grupo.loc[mascara, "value"].dropna()
        if serie.empty or indicador not in KB:
            continue
        item = avaliar_indicador(indicador, serie, baseline)
        item["unidade"] = KB[indicador]["unidade"]
        item["dia"] = int(grupo.loc[serie.index[-1], "mission_day"]) + 1
        resultado[indicador] = item

    geral = pior(*(i["status"] for i in resultado.values())) if resultado else "verde"
    return {"astronauta": astronauta, "fonte": fonte, "status_geral": geral,
            "indicadores": resultado, "medicoes_rejeitadas": invalidas}
