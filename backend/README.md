# Monitor de Saúde de Astronautas

Protótipo de hackathon (desafio estilo NASA Space Apps): um sistema que detecta alterações de
saúde de astronautas em missões longas e abre um **caso de acompanhamento** investigado por um
agente de IA — usando o modelo clínico completo do [`knowledge-base/`](../knowledge-base) (pasta
irmã deste repositório): 12 diretivas baseadas nos 5 riscos do NASA Human Research Program, níveis
atenção/alerta/crítico, diagnóstico diferencial e critérios de saída.

> Protótipo educacional. Não é um dispositivo médico.

## Como rodar

```bash
pip install -r requirements.txt

python simulador_kb.py   # 1x: popula o banco com os 10 astronautas e cenários do knowledge-base
python api.py            # sobe a API em http://127.0.0.1:8000
```


Para ver um cenário "ao vivo" (a telemetria chegando aos poucos e o motor abrindo/escalando o
caso sozinho), abra **outro terminal** e rode:


```bash
python sensores_kb.py --cenario cardiaca --intervalo 1     # uma amostra por segundo
```

Cenários disponíveis: `original` (AST-B) e os 9 em
[`knowledge-base/examples/scenarios/`](../knowledge-base/examples/scenarios) — `cardiaca`,
`ossea`, `descondicionamento`, `atrofia`, `comportamental`, `termico`, `distancia`, `radiacao`,
`saudavel` (caso de controle, 0 alertas).

O agente de investigação (chat) precisa do Ollama aberto com o modelo baixado:

```bash
ollama pull qwen2.5:7b
```

Sem o Ollama, todo o resto funciona; só o chat avisa que está indisponível.

> **Windows:** rode `python api.py`, e não `uvicorn api:app --reload`. O modo `--reload` impede o
> agente de abrir o servidor MCP como subprocesso.

> **Painel web:** `api.py` ainda tenta servir um painel estático em `frontend/` (HTML/JS/CSS), mas
> essa pasta não existe neste repositório — é um gap conhecido, fora do escopo desta etapa. A API
> funciona normalmente sem ela (o mount só acontece se a pasta existir).

## O ciclo que o sistema resolve

**medir → detectar (determinístico) → investigar (IA) → agir → acompanhar → encerrar**

1. **Medir:** a telemetria chega no formato de
   [`telemetry.schema.json`](../knowledge-base/schema/telemetry.schema.json) — simulada por
   [`simulador_kb.py`](simulador_kb.py)/[`sensores_kb.py`](sensores_kb.py), vinda dos cenários do knowledge-base.
2. **Detectar:** [`motor.py`](motor.py) roda o motor de regras determinístico do knowledge-base
   (`engine/rules_engine.py`) contra cada diretiva. A IA **nunca** decide se um alerta dispara.
3. **Abrir caso:** alertas de nível `alerta`/`crítico` (ou correlacionados por sintoma) abrem um
   caso (`case_`), seguindo o ciclo de vida de
   [`agent/investigation-workflow.md`](../knowledge-base/agent/investigation-workflow.md).
4. **Investigar/agir:** o agente de IA ([`agente.py`](agente.py) + [`servidor_mcp.py`](servidor_mcp.py) +
   [`ferramentas_kb.py`](ferramentas_kb.py)) usa as 15 ferramentas para buscar dados, cruzar
   sintomas, recomendar as ações da diretiva e registrar tudo no caso.
5. **Acompanhar/encerrar:** a cada reavaliação, `motor.reavaliar_casos_pendentes` confere o
   critério de saída; crítico só fecha com registro do CMO/médico de voo.

## Estrutura

```
backend/
├── api.py                  API FastAPI: liga tudo
├── motor.py                adapta o SQLite ao rules_engine.py do knowledge-base; abre/atualiza casos
├── simulador_kb.py         popula o banco com os astronautas e cenários do knowledge-base
├── sensores_kb.py          replay ao vivo de um cenário (chama o motor a cada lote)
├── ferramentas_kb.py       as 15 ferramentas do agente (knowledge-base/agent/tools.json + get_open_cases)
├── prompt_kb.py            monta o system prompt a partir de knowledge-base/agent/system-prompt.md
├── servidor_mcp.py         expõe as ferramentas e o prompt para o agente (MCP)
├── agente.py               agente com LLM (LangChain + Ollama, via MCP)
├── exportacoes/            saída de check_medkit/exportações manuais (git-ignorado)
└── dados_simulados/
    └── health.db           banco SQLite (criado pelo simulador; git-ignorado)
```

