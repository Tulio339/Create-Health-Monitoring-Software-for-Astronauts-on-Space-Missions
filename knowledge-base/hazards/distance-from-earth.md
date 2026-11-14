---
hazard: DIST
title: Distância da Terra
directives: [DIR-DIST-001, DIR-RAD-002]
sources:
  - https://www.nasa.gov/hrp/hazards/
  - HRP Evidence Report — Risk of Adverse Health Outcomes due to Inflight Medical Conditions
---

# Distância da Terra (DIST)

## O que é
Quanto mais longe a missão, menor o suporte da Terra:

| Destino | Latência de comunicação (uma via) | Evacuação |
|---|---|---|
| ISS | < 1 s | Horas |
| Lua | ~1,3 s | ~3 dias |
| Marte | 3–22 min (+ apagão de ~2 semanas na conjunção solar) | Impossível |

Não dá para reabastecer o kit médico, a tripulação não tem um médico especialista a bordo e a
equipe médica de solo não consegue orientar em tempo real.

## Efeitos (indiretos) na saúde
- Uma condição tratável na Terra pode virar risco de vida.
- Atraso na decisão clínica durante uma emergência.
- Estoque de medicamentos limitado, com validade reduzida pela radiação.
- Carga psicológica: sensação de "estar por conta própria".

## O que o sistema faz por esse risco
O sistema **é** a principal contramedida para DIST:

1. **Autonomia:** o motor de regras e o agente rodam **a bordo**, sem depender da Terra.
2. **Protocolos de ação imediata:** cada diretiva tem ações que a tripulação executa sozinha.
3. **Comunicação assíncrona:** o agente monta um pacote de caso (resumo + dados + perguntas) para o
   solo, sabendo que a resposta vai demorar.
4. **Inventário médico:** o agente consulta o que existe no kit antes de recomendar algo.
5. **Escalonamento por latência:** se `mission.comm_latency_s` é alto, o protocolo considera que o
   solo **não** vai responder a tempo (ver [../protocols/escalation.md](../protocols/escalation.md)).

## Indicadores monitorados
- `mission.comm_latency_s`, `mission.comm_available`
- `mission.medkit_inventory` (estoque por item)
- Tempo entre abrir um caso e receber resposta do solo
