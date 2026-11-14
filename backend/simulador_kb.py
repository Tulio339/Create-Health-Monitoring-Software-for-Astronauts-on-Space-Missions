"""
Popula o banco do backend com os astronautas e cenários de telemetria já validados em
knowledge-base/examples/ (AST-B, gerado por generate_example.py) e
knowledge-base/examples/scenarios/ (AST-C..AST-K, gerados por generate_scenarios.py).

Uso:
    python simulador_kb.py            # todos os cenários
    python simulador_kb.py cardiaca   # só um cenário (por nome de arquivo, sem sufixo)
"""
import json
import sys
from pathlib import Path

from motor import conectar, init_db, KB_ROOT

EXAMPLES = KB_ROOT / "examples"
SCENARIOS_DIR = EXAMPLES / "scenarios"

# nome do cenário -> (arquivo de telemetria, arquivo de perfil)
CENARIOS = {"original": (EXAMPLES / "telemetry.json", EXAMPLES / "profile.json")}
for perfil_path in sorted(SCENARIOS_DIR.glob("*_profile.json")):
    slug = perfil_path.stem.removesuffix("_profile")
    CENARIOS[slug] = (SCENARIOS_DIR / f"{slug}_telemetry.json", perfil_path)


def seed_astronauta(conn, profile):
    astro_id = profile["astronaut_id"]
    mission = profile.get("mission", {})
    conn.execute(
        "INSERT OR REPLACE INTO astronaut (id, name, role, age, mission_name, mission_phase, "
        "baseline_json, first_sample_ts, mission_day_base) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (astro_id, profile.get("name"), profile.get("role"), profile.get("age"),
         mission.get("name"), mission.get("phase"), json.dumps(profile.get("baseline", {}), ensure_ascii=False),
         None, mission.get("day")))


def seed_telemetria(conn, astro_id, amostras, fonte):
    conn.execute("DELETE FROM telemetry WHERE astronaut_id = ? AND source = ?", (astro_id, fonte))
    linhas = []
    for amostra in amostras:
        resto = {k: v for k, v in amostra.items() if k not in ("astronaut_id", "timestamp", "module")}
        linhas.append((astro_id, amostra["timestamp"], amostra.get("module"),
                       json.dumps(resto, ensure_ascii=False), fonte))
    conn.executemany("INSERT INTO telemetry (astronaut_id, timestamp, module, data_json, source) "
                     "VALUES (?, ?, ?, ?, ?)", linhas)
    if amostras:
        conn.execute("UPDATE astronaut SET first_sample_ts = ? WHERE id = ? AND first_sample_ts IS NULL",
                    (amostras[0]["timestamp"], astro_id))
    return len(linhas)


def seed_cenario(conn, nome):
    telemetria_path, perfil_path = CENARIOS[nome]
    profile = json.loads(perfil_path.read_text(encoding="utf-8"))
    amostras = json.loads(telemetria_path.read_text(encoding="utf-8"))
    seed_astronauta(conn, profile)
    n = seed_telemetria(conn, profile["astronaut_id"], amostras, fonte=f"cenario:{nome}")
    conn.commit()
    return profile["astronaut_id"], n


def main():
    nomes = sys.argv[1:] or list(CENARIOS)
    desconhecidos = set(nomes) - set(CENARIOS)
    if desconhecidos:
        sys.exit(f"Cenário(s) desconhecido(s): {sorted(desconhecidos)}. Disponíveis: {sorted(CENARIOS)}")

    conn = conectar()
    init_db(conn)
    for nome in nomes:
        astro_id, n = seed_cenario(conn, nome)
        print(f"{nome}: {astro_id}, {n} amostras")
    conn.close()


if __name__ == "__main__":
    main()
