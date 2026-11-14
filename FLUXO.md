# Fluxo do sistema — quem chama quem

Este repositório tem três partes. Este documento explica como elas se conectam: qual arquivo
chama qual, qual rota chama qual função, e por onde a informação passa — da telemetria simulada
até a tela do astronauta.

```
knowledge-base/          backend/                         frontend/
─────────────────        ─────────────────────            ─────────────────
directives/*.yaml   ◄──  motor.py                          App.tsx
schema/*.json             │  (importa engine/rules_engine   │
agent/system-prompt.md    │   do knowledge-base)            ├─ api.ts  ──HTTP──►  backend/api.py
agent/tools.json          │                                 ├─ lib/classify.ts   (cálculo próprio,
hazards/*.md, protocols/  ├─ simulador_kb.py                ├─ lib/alerts.ts      não usa o motor/
examples/scenarios/*  ──► ├─ sensores_kb.py                 ├─ lib/dashboard.ts   casos do backend)
                           ├─ ferramentas_kb.py              └─ pages/*.tsx
                           ├─ servidor_mcp.py (MCP)
                           ├─ prompt_kb.py
                           └─ agente.py (LangChain+Ollama)
```

**Ponto central:** o `knowledge-base/` nunca é duplicado. `backend/motor.py` importa
`knowledge-base/engine/rules_engine.py` diretamente (via `sys.path`); `ferramentas_kb.py` e
`prompt_kb.py` leem `directives/*.yaml`, `hazards/*.md`, `symptoms/index.yaml` e
`agent/system-prompt.md` direto do disco a cada chamada.

---

## 1. Backend — arquivo por arquivo

| Arquivo | Chama | Não chama / não sabe de |
|---|---|---|
| [`api.py`](backend/api.py) | `motor.py`, `ferramentas_kb.py`, `agente.py` (só no `/api/chat`, import tardio) | `servidor_mcp.py` diretamente (isso é trabalho do `agente.py`) |
| [`motor.py`](backend/motor.py) | `knowledge-base/engine/rules_engine.py` | nada do `frontend/` |
| [`ferramentas_kb.py`](backend/ferramentas_kb.py) | `motor.py`, `engine/rules_engine.py`, lê `directives/`, `hazards/`, `symptoms/index.yaml` | `servidor_mcp.py` (é o contrário: ele é registrado lá) |
| [`prompt_kb.py`](backend/prompt_kb.py) | lê `agent/system-prompt.md` | o pacote `mcp` (de propósito — dá pra testar sem instalar o agente) |
| [`servidor_mcp.py`](backend/servidor_mcp.py) | `ferramentas_kb.py` (registra as 15 funções como tools MCP), `prompt_kb.py` (registra como prompt MCP) | `motor.py` diretamente (sempre via `ferramentas_kb`) |
| [`agente.py`](backend/agente.py) | sobe `servidor_mcp.py` como **subprocesso** (stdio) via `MultiServerMCPClient`, chama `create_agent` do LangChain | o Python de `ferramentas_kb.py` diretamente — só fala com ele pelo protocolo MCP |
| [`simulador_kb.py`](backend/simulador_kb.py) | `motor.py` (`conectar`, `init_db`), lê `knowledge-base/examples/{,scenarios/}*.json` | o motor de regras (só grava telemetria; não avalia) |
| [`sensores_kb.py`](backend/sensores_kb.py) | `motor.py` (`avaliar_astronauta`, `reavaliar_casos_pendentes`), `simulador_kb.py` (`seed_astronauta`) | — |

**Por que o agente fala com as ferramentas por um subprocesso e não por import direto?**
Porque é assim que o MCP (Model Context Protocol) funciona: o LLM só pode chamar o que está
exposto como *tool* do protocolo, não qualquer função Python. `servidor_mcp.py` é a borda que
traduz `ferramentas_kb.py` para esse protocolo; `agente.py` fala só com essa borda.

---

## 2. O caminho de uma leitura de telemetria até a tela

```
1. sensores_kb.py lê knowledge-base/examples/scenarios/<cenario>_telemetry.json
         │
         ▼
2. INSERT INTO telemetry (astronaut_id, timestamp, module, data_json, source)
         │
         ▼
3. motor.avaliar_astronauta(astronaut_id)
     - motor.carregar_amostras() reconstrói as amostras aninhadas a partir do SQLite
     - rules_engine.run(amostras, perfil, DIRECTIVES)   ◄── knowledge-base/engine/rules_engine.py
     - cada diretiva disparada vira uma linha em `alert`
         │
         ▼
4. motor._abrir_ou_atualizar_casos()
     - nível alerta/crítico, ou correlação por sintoma  → abre/atualiza `case_` + `case_timeline`
         │
         ▼
5. motor.reavaliar_casos_pendentes()  (chamado a cada lote por sensores_kb.py)
     - rules_engine.evaluate_exit_criteria() nos casos com next_review_at vencido
     - crítico só vai para "aguardando_solo" (exige CMO); os demais encerram sozinhos
```

