"""
Gera examples/telemetry.json com um cenário de 7 dias (amostras de hora em hora) para o AST-B:

  dias 1–4  normal
  dias 5–7  CO2 alto à noite na área de dormir → sono curto → cefaleia
  última h  tempestade solar S2 (fluxo de prótons 150 pfu)

Resultado esperado: DIR-RAD-002 (alerta), DIR-ENV-001, DIR-ISO-001, DIR-GRAV-001 (atenção) e
uma correlação pelo sintoma "cefaleia".
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)
OUT = Path(__file__).resolve().parent / "telemetry.json"
START = datetime(2026, 11, 7, 0, 0)
HOURS = 7 * 24

SLEEP = [7.0, 6.9, 7.2, 6.8, 5.2, 5.5, 5.4]
SLEEP_EFF = [90, 91, 89, 90, 82, 84, 83]
HEADACHE = [0, 0, 1, 0, 3, 4, 3]
PVT = [4, 3, 5, 4, 5, 5, 5]
MOOD = [7.5, 7.4, 7.6, 7.2, 6.8, 6.6, 6.7]


def jitter(value, spread):
    return round(value + random.uniform(-spread, spread), 2)


samples = []
for h in range(HOURS):
    ts = START + timedelta(hours=h)
    day = h // 24
    hour = ts.hour
    bad_period = day >= 4
    night = hour >= 22 or hour < 7

    co2 = 2.2
    if bad_period:
        co2 = 3.1 if night else 2.7
    flux = 0.5
    dose = 0.075
    if h == HOURS - 2:
        flux, dose = 15, 0.12
    if h == HOURS - 1:
        flux, dose = 150, 0.35

    s = {
        "astronaut_id": "AST-B",
        "timestamp": ts.isoformat() + "Z",
        "module": "hab-dormitorio" if night else "lab",
        "vitals": {
            "hr": jitter(54 if night else 66, 4),
            "hr_rest": jitter(60, 2),
            "hrv_rmssd_ms": jitter(50, 4),
            "ectopic_beats_per_h": jitter(8, 4),
            "afib_detected": 0,
            "spo2_pct": jitter(97.5, 0.8),
            "bp_sys": jitter(116, 5),
            "bp_dia": jitter(74, 4),
            "resp_rate": jitter(14, 1),
            "core_temp_c": jitter(36.8, 0.2),
        },
        "radiation": {
            "dose_rate_msv_h": dose,
            "cumulative_mission_msv": round(42 * 1.8 + h * 0.075, 2),
            "cumulative_career_msv": round(180 + 42 * 1.8 + h * 0.075, 2),
        },
        "env": {
            "co2_mmhg": jitter(co2, 0.1),
            "o2_pct": 21.0,
            "cabin_temp_c": jitter(22.5, 0.5),
            "humidity_pct": jitter(45, 3),
            "noise_dba": jitter(48 if night else 58, 2),
            "proton_flux_10mev_pfu": flux,
        },
        "mission": {
            "comm_latency_s": 95,
            "comm_available": 1,
            "medkit_min_stock_pct": 64,
            "open_cases_alerta_or_above": 0,
        },
        "symptoms": [],
    }

    if hour == 7:  # métricas diárias, registradas ao acordar
        s["vitals"].update(sleep_hours=SLEEP[day], sleep_efficiency_pct=SLEEP_EFF[day], fluid_intake_ml=2600)
        s["ocular"] = {"headache_score": HEADACHE[day], "near_visual_acuity_logmar_delta": 0.0,
                       "rnfl_thickness_um": 102}
        s["cognitive"] = {"pvt_lapses": PVT[day], "pvt_mean_rt_ms": 265}
        s["behavioral"] = {"mood_score": MOOD[day], "stress_score": 4, "private_comm_minutes": 38}
        s["fitness"] = {"exercise_minutes": 120, "resistive_load_pct_baseline": 98,
                        "leg_strength_pct_baseline": 96, "vo2max_ml_kg_min": 44}
        if HEADACHE[day] >= 3:
            s["symptoms"].append("cefaleia")
    if day == 6 and hour in (14, 20):
        s["symptoms"].append("cefaleia")

    samples.append(s)

OUT.write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
print("Gerado %s (%d amostras)" % (OUT, len(samples)))
