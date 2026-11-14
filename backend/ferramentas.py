import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd

from simulador import ASTRONAUTS, INDICATORS, MISSION_START, SCENARIOS, generate_astronaut

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "dados_simulados" / "health.db"
EXPORT_DIR = BASE_DIR / "exportacoes"

RANGES = {
    "heart_rate": (55, 75), "bp_systolic": (105, 125), "bp_diastolic": (65, 80),
    "body_temp": (36.3, 36.9), "glucose": (75, 95), "spo2": (96, 99),
    "sleep_hours": (6, 8), "mood": (3, 5), "exercise_min": (90, 150), "reaction_ms": (220, 290),
}


def _astronauta(astro_id):
    return next((a for a in ASTRONAUTS if a["id"] == astro_id), None)


# Grava o lote no SQLite: medições na tabela do sistema, metadados e gabarito em tabelas próprias
def _salvar_lote(ferramenta, astronauta, medicoes, anomalias, descricao, seed):
    lote = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:4]}"
    df = pd.DataFrame(medicoes)
    df["astronaut_id"] = astronauta
    df["mission_day"] = df["dia"] - 1
    df["timestamp"] = MISSION_START + pd.to_timedelta(df["mission_day"], unit="D")
    df["phase"] = "mission"
    df["unit"] = df["indicator"].map(lambda i: INDICATORS.get(i, {"unit": "mSv"})["unit"])
    df["source"] = f"agente:{lote}"
    cols = ["astronaut_id", "timestamp", "mission_day", "phase", "indicator", "value", "unit", "source"]

    meta = pd.DataFrame([{"lote": lote, "criado_em": f"{datetime.now():%Y-%m-%d %H:%M:%S}",
                          "ferramenta": ferramenta, "astronauta": astronauta,
                          "descricao": descricao, "seed": seed, "registros": len(df)}])

    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        df[cols].to_sql("measurement", conn, if_exists="append", index=False)
        meta.to_sql("agent_batch", conn, if_exists="append", index=False)
        if anomalias:
            pd.DataFrame(anomalias).assign(lote=lote).to_sql("agent_ground_truth", conn, if_exists="append", index=False)
    return lote


def _resumo(medicoes):
    df = pd.DataFrame(medicoes)
    stats = df.groupby("indicator")["value"].agg(["min", "max", "mean"]).round(1)
    return {ind: {"min": float(r["min"]), "max": float(r["max"]), "media": float(r["mean"])}
            for ind, r in stats.iterrows()}


def gerar_indicador(indicador: str, astronauta: str = "AST-01", dias: int = 7, minimo: float | None = None,
                    maximo: float | None = None, seed: int | None = None) -> dict:
    """Gera valores diários aleatórios de UM indicador de saúde dentro de um intervalo e salva no banco.
    Sem minimo/maximo, usa a faixa normal do indicador. Devolve o id do lote salvo e um resumo."""
    if indicador not in RANGES:
        return {"erro": f"indicador '{indicador}' não existe", "disponiveis": list(RANGES)}
    if _astronauta(astronauta) is None:
        return {"erro": f"astronauta '{astronauta}' não existe", "disponiveis": [a["id"] for a in ASTRONAUTS]}
    lo, hi = RANGES[indicador]
    lo = lo if minimo is None else minimo
    hi = hi if maximo is None else maximo
    if lo > hi:
        return {"erro": f"minimo ({lo}) maior que maximo ({hi})"}

    rng = np.random.default_rng(seed)
    values = rng.uniform(lo, hi, dias).round(INDICATORS[indicador]["dec"])
    medicoes = [{"dia": i + 1, "indicator": indicador, "value": float(v)} for i, v in enumerate(values)]

    descricao = f"{indicador} entre {lo} e {hi} por {dias} dias"
    lote = _salvar_lote("gerar_indicador", astronauta, medicoes, [], descricao, seed)
    return {"lote": lote, "astronauta": astronauta, "descricao": descricao,
            "unidade": INDICATORS[indicador]["unit"], "registros": len(medicoes),
            "resumo": _resumo(medicoes), "seed": seed}


