# Níveis de alerta

| Nível | Cor | Significado | Quem vê | Ação esperada | O agente abre caso? |
|---|---|---|---|---|---|
| `normal` | 🟢 | Dentro do esperado (inclui adaptações normais ao voo) | Painel do astronauta | Nenhuma | Não |
| `atencao` | 🟡 | Tendência fora do baseline; ainda sem risco imediato | Astronauta + médico de voo (resumo diário) | Ajuste de rotina (sono, exercício, hidratação) | Só se repetir 3x em 7 dias, ou se 2+ diretivas estiverem em atenção ao mesmo tempo |
| `alerta` | 🟠 | Alteração clínica relevante que precisa de investigação | Astronauta + CMO + solo | Seguir as ações da diretiva; o agente investiga | **Sim** |
| `critico` | 🔴 | Risco à vida ou à missão | Toda a tripulação (apenas "emergência médica", sem detalhes) + CMO + solo prioritário | Ação imediata, protocolo de emergência | **Sim**, prioridade máxima |

## Regras gerais

1. **Maior nível vence:** se uma diretiva tem vários gatilhos disparados, o alerta usa o maior nível.
2. **Sem rebaixamento automático:** um caso só baixa de nível quando o agente reavalia e confirma
   (evita "pisca-pisca" de alertas).
3. **Deduplicação:** o mesmo gatilho não gera um novo alerta enquanto houver um caso aberto para
   aquela diretiva. Ele vira uma **atualização** do caso.
4. **Correlação:** quando 2+ diretivas disparam no mesmo período (ex.: CO₂ alto + cefaleia +
   sono ruim), o agente agrupa tudo em **um caso** e trata como hipótese conjunta.
5. **Fadiga de alertas:** na tela do astronauta aparecem no máximo 3 alertas `atencao` por dia.
   Os demais vão para o resumo diário. `alerta` e `critico` sempre aparecem.
6. **Linguagem:** a mensagem ao astronauta é curta, diz **o que fazer** e não usa jargão.
   O pacote ao solo é técnico.
7. **Privacidade:** diretivas com `privacy: restricted` (ex.: saúde comportamental) mostram
   detalhes apenas ao próprio astronauta e ao médico de voo/psicólogo.
