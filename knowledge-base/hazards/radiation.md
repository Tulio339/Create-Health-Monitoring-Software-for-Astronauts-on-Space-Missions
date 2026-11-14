---
hazard: RAD
title: Radiação espacial
directives: [DIR-RAD-001, DIR-RAD-002, DIR-CARD-001]
sources:
  - https://www.nasa.gov/hrp/hazards/
  - NASA-STD-3001 Vol.1 Rev C — limite de exposição de carreira
  - HRP Evidence Report — Risk of Acute Radiation Syndromes due to SPEs
---

# Radiação espacial (RAD)

## O que é
Fora da proteção do campo magnético e da atmosfera da Terra, a tripulação é exposta a:

- **Raios cósmicos galácticos (GCR):** partículas de alta energia, fluxo constante e baixo,
  muito difíceis de blindar. Dano crônico, acumulativo.
- **Eventos de partículas solares (SPE):** rajadas de prótons após erupções solares. Podem
  entregar dose alta em horas. Risco **agudo**.
- **Cinturões de Van Allen / Anomalia do Atlântico Sul:** picos ao cruzar essas regiões (órbita baixa).

Taxa de dose típica: ~0,3–0,8 mSv/dia na ISS; ~1,8 mSv/dia em trânsito para Marte.

## Efeitos no corpo humano

| Prazo | Efeito | Sintomas / sinais observáveis |
|---|---|---|
| Agudo (horas–dias, dose alta > ~0,5–1 Gy) | Síndrome aguda da radiação (prodrômica) | Náusea, vômito, anorexia, fadiga, cefaleia, eritema de pele |
| Agudo | Supressão hematopoiética | Queda de linfócitos (primeiro sinal laboratorial), infecções |
| Médio prazo | Sistema nervoso central | Queda de desempenho cognitivo, alteração de humor, lentidão motora |
| Longo prazo | Câncer | Sem sintoma na missão; controlado por limite de dose |
| Longo prazo | Doença cardiovascular / degenerativa | Disfunção endotelial, possível arritmia |
| Longo prazo | Catarata | Visão turva tardia |

## Indicadores monitorados
- `radiation.dose_rate_msv_h` — dosímetro pessoal/ambiental
- `radiation.cumulative_mission_msv` e `radiation.cumulative_career_msv`
- `env.proton_flux_10mev_pfu` — fluxo de prótons > 10 MeV (GOES / sensores de bordo)
- Sintomas relatados: náusea, vômito, fadiga, eritema
- Laboratório de bordo (quando disponível): contagem de linfócitos

## Limites de referência
- **Carreira:** 600 mSv de dose efetiva (NASA, padrão atual, todos os astronautas).
- **Órgãos formadores de sangue (BFO):** 250 mGy-Eq em 30 dias; 500 mGy-Eq ao ano.
- **Clima espacial NOAA:** S1 ≥ 10 pfu; S2 ≥ 100 pfu; S3 ≥ 1.000 pfu; S4 ≥ 10.000 pfu.

## Contramedidas
- Abrigo de tempestade (área mais blindada, ex.: cercado por água/suprimentos).
- Limitar EVA durante SPE ou cruzamento da Anomalia do Atlântico Sul.
- Planejamento de missão pela dose (ALARA — tão baixo quanto razoavelmente possível).
- Antieméticos no kit médico para pródromo.

## Interações com outros riscos
- **DIST:** latência impede orientação em tempo real durante um SPE; o protocolo de abrigo precisa ser autônomo.
- **ISO:** sintomas cognitivos da radiação podem ser confundidos com fadiga ou efeito do isolamento.
