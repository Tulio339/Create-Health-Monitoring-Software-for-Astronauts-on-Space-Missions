# Monitor de Saúde de Astronautas

Protótipo desenvolvido para o **NASA Space Apps Challenge 2026**: um sistema que acompanha a
saúde da tripulação em missões de longa duração, detecta alterações cedo e conduz cada uma delas
como um **caso de acompanhamento**, do primeiro alerta até a resolução.

> Protótipo educacional. **Não é um dispositivo médico.**

## Resumo

Em missões de longa duração, como a ida a Marte, o atraso de comunicação impede consultar a
equipe médica na Terra em tempo real. A tripulação precisa de **autonomia médica**: um sistema
confiável, transparente e que funcione offline.

O projeto segue o ciclo **medir → detectar → investigar → agir → acompanhar → encerrar**:

- **Medir:** sinais vitais, sono, exercício, humor, dose de radiação e autotestes feitos pelo
  próprio astronauta (tempo de reação e grade de Amsler para visão).
- **Detectar:** um motor de regras **determinístico e auditável** avalia 12 diretivas clínicas,
  baseadas nos 5 riscos do [NASA Human Research Program](https://www.nasa.gov/hrp/hazards/), e
  classifica cada alerta como **atenção**, **alerta** ou **crítico**.
- **Investigar:** um agente de IA local (Ollama, via MCP) usa 15 ferramentas para cruzar sintomas,
  consultar protocolos e recomendar as ações da diretiva. O agente **nunca inventa números nem
  decide a gravidade**: isso é papel do motor de regras.
- **Acompanhar:** o caso é reavaliado periodicamente até atingir o critério de saída. Um caso
  crítico só é encerrado com o aval do médico de voo (CMO).

## Os 5 riscos cobertos

| Código | Risco | Exemplos de diretivas |
|---|---|---|
| `RAD` | Radiação espacial | dose acumulada, evento de partículas solares |
| `ISO` | Isolamento e confinamento | sono/ritmo circadiano, saúde comportamental |
| `DIST` | Distância da Terra | autonomia médica |
| `GRAV` | Gravidade alterada | SANS (visão), perda óssea, descondicionamento cardiovascular, atrofia muscular |
| `ENV` | Ambiente hostil/fechado | CO₂, estresse térmico |

Além disso, há uma diretiva cardíaca (`DIR-CARD-001`, arritmia). Todas as diretivas ficam em
[knowledge-base/directives/](knowledge-base/directives/).

## Arquitetura

```
knowledge-base/            backend/ (Python)                 frontend/ (React)
───────────────            ─────────────────                 ─────────────────
diretivas (YAML)    ──►    motor.py  (motor de regras)       painel do astronauta
riscos, sintomas,          api.py    (FastAPI)       ◄─HTTP─ medições e autotestes
protocolos, schemas        agente.py (LangChain + Ollama)    alertas, mapa corporal
prompt do agente    ──►    servidor_mcp.py (15 ferramentas)  detalhes dos indicadores
cenários de exemplo ──►    simulador_kb.py / sensores_kb.py
```

| Pasta | O que tem |
|---|---|
| [knowledge-base/](knowledge-base/) | Modelo clínico: diretivas, documentação dos riscos, índice de sintomas, níveis de alerta, schemas JSON, prompt e ferramentas do agente, motor de regras de referência e cenários de teste. |
| [backend/](backend/) | API FastAPI e banco SQLite. Avalia a telemetria com o motor de regras, abre e atualiza casos e expõe o agente de IA. |
| [frontend/](frontend/) | Painel web (React + Vite + Tailwind) com indicadores em verde, amarelo e vermelho, tarefas do dia, registro manual de medições e autotestes. Continua funcionando mesmo se o agente estiver fora do ar. |

O caminho completo de uma leitura, da telemetria até a tela, está em [FLUXO.md](FLUXO.md).

## Como rodar

**Pré-requisitos:** Python 3.10+, Node.js 20+ e, opcionalmente, [Ollama](https://ollama.com) para
o chat com o agente.

```bash
# Terminal 1: backend
cd backend
pip install -r requirements.txt
python simulador_kb.py      # executar uma vez: popula o banco com 10 astronautas e os cenários
python api.py               # http://127.0.0.1:8000

# Terminal 2: frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Para ver um cenário "ao vivo", com a telemetria chegando aos poucos e o motor abrindo e escalando
o caso sozinho:

```bash
cd backend
python sensores_kb.py --cenario cardiaca --intervalo 1
```

Cenários disponíveis: `original`, `cardiaca`, `ossea`, `descondicionamento`, `atrofia`,
`comportamental`, `termico`, `distancia`, `radiacao` e `saudavel` (controle, sem alertas).

Para o agente de investigação:

```bash
ollama pull qwen2.5:7b
```

Sem o Ollama, todo o resto funciona; só o chat avisa que está indisponível.

> **Windows:** use `python api.py`, e não `uvicorn api:app --reload`. O modo `--reload` impede o
> agente de abrir o servidor MCP como subprocesso.

Se o backend não estiver em `127.0.0.1:8000`, copie `frontend/.env.example` para
`frontend/.env.local` e ajuste `VITE_API_BASE_URL`.

## Testes

```bash
cd frontend
npm test
```

## Principais rotas da API

| Rota | Descrição |
|---|---|
| `GET /api/astronauts` | Lista da tripulação |
| `GET/POST /api/measurements` | Lê medições ou registra uma nova (a gravação passa pelo motor de regras e pode abrir um caso) |
| `GET /api/baselines` | Valores de referência pré-voo de cada astronauta |
| `GET /api/astronauts/{id}/cases` | Casos de acompanhamento de um astronauta |
| `GET /api/cases/{id}` | Detalhes e linha do tempo de um caso |
| `GET /api/directives` | Diretivas clínicas |
| `POST /api/chat` | Conversa com o agente de investigação |

## Limitações conhecidas

- O painel React ainda não mostra os casos nem o histórico do agente; essas informações estão
  disponíveis pelo chat e pelas rotas `/api/.../cases`.
- O desvio-padrão do baseline é aproximado (5% da média), porque o modelo guarda só a média do
  pré-voo.
- Glicose e grade de Amsler são armazenadas, mas ainda não alimentam nenhuma diretiva.

Mais detalhes em [FLUXO.md](FLUXO.md) (seção 6).
