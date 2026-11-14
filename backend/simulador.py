import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
PREFLIGHT_DAYS = 14
MISSION_DAYS = 30
MISSION_START = pd.Timestamp("2026-11-01 07:00")
OUT_DIR = Path(__file__).parent / "dados_simulados"

INDICATORS = {
    "heart_rate":   {"unit": "bpm",   "sd": 3.0,  "min": 35,  "max": 180, "dec": 0},
    "bp_systolic":  {"unit": "mmHg",  "sd": 4.0,  "min": 80,  "max": 200, "dec": 0},
    "bp_diastolic": {"unit": "mmHg",  "sd": 3.0,  "min": 45,  "max": 130, "dec": 0},
    "body_temp":    {"unit": "°C",    "sd": 0.15, "min": 35,  "max": 41,  "dec": 1},
    "glucose":      {"unit": "mg/dL", "sd": 5.0,  "min": 50,  "max": 250, "dec": 0},
    "spo2":         {"unit": "%",     "sd": 0.7,  "min": 85,  "max": 100, "dec": 0},
    "sleep_hours":  {"unit": "h",     "sd": 0.5,  "min": 2,   "max": 11,  "dec": 1},
    "mood":         {"unit": "1-5",   "sd": 0.4,  "min": 1,   "max": 5,   "dec": 0},
    "exercise_min": {"unit": "min",   "sd": 15,   "min": 0,   "max": 200, "dec": 0},
    "reaction_ms":  {"unit": "ms",    "sd": 15,   "min": 180, "max": 600, "dec": 0},
}

# Taxas de radiação aproximadas, só para demonstração
ENVIRONMENTS = {
    "iss":          {"rad_msv_day": 0.5, "spe_chance": 0.00},
    "lunar_base":   {"rad_msv_day": 1.4, "spe_chance": 0.03},
    "mars_transit": {"rad_msv_day": 1.8, "spe_chance": 0.03},
}

ASTRONAUTS = [
    {"id": "AST-01", "name": "Ana Ribeiro", "env": "mars_transit",
     "baseline": {"heart_rate": 62, "bp_systolic": 118, "bp_diastolic": 76, "body_temp": 36.6,
                  "glucose": 88, "spo2": 98, "sleep_hours": 7.2, "mood": 4,
                  "exercise_min": 120, "reaction_ms": 250},
     "scenarios": ["hypertension_drift", "sleep_crisis"]},
    {"id": "AST-02", "name": "Kenji Sato", "env": "mars_transit",
     "baseline": {"heart_rate": 55, "bp_systolic": 112, "bp_diastolic": 72, "body_temp": 36.5,
                  "glucose": 84, "spo2": 98, "sleep_hours": 7.5, "mood": 4,
                  "exercise_min": 130, "reaction_ms": 240},
     "scenarios": ["infection"]},
    {"id": "AST-03", "name": "Lucas Moreau", "env": "mars_transit",
     "baseline": {"heart_rate": 68, "bp_systolic": 122, "bp_diastolic": 79, "body_temp": 36.7,
                  "glucose": 92, "spo2": 97, "sleep_hours": 6.9, "mood": 4,
                  "exercise_min": 110, "reaction_ms": 265},
     "scenarios": ["glucose_drift", "low_exercise"]},
]


def label(astro_id, indicator, start, end, description, expected):
    return {"astronaut_id": astro_id, "indicator": indicator, "start_day": start,
            "end_day": end, "description": description, "expected_alert": expected}


def hypertension_drift(df, rng, aid, start=15):
    days = df.index[df.index >= start]
    ramp = np.linspace(0, 1, len(days))
    df.loc[days, "bp_systolic"] += ramp * 28
    df.loc[days, "bp_diastolic"] += ramp * 14
    return [label(aid, "bp_systolic", start, df.index.max(), "pressão subindo aos poucos", "amarelo -> vermelho")]


def infection(df, rng, aid, start=10):
    fever = [0.8, 2.0, 1.7, 0.9]
    days = [start + i for i in range(len(fever)) if start + i in df.index]
    for day, delta in zip(days, fever):
        df.loc[day, "body_temp"] += delta
        df.loc[day, "heart_rate"] += delta * 10
        df.loc[day, "mood"] -= 1
    end = days[-1] if days else start
    return [label(aid, "body_temp", start, end, "febre (infecção)", "vermelho"),
            label(aid, "heart_rate", start, end, "taquicardia junto com a febre", "amarelo")]


def sleep_crisis(df, rng, aid, start=18):
    end = min(start + 6, df.index.max())
    df.loc[start:end, "sleep_hours"] -= 2.5
    return [label(aid, "sleep_hours", start, end, "semana dormindo mal", "amarelo"),
            label(aid, "reaction_ms", start, end, "reação mais lenta por falta de sono", "amarelo")]


def glucose_drift(df, rng, aid, start=8):
    days = df.index[df.index >= start]
    df.loc[days, "glucose"] += (days - start) * 1.3
    return [label(aid, "glucose", start, df.index.max(), "glicemia subindo (resistência à insulina)", "amarelo")]


def low_exercise(df, rng, aid, start=5):
    df.loc[start:, "exercise_min"] *= 0.4
    return [label(aid, "exercise_min", start, df.index.max(), "esteira quebrou, pouco exercício", "amarelo")]


SCENARIOS = {f.__name__: f for f in [hypertension_drift, infection, sleep_crisis, glucose_drift, low_exercise]}


