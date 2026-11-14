# Fluxo de investigação e acompanhamento

## Ciclo de vida de um caso

```
             alerta (motor)
                  │
                  ▼
   ┌──────────► ABERTO ──────────────┐
   │              │                  │  correlação: há outro caso aberto
   │              ▼                  │  com sintoma/métrica em comum?
   │         INVESTIGANDO ◄──────────┘  → agrupa no mesmo caso
   │     (dados, diferencial,
   │      perguntas ao astronauta)
   │              │
   │              ▼
   │        ACOMPANHANDO ◄──────┐
   │     (ações da diretiva,    │ reavaliação agendada
   │      follow_up)  ──────────┘ (critério de saída não atendido)
   │              │
   │   nível sobe │          precisa do solo
   └──────────────┤ ───────► AGUARDANDO_SOLO ──(resposta ou prazo)──► ACOMPANHANDO
                  │
                  ▼  todos os exit_criteria atendidos
              ENCERRADO  (+ relatório para o prontuário)
```

## Passo a passo do agente

### 1. Abertura (≤ 1 min após o alerta)
- `get_directive(directive_id)`
- Mostrar ao astronauta a `astronaut_message` do nível (`send_astronaut_message`)
- Nível `critico` → `notify_crew_medical(["cmo"])` imediatamente, **antes** de investigar

### 2. Investigação
- `get_telemetry(metrics_da_diretiva, "7d")` + `get_baseline`
- Para cada sintoma em `symptoms_to_check` ainda não relatado → incluir nas perguntas
- `lookup_symptom` para cada sintoma relatado → montar hipóteses
- Diretivas em `differential` → `get_telemetry` das métricas-chave de cada uma para confirmar ou descartar
- `ask_astronaut` (no máx. 3 perguntas, estruturadas)
- `update_case(hypotheses=[...])`

### 3. Plano
- Recomendar as `actions[nível]` da diretiva, explicando cada uma em uma frase
- Nível ≥ `escalation.notify_ground_at` → `send_ground_packet` com `default_plan_if_no_answer`
- `schedule_followup(follow_up[nível].interval)`

### 4. Reavaliação (em cada follow-up)
- Ler os dados novos desde a última revisão
- `evaluate_exit_criteria`
  - Todos atendidos → encerrar (`critico` exige registro do CMO/médico de voo)
  - Piorou → subir o nível, repetir a etapa 1 para o novo nível
  - Estável → manter; se `follow_up.duration` estourar sem melhora → escalar para o solo

### 5. Encerramento
- Resumo final: o que disparou, hipótese confirmada, ações tomadas, tempo até a resolução
- Mensagem positiva ao astronauta ("Seus indicadores voltaram ao normal. Obrigado por...")
- O caso vira um exemplo histórico (útil para melhorar as diretivas depois da missão)

---

## Exemplo de caso correlacionado

**Gatilhos:** `DIR-ENV-001/co2-acima-meta` (atenção) + `DIR-ISO-001/sono-curto-3-noites`
(atenção) + o astronauta relata `cefaleia`.

**Raciocínio do agente:**
> Três sinais no mesmo período. O índice de sintomas liga `cefaleia` a DIR-ENV-001 (alta),
> DIR-GRAV-001 (alta) e DIR-ISO-001 (média). CO₂ médio na área de dormir: 3,1 mmHg nas últimas
> 3 noites (meta ≤ 2,5). Sono: média de 5,4 h (baseline 6,8 h). Último OCT: RNFL +4% (normal).
>
> **Hipótese principal:** CO₂ alto na área de dormir piorando o sono e causando cefaleia.
> **Descartar:** SANS (OCT normal, mas agendar acuidade de perto em 72 h por precaução).

**Para o astronauta:**
> "O CO₂ perto do seu saco de dormir ficou um pouco alto nas últimas noites. Isso pode
> explicar a dor de cabeça e o sono ruim. Hoje à noite, ligue o ventilador pessoal virado para
> você. Vamos ver como fica amanhã."

**Caso:** 1 caso agrupando 3 diretivas, nível `atencao`, reavaliação em 24 h,
saída = CO₂ ≤ 2,5 mmHg por 2 h **e** sono ≥ 6,5 h por 3 noites.
