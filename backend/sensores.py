import argparse
import sqlite3
import time
from datetime import datetime
from uuid import uuid4

import numpy as np
import pandas as pd

from ferramentas import DB_PATH, exportar_lote
from simulador import ASTRONAUTS, INDICATORS, MISSION_START, SCENARIOS, generate_astronaut


def ler_argumentos():
    p = argparse.ArgumentParser(description="Simula os sensores da nave enviando medições automaticamente.")
    p.add_argument("--dias", type=int, default=30, help="duração da missão simulada")
    p.add_argument("--intervalo", type=float, default=2.0, help="segundos reais por dia simulado")
    p.add_argument("--max-cenarios", type=int, default=2, help="máximo de problemas sorteados por astronauta")
    p.add_argument("--seed", type=int, default=None, help="fixe para repetir a mesma missão")
    p.add_argument("--exportar", choices=["json", "csv"], default=None, help="gera um arquivo ao final")
    return p.parse_args()


# Sorteia quais problemas cada astronauta terá e em que dia começam
def sortear_cenarios(rng, dias, maximo):
    qtd = int(rng.integers(0, maximo + 1))
    nomes = rng.choice(list(SCENARIOS), size=qtd, replace=False)
    return [(str(nome), int(rng.integers(1, max(2, dias - 3)))) for nome in nomes]


# Gera a missão inteira de uma vez; o "tempo real" vem de revelar um dia por vez
def preparar_missao(rng, dias, max_cenarios):
    missao, gabarito = {}, []
    for astro in ASTRONAUTS:
        cenarios = sortear_cenarios(rng, dias, max_cenarios)
        df, labels = generate_astronaut(astro, rng, days=np.arange(dias), scenarios=cenarios)
        missao[astro["id"]] = df
        for item in labels:
            item["start_day"], item["end_day"] = int(item["start_day"]) + 1, int(item["end_day"]) + 1
        gabarito += labels
        resumo = ", ".join(f"{n} (dia {s + 1})" for n, s in cenarios) or "nenhum problema"
        print(f"  {astro['id']}: {resumo}")
    return missao, gabarito


def registrar_lote(conn, lote, dias, gabarito, seed):
    meta = pd.DataFrame([{"lote": lote, "criado_em": f"{datetime.now():%Y-%m-%d %H:%M:%S}",
                          "ferramenta": "sensores", "astronauta": "todos",
                          "descricao": f"missão automática de {dias} dias", "seed": seed,
                          "registros": None}])
    meta.to_sql("agent_batch", conn, if_exists="append", index=False)
    if gabarito:
        pd.DataFrame(gabarito).assign(lote=lote).to_sql("agent_ground_truth", conn, if_exists="append", index=False)


def enviar_dia(conn, lote, missao, dia):
    linhas = []
    for astro_id, df in missao.items():
        for indicador, valor in df.loc[dia].items():
            linhas.append({"astronaut_id": astro_id,
                           "timestamp": MISSION_START + pd.Timedelta(days=int(dia)),
                           "mission_day": int(dia), "phase": "mission",
                           "indicator": indicador, "value": float(valor),
                           "unit": INDICATORS.get(indicador, {"unit": "mSv"})["unit"],
                           "source": f"sensores:{lote}"})
    pd.DataFrame(linhas).to_sql("measurement", conn, if_exists="append", index=False)
    return len(linhas)


def main():
    args = ler_argumentos()
    rng = np.random.default_rng(args.seed)
    lote = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:4]}"

    print(f"Missão {lote}: {args.dias} dias, 1 dia a cada {args.intervalo}s. Problemas sorteados:")
    missao, gabarito = preparar_missao(rng, args.dias, args.max_cenarios)

    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        registrar_lote(conn, lote, args.dias, gabarito, args.seed)
        total = 0
        try:
            for dia in range(args.dias):
                total += enviar_dia(conn, lote, missao, dia)
                conn.commit()
                print(f"Dia {dia + 1:>3}/{args.dias}: {total} medições enviadas")
                time.sleep(args.intervalo)
        except KeyboardInterrupt:
            print("\nInterrompido. O que já foi enviado continua salvo.")
        conn.execute("UPDATE agent_batch SET registros = ? WHERE lote = ?", (total, lote))

    print(f"Fim. Medições salvas em {DB_PATH} (lote {lote}).")
    if args.exportar:
        print(f"Arquivo gerado: {exportar_lote(lote, args.exportar)['arquivo']}")


if __name__ == "__main__":
    main()