A base de conhecimento (diretivas, motor de regras de referência, schemas, cenários de
telemetria) vive em [`../knowledge-base/`](../knowledge-base), importada diretamente por
`motor.py` (não duplicada aqui).

## Como os dados passam

**Uma leitura de telemetria:** `sensores_kb.py` → grava em `telemetry` → `motor.avaliar_astronauta`
(roda as 12 diretivas) → grava `alert` → abre/atualiza `case_` + `case_timeline`.

**Uma pergunta no chat:** `POST /api/chat` → agente (LLM + diretiva de `system-prompt.md`) → escolhe
uma das 15 ferramentas → `servidor_mcp.py` → `ferramentas_kb.py`/`motor.py` → resultado volta ao
LLM → resposta explicada.

O LLM **nunca** inventa números, diretivas nem decide níveis: isso sempre vem do código. Ele só
escolhe qual ferramenta chamar e explica o resultado — inclusive o contexto do caso atual (dia de
missão, modo de operação, casos abertos), que ele busca sob demanda via `get_open_cases` em vez de
receber pronto, para nunca trabalhar com dado desatualizado numa conversa longa.

## Rotas da API

| Rota | O que faz |
|---|---|
| `GET /api/astronauts` | lista os astronautas com o status geral (pior nível entre os casos abertos) |
| `GET /api/astronauts/{id}/status` | contexto completo (`get_open_cases`): dia/fase da missão, modo de operação, casos e alertas |
| `GET /api/astronauts/{id}/telemetry?metrics=...&window=7d` | série temporal de métricas (`get_telemetry`) |
| `GET /api/astronauts/{id}/cases` e `GET /api/cases/{case_id}` | casos do astronauta / detalhe com linha do tempo |
| `GET /api/directives` e `/api/directives/{id}` | as 12 diretivas do knowledge-base |
| `POST /api/reports` e `GET /api/reports` | pacote assíncrono para o solo (`send_ground_packet`), com atraso de comunicação |
| `POST /api/chat` | conversa com o agente de investigação |

Documentação interativa automática: **http://127.0.0.1:8000/docs**

## Roteiro sugerido para a demo

1. `python sensores_kb.py --cenario cardiaca --intervalo 1`: acompanhe no terminal o caso de
   arritmia escalando de "sem alerta" para `crítico` nos últimos minutos de replay.
2. `GET /api/astronauts/AST-C/cases` num segundo terminal: mostre o caso aberto automaticamente.
3. Pergunte no chat (`POST /api/chat`, astronauta `AST-C`): "como eu estou?" — o agente deve
   investigar (telemetria, diretiva, diagnóstico diferencial) sem inventar números.
4. Mostre `GET /api/cases/{case_id}`: a linha do tempo completa (alerta, notificação à
   tripulação, perguntas, ações, reavaliações).
5. Rode `python sensores_kb.py --cenario saudavel` para mostrar o caso de controle: 0 alertas.

## O que ficou de fora (de propósito)

Painel visual (o `frontend/` do backend nunca existiu neste repositório — há um `frontend/` React
separado na raiz do monorepo, com seu próprio modelo de dados, ainda não ligado a esta API),
scheduler de parede real para `schedule_followup` (usa o relógio da simulação), fila de resposta
estruturada para `ask_astronaut`/`notify_crew_medical`/`send_ground_packet` (fica tudo registrado
no caso, sem mecanismo de entrega).

## Antes de apresentar

Revisem as diretivas em [`../knowledge-base/directives/`](../knowledge-base/directives) contra as
fontes da NASA (Human Research Program). Os limiares são **referências para protótipo**, não
orientação médica operacional (ver aviso em [`knowledge-base/README.md`](../knowledge-base/README.md)).