A partir daqui, dois caminhos **independentes** consomem esses dados:

### 2a. O agente de IA (investiga o caso)
`POST /api/chat` → `agente.py` (modo `investigacao`) → MCP → uma das 15 ferramentas de
`ferramentas_kb.py` (ex.: `get_open_cases`, `get_telemetry`, `get_directive`,
`search_knowledge`) → lê `telemetry`/`case_`/`alert` no SQLite e os arquivos do knowledge-base →
volta pro LLM, que **nunca inventa número nem decide nível** — só escolhe a ferramenta e explica.

### 2b. O painel React (mostra os números)
Ver seção 3 — pra **ler**, o painel não consulta `case_`/`alert` nem diretiva nenhuma: pega só os
números brutos (`telemetry`) via `/api/measurements`/`/api/baselines`/`/api/astronauts` e calcula o
próprio verde/amarelo/vermelho no navegador, com regras mais simples (`frontend/src/lib/classify.ts`).
São dois sistemas de alerta paralelos, de propósito — o painel funciona mesmo se o agente/MCP/Ollama
estiverem fora do ar. Mas pra **escrever** (medição manual, teste de reação, grade de Amsler), o
painel agora entra no mesmo cano do passo 3 acima: `POST /api/measurements` grava uma amostra de
telemetria de verdade e chama `motor.avaliar_astronauta` na hora — uma medição digitada pode abrir
ou atualizar um caso de verdade, exatamente como uma leitura simulada.

---

## 3. Frontend ↔ backend: rota por rota

Todo acesso a dado do frontend passa por **um único arquivo**: [`frontend/src/api.ts`](frontend/src/api.ts).
Os componentes/páginas nunca chamam `fetch` diretamente.

| Função em `api.ts` | Rota HTTP chamada | Handler em `backend/api.py` | Vem de onde no backend |
|---|---|---|---|
| `getAstronauts()` | `GET /api/astronauts` | `listar_astronautas` | tabela `astronaut` + `motor.mission_start_date` |
| `getMeasurements(filtro)` | `GET /api/measurements?astronaut_id=` | `medicoes` | `_serie_medicoes_frontend` → tabela `telemetry`, achatada |
| `getBaselines(id?)` | `GET /api/baselines?astronaut_id=` | `baselines` | `astronaut.baseline_json`, achatado |
| `saveMeasurements(medições)` | `POST /api/measurements` | `registrar_medicoes` | grava em `telemetry` + chama `motor.avaliar_astronauta` (pode abrir caso) |
| `getIndicatorInfo`, `getBodyRegions`, `getEnvironments` | — (nenhuma) | — | `frontend/src/knowledge/*.json`, local, sem relação com o backend |
| `getAlertStatuses`, `setAlertStatus`, `getEnvironmentId` | — (nenhuma) | — | só `localStorage` do navegador, de propósito (ver §4) |

Quem chama `api.ts`:

```
App.tsx ──► getAstronauts, getMeasurements, getBaselines, getIndicatorInfo, ...
  │
  ├─► lib/dashboard.ts   (buildPanelsFor: junta medições + baseline + classify.ts → Panel[])
  ├─► lib/alerts.ts      (buildAlerts: agrupa leituras amarelas/vermelhas em episódios)
  └─► pages/*.tsx         (Dashboard, BodyMap, IndicatorDetail, Tests, RecordMeasurement, Alerts)
         ├─► RecordMeasurement.tsx ──► saveMeasurements()
         ├─► components/ReactionTest.tsx ──► saveMeasurements()
         └─► components/AmslerTest.tsx ──► saveMeasurements()
```

`saveMeasurements` grava no `localStorage` **e**, de melhor esforço (sem esperar, sem travar a
tela se falhar), manda o mesmo payload pro `POST /api/measurements`. Offline ou com o backend fora
do ar, a medição continua valendo só neste navegador — a tela não quebra, só não vira telemetria
real nem é avaliada pelo motor de regras até a próxima tentativa. Quando o POST funciona,
`getMeasurements` deduplica (chave astronauta+indicador+horário) pra não contar a mesma leitura
duas vezes depois que ela também passa a vir da API.

### Conversões que `backend/api.py` faz (não são só troca de nome)

