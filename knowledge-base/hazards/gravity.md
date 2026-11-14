---
hazard: GRAV
title: Campos de gravidade alterados
directives: [DIR-GRAV-001, DIR-GRAV-002, DIR-GRAV-003, DIR-GRAV-004, DIR-CARD-001]
sources:
  - https://www.nasa.gov/hrp/hazards/
  - HRP Evidence Report — Spaceflight Associated Neuro-ocular Syndrome (SANS)
  - HRP Evidence Report — Risk of Early Onset Osteoporosis due to Spaceflight
  - HRP Evidence Report — Risk of Impaired Performance due to Reduced Muscle Mass, Strength & Endurance
  - HRP Evidence Report — Risk of Orthostatic Intolerance during Re-exposure to Gravity
---

# Campos de gravidade alterados (GRAV)

## O que é
Três transições de gravidade: Terra → microgravidade (trânsito) → gravidade parcial
(Lua 0,16 g, Marte 0,38 g) → Terra. Cada transição exige readaptação.

## Efeitos no corpo humano

| Sistema | Mecanismo | Sintomas / sinais observáveis | Diretiva |
|---|---|---|---|
| Fluidos / olhos | Fluidos sobem para a cabeça; pressão intracraniana possivelmente alta | Visão de perto turva, edema de disco óptico, dobras de coroide, cefaleia, rosto inchado | DIR-GRAV-001 |
| Ossos | Sem carga mecânica: reabsorção > formação | Perda de ~1–1,5% de densidade mineral por **mês** (quadril/coluna), cálcio alto na urina, dor lombar/flanco (cálculo renal) | DIR-GRAV-002 |
| Coração / vasos | Volume plasmático cai 10–15%, coração se descondiciona | Intolerância ortostática na volta (tontura, desmaio), FC de repouso alterada, VO₂máx menor | DIR-GRAV-003 |
| Músculos | Atrofia por desuso (mais nos músculos antigravitacionais) | Perda de força/massa (até ~20% em missões longas sem exercício), fadiga | DIR-GRAV-004 |
| Ritmo cardíaco | Remodelação + eletrólitos + estresse | Palpitações, FA, extrassístoles | DIR-CARD-001 |
| Vestibular | Conflito sensorial | Enjoo espacial (primeiros 2–3 dias), desorientação, náusea | (sintoma) |
| Coluna | Discos se expandem | Dor lombar, ganho de ~3–5 cm de altura | (sintoma) |
| Imunidade | Desregulação | Reativação de herpes latente, erupções na pele | (sintoma) |

## Indicadores monitorados
- **Olhos:** `ocular.near_visual_acuity_logmar_delta`, `ocular.rnfl_thickness_um` (OCT), `ocular.headache_score`
- **Ossos:** `lab.urine_calcium_mg_day`, `lab.ctx_ng_ml` (marcador de reabsorção), `imaging.bmd_change_pct`
- **CV:** `vitals.hr_rest`, `vitals.bp_sys`, `vitals.bp_dia`, `vitals.hrv_rmssd_ms`, `fitness.vo2max_ml_kg_min`
- **Músculos:** `fitness.exercise_minutes`, `fitness.resistive_load_pct_baseline`, `fitness.leg_strength_pct_baseline`
- **Hidratação:** `vitals.fluid_intake_ml`, `vitals.body_mass_kg`

## Contramedidas
- **Exercício diário (~2 h):** aparelho resistivo (ARED), esteira com arnês, cicloergômetro.
- Dieta: cálcio, vitamina D, ingestão de sódio controlada; bifosfonatos (estudados).
- Hidratação para prevenir cálculo renal.
- Pressão negativa no corpo inferior (LBNP) e manguitos de coxa (estudados para SANS).
- Carga de fluido + traje anti-G antes da reentrada.