# scenarios: lista de (nome, dia_inicio); None usa os cenários e dias padrão do astronauta
def generate_astronaut(astro, rng, days=None, scenarios=None):
    if days is None:
        days = np.arange(-PREFLIGHT_DAYS, MISSION_DAYS)
    if scenarios is None:
        scenarios = [(name, None) for name in astro["scenarios"]]
    df = pd.DataFrame(index=days, dtype=float)
    for name, cfg in INDICATORS.items():
        df[name] = astro["baseline"][name] + rng.normal(0, cfg["sd"], len(days))

    # Adaptação ao voo: sono mais curto e leve queda de FC/PA com a redistribuição de líquidos
    in_flight = df.index >= 0
    df.loc[in_flight, "sleep_hours"] -= 0.6
    df.loc[in_flight, "heart_rate"] -= 2
    df.loc[in_flight, "bp_systolic"] -= 3

    labels = []
    for name, start in scenarios:
        kwargs = {} if start is None else {"start": start}
        labels += SCENARIOS[name](df, rng, astro["id"], **kwargs)

    # Sono influencia humor e tempo de reação (por isso vem depois dos cenários)
    sleep_gap = df["sleep_hours"] - astro["baseline"]["sleep_hours"]
    df["mood"] += 0.5 * sleep_gap
    df["reaction_ms"] -= 20 * sleep_gap

    for name, cfg in INDICATORS.items():
        df[name] = df[name].clip(cfg["min"], cfg["max"]).round(cfg["dec"])

    env = ENVIRONMENTS[astro["env"]]
    daily = np.where(in_flight, env["rad_msv_day"] * rng.normal(1, 0.1, len(days)), 0.0)
    spe_days = in_flight & (rng.random(len(days)) < env["spe_chance"])
    daily[spe_days] += rng.uniform(5, 20, spe_days.sum())
    df["radiation_cum_msv"] = np.cumsum(daily).round(2)
    for day in df.index[spe_days]:
        labels.append(label(astro["id"], "radiation_cum_msv", day, day, "evento de partículas solares", "amarelo"))

    return df, labels


def to_long(df, astro, rng):
    long = df.reset_index(names="mission_day").melt(
        id_vars="mission_day", var_name="indicator", value_name="value")
    long["astronaut_id"] = astro["id"]
    long["unit"] = long["indicator"].map(lambda i: INDICATORS.get(i, {"unit": "mSv"})["unit"])
    long["phase"] = np.where(long["mission_day"] < 0, "preflight", "mission")
    jitter = pd.to_timedelta(rng.integers(0, 45, len(long)), unit="min")
    long["timestamp"] = MISSION_START + pd.to_timedelta(long["mission_day"], unit="D") + jitter
    long["source"] = "simulated"
    return long


def add_real_world_noise(long, rng, astro_id):
    # 5% de medições esquecidas (a radiação vem do dosímetro, então nunca falta)
    manual = long["indicator"] != "radiation_cum_msv"
    missing = manual & (rng.random(len(long)) < 0.05)
    long = long[~missing].copy()

    # Um erro de digitação por astronauta, para testar a validação
    idx = long[(long["indicator"] == "body_temp") & (long["phase"] == "mission")].sample(1, random_state=rng).index[0]
    long.loc[idx, "value"] = long.loc[idx, "value"] * 10
    day = int(long.loc[idx, "mission_day"])
    typo = label(astro_id, "body_temp", day, day, "erro de digitação (ex.: 366 em vez de 36,6)", "rejeitar na validação")
    return long, typo


def compute_baselines(long):
    pre = long[(long["phase"] == "preflight") & (long["indicator"] != "radiation_cum_msv")]
    return (pre.groupby(["astronaut_id", "indicator"])["value"]
               .agg(mean="mean", std="std").round(2).reset_index())


def main():
    rng = np.random.default_rng(SEED)
    all_measurements, all_labels = [], []

    for astro in ASTRONAUTS:
        df, labels = generate_astronaut(astro, rng)
        long, typo = add_real_world_noise(to_long(df, astro, rng), rng, astro["id"])
        all_measurements.append(long)
        all_labels += labels + [typo]

    cols = ["astronaut_id", "timestamp", "mission_day", "phase", "indicator", "value", "unit", "source"]
    measurements = pd.concat(all_measurements)[cols].sort_values(["astronaut_id", "timestamp"])
    labels = pd.DataFrame(all_labels)
    baselines = compute_baselines(measurements)
    astronauts = pd.DataFrame([{k: a[k] for k in ("id", "name", "env")} for a in ASTRONAUTS])

    OUT_DIR.mkdir(exist_ok=True)
    measurements.to_csv(OUT_DIR / "measurements.csv", index=False)
    labels.to_csv(OUT_DIR / "labels.csv", index=False)
    baselines.to_csv(OUT_DIR / "baselines.csv", index=False)

    with sqlite3.connect(OUT_DIR / "health.db") as conn:
        astronauts.to_sql("astronaut", conn, if_exists="replace", index=False)
        measurements.to_sql("measurement", conn, if_exists="replace", index=False)
        baselines.to_sql("baseline", conn, if_exists="replace", index=False)
        labels.to_sql("ground_truth", conn, if_exists="replace", index=False)

    print(f"{len(measurements)} medições, {len(labels)} anomalias plantadas -> {OUT_DIR}/")


if __name__ == "__main__":
    main()
