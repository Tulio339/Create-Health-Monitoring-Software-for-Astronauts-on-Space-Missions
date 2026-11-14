"""
Replay ao vivo de um cenário do knowledge-base: insere as amostras de telemetria aos poucos
(como se fossem os sensores da nave enviando dados em tempo real) e, a cada lote, roda o motor
de regras + a reavaliação de casos pendentes — o pipeline "motor -> abre caso" do
knowledge-base/README.md, rodando de verdade.

Uso:
    python sensores_kb.py --cenario cardiaca --intervalo 1       # 1 amostra a cada 1s
    python sensores_kb.py --cenario cardiaca --lote 6 --intervalo 2   # 6 amostras por vez
"""
import argparse
import time

from motor import avaliar_astronauta, conectar, init_db, reavaliar_casos_pendentes
from simulador_kb import CENARIOS, seed_astronauta
import json


def ler_argumentos():
    p = argparse.ArgumentParser(description="Replay ao vivo de um cenário de telemetria do knowledge-base.")
    p.add_argument("--cenario", required=True, choices=sorted(CENARIOS))
    p.add_argument("--intervalo", type=float, default=1.0, help="segundos reais entre lotes")
    p.add_argument("--lote", type=int, default=1, help="quantas amostras por lote")
    return p.parse_args()


def main():
    args = ler_argumentos()
    telemetria_path, perfil_path = CENARIOS[args.cenario]
    profile = json.loads(perfil_path.read_text(encoding="utf-8"))
    amostras = json.loads(telemetria_path.read_text(encoding="utf-8"))
    astro_id = profile["astronaut_id"]

    conn = conectar()
    init_db(conn)
    conn.execute("DELETE FROM telemetry WHERE astronaut_id = ?", (astro_id,))
    conn.execute("DELETE FROM alert WHERE astronaut_id = ?", (astro_id,))
    conn.execute("DELETE FROM case_timeline WHERE case_id IN (SELECT case_id FROM case_ WHERE astronaut_id = ?)",
                (astro_id,))
    conn.execute("DELETE FROM case_ WHERE astronaut_id = ?", (astro_id,))
    seed_astronauta(conn, profile)
    conn.commit()

    print(f"Replay de '{args.cenario}' ({astro_id}): {len(amostras)} amostras, lote de {args.lote}, "
         f"{args.intervalo}s por lote. Ctrl+C pra parar.")
    try:
        for inicio in range(0, len(amostras), args.lote):
            lote = amostras[inicio:inicio + args.lote]
            linhas = []
            for amostra in lote:
                resto = {k: v for k, v in amostra.items() if k not in ("astronaut_id", "timestamp", "module")}
                linhas.append((astro_id, amostra["timestamp"], amostra.get("module"),
                              json.dumps(resto, ensure_ascii=False), f"sensores:{args.cenario}"))
            conn.executemany("INSERT INTO telemetry (astronaut_id, timestamp, module, data_json, source) "
                            "VALUES (?, ?, ?, ?, ?)", linhas)
            conn.execute("UPDATE astronaut SET first_sample_ts = COALESCE(first_sample_ts, ?) WHERE id = ?",
                        (amostras[0]["timestamp"], astro_id))
            conn.commit()

            alertas, correlacoes = avaliar_astronauta(astro_id, conn)
            reavaliados = reavaliar_casos_pendentes(astro_id, conn)
            ultimo_dia = lote[-1]["timestamp"]
            resumo_alertas = ", ".join(f"{a['level']}:{a['directive_id']}" for a in alertas) or "sem alerta"
            print(f"[{ultimo_dia}] +{len(lote)} amostras | {resumo_alertas}"
                 + (f" | reavaliados: {reavaliados}" if reavaliados else ""))
            time.sleep(args.intervalo)
    except KeyboardInterrupt:
        print("\nInterrompido. O que já foi enviado continua salvo.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