| Indicador do frontend | Métrica do knowledge-base | Conversão |
|---|---|---|
| `heart_rate`, `bp_systolic`, `bp_diastolic`, `temperature`, `spo2`, `sleep`, `exercise`, `reaction_time` | `vitals.*` / `fitness.*` / `cognitive.*` | só renomeia (mesma escala, mesma unidade) |
| `mood` | `behavioral.mood_score` | **÷ 2** — knowledge-base usa 0–10, frontend usa 1–5 |
| `radiation` | `radiation.dose_rate_msv_h` | **não é o mesmo campo que o nome sugere.** O frontend soma cada leitura como se fosse a dose *daquele período* (`dashboard.ts` faz `total += m.value`). `radiation.cumulative_career_msv` já vem acumulado — se fosse passado direto, a soma do frontend dobraria a conta. Por isso o backend manda `dose_rate_msv_h × horas desde a amostra anterior` (o incremento), não o total. |
| `glucose`, `amsler_marks`, `amsler_central` | `lab.glucose_mg_dl`, `ocular.amsler_marks`, `ocular.amsler_central` | **extensões nossas** — não existem no telemetry.schema.json original do knowledge-base nem em nenhum gatilho de diretiva. São guardadas e devolvidas normalmente pela API, só não alimentam nenhum alerta/caso do motor de regras (nenhuma diretiva as referencia). |

`GET /api/baselines` também aproxima o desvio-padrão (`std`) como 5% da média, porque o
knowledge-base só guarda a média do pré-voo — não existe desvio-padrão medido em lugar nenhum do
modelo. Está marcado como aproximação no código (`backend/api.py`, função `baselines`).

---

## 4. O que fica só no navegador (de propósito)

Medição manual, teste de reação e grade de Amsler **agora chegam no backend de verdade**
(`POST /api/measurements`, ver §3) e passam pelo motor de regras — testei registrando uma
frequência cardíaca manual de 140 bpm e vi o caso de `DIR-CARD-001` abrir de verdade. O que
continua só no navegador, de propósito:

- **Status de alerta dado pelo usuário** (`new`/`seen`/`resolved`) e **ambiente escolhido no
  seletor**: preferência de interface, não dado de telemetria — não tem por que existir no backend.
- **A cópia local da medição em si**, enquanto o `POST` não é confirmado (ou se falhar): é o que
  garante a tela funcionar offline e responder na hora, sem esperar rede.

## 5. Como rodar as duas pontas

```bash
# terminal 1 — backend
cd backend
pip install -r requirements.txt
python simulador_kb.py
python api.py                      # http://127.0.0.1:8000

# terminal 2 — frontend
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

CORS já está liberado em `backend/api.py` (`CORSMiddleware` com `allow_origin_regex`) para
qualquer porta em `localhost`/`127.0.0.1` — cobre o Vite trocando de porta sozinho quando a 5173
já está ocupada (5174, 5175...) ou rodando `npm run preview` (4173). Se o backend não estiver em
`127.0.0.1:8000`, ajuste `VITE_API_BASE_URL` em `frontend/.env.local` (ver `frontend/.env.example`).
Acessando de outro host (não localhost), ajuste também o `allow_origin_regex` em `backend/api.py`.

> **"O backend responde 200 mas o painel mostra 'Erro ao carregar os dados'":** geralmente é CORS
> — o navegador bloqueia a leitura da resposta mesmo com a requisição completando (por isso ela
> aparece como 200 na aba Rede). Abra o console do navegador: se a mensagem citar CORS/"Failed to
> fetch", confirme que a origem do frontend bate com o `allow_origin_regex` acima e reinicie
> `python api.py` depois de qualquer mudança nele (o Uvicorn não recarrega sozinho sem `--reload`,
> que por sua vez quebra o agente — ver §backend/README.md).

## 6. Gaps conhecidos (não resolvidos nesta integração)

- O painel React não mostra casos, diagnóstico diferencial nem o histórico do agente — isso só
  existe no chat (`POST /api/chat`) e nas rotas `/api/astronauts/{id}/cases` e `/api/cases/{id}`,
  que hoje não têm nenhuma tela no frontend consumindo.
- `std` de baseline é aproximado (5% da média), não medido.
- Radiação manual tem um arredondamento mínimo (~0,1%) no ciclo incremento→taxa→incremento
  (`radiation.dose_rate_msv_h` arredondado em 4 casas); irrelevante pra qualquer gatilho real.
- `backend/frontend/` (um painel estático simples, mencionado no `README.md` do backend) nunca
  existiu neste repositório — é um gap anterior a esta integração, sem relação com o `frontend/`
  React (que é o painel de verdade, documentado aqui).
