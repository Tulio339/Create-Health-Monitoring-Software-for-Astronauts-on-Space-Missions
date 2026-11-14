---
hazard: ISO
title: Isolamento e confinamento
directives: [DIR-ISO-001, DIR-ISO-002]
sources:
  - https://www.nasa.gov/hrp/hazards/
  - HRP Evidence Report — Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders
  - HRP Evidence Report — Risk of Performance Decrements due to Sleep Loss and Circadian Desynchronization
---

# Isolamento e confinamento (ISO)

## O que é
Tripulação pequena, em espaço reduzido, por meses ou anos, com carga de trabalho alta, longe de
família e amigos, com pouca privacidade e estímulos monótonos.
Em órbita baixa ocorrem ~16 nasceres do sol por dia, o que desregula o ritmo circadiano.

## Efeitos no corpo humano

| Sistema | Efeito | Sintomas / sinais observáveis |
|---|---|---|
| Sono | Privação crônica (média ~6 h/noite na ISS) | Sonolência diurna, lapsos de atenção, irritabilidade |
| Circadiano | Dessincronização | Insônia, horário de sono irregular, fadiga, queda de desempenho |
| Cognição | Queda de vigilância e memória de trabalho | Mais lapsos no PVT, erros operacionais, lentidão |
| Comportamento | Humor deprimido, ansiedade, apatia | Retraimento social, menos comunicação, perda de interesse |
| Tripulação | Conflito interpessoal | Tensão, isolamento de um membro, queda de coesão |
| Psicossomático | Estresse crônico | Cefaleia, queixas gastrointestinais, VFC reduzida, cortisol alto |

## Indicadores monitorados
- `vitals.sleep_hours`, `vitals.sleep_efficiency_pct` — actigrafia
- `cognitive.pvt_lapses`, `cognitive.pvt_mean_rt_ms` — teste de vigilância psicomotora (3 min)
- `behavioral.mood_score` (0–10, autorrelato diário), `behavioral.stress_score`
- `behavioral.private_comm_minutes` — contato com família/psicólogo
- `vitals.hrv_rmssd_ms` — marcador fisiológico de estresse/recuperação

## Contramedidas
- Iluminação dinâmica (luz azul enriquecida de manhã, luz quente antes de dormir).
- Higiene do sono, horário protegido, máscaras e tampões auditivos.
- Conferências privadas com família e apoio psicológico.
- Tempo livre, atividades significativas, autonomia nas tarefas.
- Melatonina / hipnóticos de curta duração (conforme o médico de voo).

## Interações com outros riscos
- **DIST:** sem apoio em tempo real, a sensação de isolamento aumenta.
- **ENV:** CO₂, ruído e temperatura pioram o sono e a cognição.
- **RAD:** efeitos sobre o SNC se sobrepõem a declínio cognitivo.

## Cuidado para o agente
Mudanças comportamentais são **sensíveis**. O agente deve usar linguagem de apoio, sem julgamento,
preservar a privacidade (dados psicológicos vão só para o médico de voo / psicólogo) e
**nunca** rotular diagnósticos psiquiátricos.
