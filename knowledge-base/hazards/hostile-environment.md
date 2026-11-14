---
hazard: ENV
title: Ambientes hostis e fechados
directives: [DIR-ENV-001, DIR-ENV-002, DIR-ISO-001, DIR-GRAV-001]
sources:
  - https://www.nasa.gov/hrp/hazards/
  - NASA-STD-3001 Vol.2 — Human Factors, Habitability, and Environmental Health
  - Spacecraft Maximum Allowable Concentrations (SMAC)
---

# Ambientes hostis e fechados (ENV)

## O que é
A nave é o ecossistema inteiro da tripulação: ar, água, temperatura, ruído, luz e micro-organismos
são controlados por máquinas. Uma falha ou desvio afeta todos ao mesmo tempo.

## Efeitos no corpo humano

| Fator | Efeito | Sintomas / sinais observáveis |
|---|---|---|
| **CO₂ elevado** (sem convecção, bolsões de CO₂ se formam) | Hipercapnia leve | Cefaleia, letargia, dificuldade de concentração, respiração acelerada; possível piora de SANS |
| Temperatura / umidade | Estresse térmico | Hipertermia, desidratação, fadiga; em EVA, risco maior |
| Ruído contínuo | Perda auditiva, estresse | Zumbido, sono pior, irritabilidade |
| Microbiologia | Micróbios mais virulentos + imunidade baixa | Infecção, febre, erupções de pele |
| Contaminantes químicos | Toxicidade (vazamento de amônia, glicol, combustão) | Irritação de olhos/vias aéreas, tosse, náusea |
| Iluminação | Desregulação circadiana | Ver ISO |
| Poeira (Lua/Marte) | Regolito abrasivo e reativo | Irritação ocular/respiratória |

## Indicadores monitorados
- `env.co2_mmhg` (por módulo, idealmente perto da cabeça na área de dormir)
- `env.cabin_temp_c`, `env.humidity_pct`, `env.noise_dba`
- `env.o2_pct`, `env.ammonia_ppm` (alarmes de contaminação)
- `vitals.core_temp_c`, `vitals.resp_rate`, `vitals.spo2_pct`

## Limites de referência (protótipo)
- **CO₂:** meta operacional ≤ 2,5 mmHg (~3.300 ppm); sintomas aumentam acima de ~3 mmHg.
  Na Terra, o ar tem ~0,3 mmHg.
- **Temperatura da cabine:** 18–27 °C.
- **Ruído:** ≤ ~50 dBA nas áreas de dormir.
- **SpO₂:** normal ≥ 95%.

## Contramedidas
- Ventilação ativa na área de dormir; ajustar o sistema de remoção de CO₂.
- Máscaras / respiradores em caso de contaminante.
- Protetores auriculares.
- Monitoramento microbiológico de água e superfícies.
