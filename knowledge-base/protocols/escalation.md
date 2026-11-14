# Escalonamento e comunicação

## Cadeia de escalonamento

```
 Motor de regras ──► Agente de IA ──► Astronauta
                         │
                         ├──► CMO (tripulante com treino médico)        [alerta+]
                         ├──► Comandante ("situação médica", sem detalhes) [critico]
                         └──► Solo: médico de voo / psicólogo / especialista
                              (respeita escalation.notify_ground_at da diretiva)
```

## Modo de operação por latência (DIR-DIST-001)

| Latência (uma via) | Modo | Comportamento |
|---|---|---|
| < 10 s (ISS, Lua) | **Assistido** | O agente propõe e o solo confirma decisões de nível `alerta`+ em tempo real |
| 10 s – 5 min | **Híbrido** | Ações imediatas da diretiva são autônomas; decisões de tratamento esperam o solo se o caso não for `critico` |
| > 5 min ou sem comunicação | **Autônomo** | O CMO decide a bordo com o apoio do agente; o solo recebe pacotes assíncronos |

## Pacote assíncrono para o solo

Quando a comunicação é lenta, cada mensagem precisa ser **autossuficiente**: o solo tem que
conseguir responder numa só rodada. Ver o formato em [../schema/case.schema.json](../schema/case.schema.json).

1. **Resumo em uma linha** — "Tripulante B, SANS provável, RNFL +18%, CO₂ médio 3,2 mmHg há 7 dias"
2. **Linha do tempo** — gatilhos, sintomas e ações já executadas, com horário
3. **Dados** — gráficos de tendência das métricas da diretiva + baseline
4. **Hipóteses** — diagnóstico diferencial com a evidência a favor e contra cada uma
5. **O que já foi feito** — ações da diretiva executadas a bordo
6. **Perguntas objetivas** — de preferência sim/não ou múltipla escolha
7. **Plano padrão** — o que a tripulação vai fazer **se a resposta não chegar** até X horas
