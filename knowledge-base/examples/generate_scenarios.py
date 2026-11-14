"""
Gera cenários adicionais de telemetria (examples/scenarios/*_telemetry.json +
*_profile.json), um para cada diretiva ainda não exercitada pelo exemplo padrão
(examples/telemetry.json, astronauta AST-B: CO2 + sono + SPE).

Cada cenário começa num período normal e evolui até o nível mais grave da diretiva
correspondente, para exercitar o motor de regras em todos os níveis de uma vez.

Uso:
    python3 examples/generate_scenarios.py
    python3 engine/rules_engine.py --telemetry examples/scenarios/cardiaca_telemetry.json \\
                                    --profile examples/scenarios/cardiaca_profile.json
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(7)
OUT_DIR = Path(__file__).resolve().parent / "scenarios"
OUT_DIR.mkdir(exist_ok=True)
START = datetime(2026, 11, 7, 0, 0)


def jitter(value, spread):
    return round(value + random.uniform(-spread, spread), 2)


def base_sample(astronaut_id, ts, module="hab"):
    return {
        "astronaut_id": astronaut_id,
        "timestamp": ts.isoformat() + "Z",
        "module": module,
        "vitals": {
            "hr": jitter(66, 4), "hr_rest": jitter(58, 2), "hrv_rmssd_ms": jitter(52, 4),
            "ectopic_beats_per_h": jitter(8, 3), "afib_detected": 0, "spo2_pct": jitter(97.5, 0.6),
            "bp_sys": jitter(116, 5), "bp_dia": jitter(74, 4), "resp_rate": jitter(14, 1),
            "core_temp_c": jitter(36.8, 0.15),
        },
        "radiation": {"dose_rate_msv_h": 0.04, "cumulative_mission_msv": 80.0, "cumulative_career_msv": 220.0},
        "env": {
            "co2_mmhg": jitter(2.2, 0.1), "o2_pct": 21.0, "cabin_temp_c": jitter(22.5, 0.4),
            "humidity_pct": jitter(45, 3), "noise_dba": jitter(52, 3), "proton_flux_10mev_pfu": 0.5,
        },
        "mission": {"comm_latency_s": 95, "comm_available": 1, "medkit_min_stock_pct": 70,
                     "open_cases_alerta_or_above": 0},
        "symptoms": [],
    }


def write_scenario(slug, astronaut_id, profile_extra, samples, note):
    telemetry_path = OUT_DIR / f"{slug}_telemetry.json"
    profile_path = OUT_DIR / f"{slug}_profile.json"
    telemetry_path.write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
    profile = {"astronaut_id": astronaut_id, **profile_extra}
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Gerado {slug}: {len(samples)} amostras — {note}")


# ── 1. Arritmia cardíaca (DIR-CARD-001) ─────────────────────────────────────

def scenario_cardiaca():
    astronaut_id = "AST-C"
    days = 6
    hours = days * 24
    ectopic_per_day = [8, 9, 11, 40, 95, 150]
    samples = []
    for h in range(hours):
        ts = START + timedelta(hours=h)
        day = h // 24
        s = base_sample(astronaut_id, ts, module="lab")
        s["vitals"]["ectopic_beats_per_h"] = jitter(ectopic_per_day[day], 5)
        if h == hours - 1:
            s["vitals"]["afib_detected"] = 1
            s["vitals"]["hr"] = 161
            s["vitals"]["hr_rest"] = 128
            s["symptoms"] = ["dor_peito"]
        samples.append(s)
    write_scenario("cardiaca", astronaut_id,
                    {"name": "Tripulante C", "role": "Piloto", "age": 38,
                     "mission": {"name": "ARTEMIS-SIM", "day": 70, "phase": "superficie"},
                     "baseline": {"vitals.hr_rest": 58, "vitals.hrv_rmssd_ms": 52}},
                    samples,
                    "extrassístoles crescentes + FA com dor no peito na última hora (atenção → alerta → crítico)")


# ── 2. Perda óssea / risco de cálculo renal (DIR-GRAV-002) ─────────────────

def scenario_ossea():
    astronaut_id = "AST-D"
    days = 10
    exercise_min = [95, 90, 85, 55, 50, 45, 40, 38, 35, 30]
    fluid_ml =     [2600, 2500, 2400, 2200, 1900, 1800, 1700, 1600, 1550, 1500]
    baseline_ctx = 0.32
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        day, hour = h // 24, (START + timedelta(hours=h)).hour
        s = base_sample(astronaut_id, ts, module="hab")
        if hour == 7:
            s["fitness"] = {"exercise_minutes": exercise_min[day]}
            s["vitals"]["fluid_intake_ml"] = fluid_ml[day]
            if day == days - 1:
                s["lab"] = {"ctx_ng_ml": 0.56, "urine_calcium_mg_day": 320}
                s["symptoms"] = ["dor_flanco"]
        samples.append(s)
    write_scenario("ossea", astronaut_id,
                    {"name": "Tripulante D", "role": "Engenheira de voo", "age": 45,
                     "mission": {"name": "ARTEMIS-SIM", "day": 120, "phase": "superficie"},
                     "baseline": {"lab.ctx_ng_ml": baseline_ctx}},
                    samples,
                    "exercício/hidratação em queda por 10 dias + CTX alto e dor no flanco no último dia")


# ── 3. Descondicionamento cardiovascular (DIR-GRAV-003) ─────────────────────

def scenario_descondicionamento():
    astronaut_id = "AST-E"
    days = 9
    hr_rest_day = [58, 59, 58, 60, 64, 68, 70, 71, 71]
    hrv_day =     [52, 51, 53, 50, 46, 42, 38, 36, 35]
    vo2_day =     [48, 47, 46, 45, 44, 43, 41, 40, 40]
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        day, hour = h // 24, (START + timedelta(hours=h)).hour
        s = base_sample(astronaut_id, ts, module="lab")
        s["vitals"]["hr_rest"] = jitter(hr_rest_day[day], 1.5)
        s["vitals"]["hrv_rmssd_ms"] = jitter(hrv_day[day], 2)
        if hour == 7:
            s["fitness"] = {"vo2max_ml_kg_min": vo2_day[day]}
        if h == days * 24 - 1:
            s["vitals"]["bp_sys"] = 84
            s["symptoms"] = ["tontura"]
        samples.append(s)
    write_scenario("descondicionamento", astronaut_id,
                    {"name": "Tripulante E", "role": "Médica de voo (CMO)", "age": 50,
                     "mission": {"name": "ARTEMIS-SIM", "day": 150, "phase": "transito"},
                     "baseline": {"vitals.hr_rest": 58, "vitals.hrv_rmssd_ms": 52,
                                  "fitness.vo2max_ml_kg_min": 48}},
                    samples,
                    "FC de repouso sobe e VFC/VO2máx caem em 9 dias, hipotensão sintomática no fim")


# ── 4. Atrofia muscular / adesão ao exercício (DIR-GRAV-004) ────────────────

def scenario_atrofia():
    astronaut_id = "AST-F"
    days = 10
    exercise_min =   [95, 90, 85, 70, 55, 50, 45, 40, 35, 25]
    resistive_load = [99, 98, 97, 95, 93, 90, 88, 86, 83, 80]
    leg_strength =   [96, 95, 94, 92, 89, 87, 84, 81, 77, 70]
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        day, hour = h // 24, (START + timedelta(hours=h)).hour
        s = base_sample(astronaut_id, ts, module="ginasio")
        if hour == 7:
            s["fitness"] = {"exercise_minutes": exercise_min[day],
                             "resistive_load_pct_baseline": resistive_load[day],
                             "leg_strength_pct_baseline": leg_strength[day]}
        samples.append(s)
    write_scenario("atrofia", astronaut_id,
                    {"name": "Tripulante F", "role": "Especialista de missão", "age": 36,
                     "mission": {"name": "ARTEMIS-SIM", "day": 95, "phase": "superficie"}},
                    samples,
                    "exercício, carga resistiva e força de perna caindo por 10 dias até nível crítico")


# ── 5. Saúde comportamental e cognição (DIR-ISO-002) ────────────────────────

def scenario_comportamental():
    astronaut_id = "AST-G"
    days = 10
    mood_day =    [7.3, 7.1, 7.0, 6.4, 5.8, 5.2, 4.6, 3.8, 2.0, 1.6]
    stress_day =  [4, 4, 5, 5, 6, 6, 7, 7, 8, 8]
    comm_day =    [36, 32, 28, 20, 14, 10, 8, 6, 5, 4]
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        day, hour = h // 24, (START + timedelta(hours=h)).hour
        s = base_sample(astronaut_id, ts, module="alojamento")
        if hour == 7:
            s["behavioral"] = {"mood_score": mood_day[day], "stress_score": stress_day[day],
                                "private_comm_minutes": comm_day[day]}
        samples.append(s)
    write_scenario("comportamental", astronaut_id,
                    {"name": "Tripulante G", "role": "Cientista de carga útil", "age": 33,
                     "mission": {"name": "ARTEMIS-SIM", "day": 200, "phase": "transito"},
                     "baseline": {"behavioral.mood_score": 7.2, "behavioral.private_comm_minutes": 35}},
                    samples,
                    "humor e contato privado caindo, estresse subindo por 10 dias (privacy: restricted)")


# ── 6. Estresse térmico e febre (DIR-ENV-002) ───────────────────────────────

def scenario_termico():
    astronaut_id = "AST-H"
    days = 5
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        s = base_sample(astronaut_id, ts, module="eva-airlock")
        if h >= days * 24 - 2:
            s["env"]["cabin_temp_c"] = 28.2
        if h == days * 24 - 1:
            s["vitals"]["core_temp_c"] = 39.6
        samples.append(s)
    write_scenario("termico", astronaut_id,
                    {"name": "Tripulante H", "role": "Especialista de EVA", "age": 40,
                     "mission": {"name": "ARTEMIS-SIM", "day": 60, "phase": "superficie"}},
                    samples,
                    "cabine aquecendo nas últimas 2 h e hipertermia (39,6 °C) na última amostra")


# ── 7. Autonomia médica sob latência (DIR-DIST-001) ─────────────────────────

def scenario_distancia():
    astronaut_id = "AST-I"
    days = 3
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        s = base_sample(astronaut_id, ts, module="hab")
        if h == days * 24 - 1:
            s["mission"].update(comm_latency_s=320, comm_available=0,
                                 medkit_min_stock_pct=15, open_cases_alerta_or_above=1)
        samples.append(s)
    write_scenario("distancia", astronaut_id,
                    {"name": "Tripulante I", "role": "Comandante", "age": 47,
                     "mission": {"name": "ARTEMIS-SIM", "day": 300, "phase": "transito_profundo"}},
                    samples,
                    "latência alta + estoque do kit médico baixo + apagão de comunicação com caso aberto")


# ── 8. Dose de radiação acumulada (DIR-RAD-001) ─────────────────────────────

def scenario_radiacao():
    astronaut_id = "AST-J"
    days = 20
    hours = days * 24
    start_dose, end_dose = 430.0, 606.0
    samples = []
    for h in range(hours):
        ts = START + timedelta(hours=h)
        s = base_sample(astronaut_id, ts, module="modulo-blindado")
        cumulative = start_dose + (end_dose - start_dose) * h / (hours - 1)
        s["radiation"] = {"dose_rate_msv_h": jitter(0.35, 0.02),
                           "cumulative_mission_msv": round(cumulative - 150, 2),
                           "cumulative_career_msv": round(cumulative, 2)}
        samples.append(s)
    write_scenario("radiacao", astronaut_id,
                    {"name": "Tripulante J", "role": "Especialista de missão", "age": 52,
                     "mission": {"name": "ARTEMIS-SIM", "day": 400, "phase": "transito_profundo"}},
                    samples,
                    "dose de carreira sobe de 430 para 606 mSv em 20 dias (cruza 75/90/100% do limite)")


# ── 9. Cenário saudável (sem alertas) — caso de controle ────────────────────

def scenario_saudavel():
    astronaut_id = "AST-K"
    days = 5
    samples = []
    for h in range(days * 24):
        ts = START + timedelta(hours=h)
        hour = (START + timedelta(hours=h)).hour
        s = base_sample(astronaut_id, ts, module="hab")
        if hour == 7:
            s["vitals"].update(sleep_hours=jitter(7.2, 0.3), sleep_efficiency_pct=jitter(90, 2),
                                fluid_intake_ml=jitter(2600, 100))
            s["fitness"] = {"exercise_minutes": jitter(100, 10), "resistive_load_pct_baseline": jitter(98, 2),
                             "leg_strength_pct_baseline": jitter(97, 2), "vo2max_ml_kg_min": jitter(46, 1)}
            s["behavioral"] = {"mood_score": jitter(7.4, 0.3), "stress_score": jitter(4, 0.5),
                                "private_comm_minutes": jitter(38, 4)}
            s["ocular"] = {"headache_score": 0}
        samples.append(s)
    write_scenario("saudavel", astronaut_id,
                    {"name": "Tripulante K", "role": "Especialista de missão", "age": 35,
                     "mission": {"name": "ARTEMIS-SIM", "day": 30, "phase": "transito"},
                     "baseline": {"vitals.hr_rest": 58, "vitals.hrv_rmssd_ms": 52,
                                  "fitness.vo2max_ml_kg_min": 46, "behavioral.mood_score": 7.5,
                                  "behavioral.private_comm_minutes": 38}},
                    samples,
                    "todas as métricas dentro do esperado — 0 alertas (caso de controle)")


if __name__ == "__main__":
    scenario_cardiaca()
    scenario_ossea()
    scenario_descondicionamento()
    scenario_atrofia()
    scenario_comportamental()
    scenario_termico()
    scenario_distancia()
    scenario_radiacao()
    scenario_saudavel()