def gerar_cenario(astronauta: str, cenario: str, inicio: int = 0, dias: int = 14,
                  seed: int | None = None) -> dict:
    """Simula um problema de saúde em um astronauta, alterando vários indicadores de forma coerente, e salva no banco.
    astronauta: AST-01, AST-02 ou AST-03. inicio: dia em que o problema começa (0 = dia 1).
    Cenários: hypertension_drift, infection, sleep_crisis, glucose_drift, low_exercise.
    Devolve o id do lote salvo, um resumo por indicador e as anomalias plantadas."""
    astro = _astronauta(astronauta)
    if astro is None:
        return {"erro": f"astronauta '{astronauta}' não existe", "disponiveis": [a["id"] for a in ASTRONAUTS]}
    if cenario not in SCENARIOS:
        return {"erro": f"cenário '{cenario}' não existe", "disponiveis": list(SCENARIOS)}
    if not 0 <= inicio < dias:
        return {"erro": f"inicio deve estar entre 0 e {dias - 1}"}

    rng = np.random.default_rng(seed)
    df, labels = generate_astronaut(astro, rng, days=np.arange(dias), scenarios=[(cenario, inicio)])

    # Converte para tipos do Python puro, senão o JSON quebra com int64 do numpy
    medicoes = [{"dia": int(day) + 1, "indicator": ind, "value": float(val)}
                for day, row in df.iterrows() for ind, val in row.items()]
    for item in labels:
        item["start_day"], item["end_day"] = int(item["start_day"]) + 1, int(item["end_day"]) + 1

    descricao = f"cenário {cenario} começando no dia {inicio + 1}, {dias} dias"
    lote = _salvar_lote("gerar_cenario", astronauta, medicoes, labels, descricao, seed)
    return {"lote": lote, "astronauta": astronauta, "ambiente": astro["env"], "descricao": descricao,
            "registros": len(medicoes), "resumo": _resumo(medicoes), "anomalias": labels, "seed": seed}


def listar_lotes(limite: int = 10) -> dict:
    """Lista os lotes de dados gerados pelo agente, do mais recente para o mais antigo."""
    if not DB_PATH.exists():
        return {"lotes": []}
    with sqlite3.connect(DB_PATH) as conn:
        try:
            df = pd.read_sql("SELECT * FROM agent_batch ORDER BY criado_em DESC LIMIT ?", conn, params=(limite,))
        except pd.errors.DatabaseError:
            return {"lotes": []}
    # NaN (seed vazia) não é JSON válido; vira None -> null
    return {"lotes": df.astype(object).where(df.notna(), None).to_dict(orient="records")}


def exportar_lote(lote: str, formato: str = "json") -> dict:
    """Exporta um lote salvo para um arquivo .json ou .csv na pasta exportacoes. Use o id devolvido pelas ferramentas de geração."""
    if formato not in ("json", "csv"):
        return {"erro": "formato deve ser 'json' ou 'csv'"}
    with sqlite3.connect(DB_PATH) as conn:
        # Aceita lotes do agente ("agente:<lote>") e dos sensores ("sensores:<lote>")
        medicoes = pd.read_sql("SELECT * FROM measurement WHERE source LIKE ?", conn, params=(f"%:{lote}",))
        try:
            anomalias = pd.read_sql("SELECT * FROM agent_ground_truth WHERE lote = ?", conn, params=(lote,))
        except pd.errors.DatabaseError:
            anomalias = pd.DataFrame()
    if medicoes.empty:
        return {"erro": f"lote '{lote}' não encontrado. Use listar_lotes para ver os lotes existentes."}

    EXPORT_DIR.mkdir(exist_ok=True)
    arquivo = EXPORT_DIR / f"lote_{lote}.{formato}"
    if formato == "csv":
        medicoes.to_csv(arquivo, index=False)
    else:
        conteudo = {"lote": lote, "medicoes": medicoes.to_dict(orient="records"),
                    "anomalias": anomalias.to_dict(orient="records")}
        arquivo.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"lote": lote, "arquivo": str(arquivo), "registros": len(medicoes)}
