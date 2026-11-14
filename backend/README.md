# Monitor de Saúde de Astronautas

Protótipo de hackathon (desafio estilo NASA Space Apps): um painel que coleta indicadores de saúde e ajuda o astronauta a **avaliar e agir** sobre o próprio estado de saúde durante missões longas, quando o médico de voo está a minutos de distância.

> Protótipo educacional. Não é um dispositivo médico.

## Como rodar

```bash
pip install -r requirements.txt

python simulador.py      # 1x: cria o banco com 30 dias de histórico e o "normal pré-voo" de cada astronauta
python api.py            # sobe o sistema em http://127.0.0.1:8000
```

Em outro terminal, inicie o frontend Vite a partir da pasta `frontend`:

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite (normalmente **http://localhost:5173**). A API fica disponível em **http://127.0.0.1:8000** e sua documentação em **http://127.0.0.1:8000/docs**. Para servir uma versão compilada pela API, rode `npm run build` na pasta `frontend`.

Para ver os dados chegando ao vivo, abra **outro terminal** e rode:

```bash
python sensores.py       # simula os sensores da nave: 1 dia de missão a cada 2 segundos
```

O assistente de saúde (chat) precisa do Ollama aberto com o modelo baixado:

```bash
ollama pull qwen2.5:7b
```

Sem o Ollama, todo o resto funciona; só o chat avisa que está indisponível.

> **Windows:** rode `python api.py`, e não `uvicorn api:app --reload`. O modo `--reload` impede o chat de abrir o servidor MCP.

## O ciclo que o sistema resolve

**medir → classificar → explicar → agir → acompanhar**

1. **Medir:** os dados chegam dos sensores (automático) ou do astronauta (formulário e teste de reação).
2. **Classificar:** o motor de regras dá verde, amarelo ou vermelho a cada indicador.
3. **Explicar:** a base de conhecimento diz por que o espaço afeta aquele indicador.
4. **Agir:** cada alerta vem com ações; no vermelho, um relatório vai para a Terra.
5. **Acompanhar:** gráficos mostram a evolução e a tendência.

## Estrutura

```
agents/
├── api.py                  API FastAPI: liga tudo e serve o painel
├── frontend/               painel (HTML + JS + CSS, sem build)
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── vendor/chart.umd.min.js   gráficos, incluído para funcionar offline
├── regras.py               motor de regras: decide as cores
├── conhecimento/
│   └── indicadores.json    faixas, explicações, como medir e ações de cada indicador
├── assistente.py           funções de consulta, avaliação, registro e relatório
├── simulador.py            gera o histórico de 30 dias com anomalias plantadas
├── sensores.py             simula os sensores enviando dados ao vivo
├── servidor_mcp.py         expõe as funções como ferramentas para o agente (MCP)
├── agente.py               agente com LLM (assistente ou gerador de dados)
├── ferramentas.py          ferramentas do agente gerador de dados
├── diretivas/              instruções (system prompts) de cada agente
└── dados_simulados/
    └── health.db           banco SQLite (criado pelo simulador)
```

## Como os dados passam

**Uma medição:** sensor ou formulário → `POST /api/measurements` → validação (valor impossível é rejeitado) → grava em `measurement` → motor de regras → status → painel atualiza (a cada 3 s).

**Uma pergunta no chat:** painel → `POST /api/chat` → agente (LLM + diretiva) → escolhe ferramenta → servidor MCP → `assistente.py` / `regras.py` → resultado volta ao LLM → resposta explicada.

O LLM **nunca** inventa números nem decide cores: isso sempre vem do código. Ele só escolhe qual ferramenta chamar e explica o resultado.

## Motor de regras (`regras.py`)

Cada indicador passa por três checagens; vale a pior cor:

1. **Faixa absoluta:** ex.: temperatura ≥ 38 °C é vermelho.
2. **Comparação com o normal pré-voo do próprio astronauta:** só na direção perigosa (pressão acima do normal alerta; abaixo, que é adaptação ao voo, não).
3. **Tendência dos últimos 7 dias:** pega uma subida antes de ela estourar a faixa.

Testado contra o gabarito do simulador: **13 de 13 anomalias detectadas, 0,7% de alarmes falsos.**

## Rotas da API

| Rota | O que faz |
|---|---|
| `GET /api/astronauts` | lista os astronautas com o status geral |
| `GET /api/astronauts/{id}/status` | cor, motivos, tendência e ações de cada indicador |
| `GET /api/astronauts/{id}/measurements` | histórico (para os gráficos) |
| `GET /api/indicators` e `/api/indicators/{nome}` | explicações e como medir |
| `POST /api/measurements` | registra uma medição manual ou de teste |
| `POST /api/reports` e `GET /api/reports` | relatórios para o médico de voo, com atraso de comunicação |
| `POST /api/chat` | pergunta ao assistente de saúde |

Documentação interativa automática: **http://127.0.0.1:8000/docs**

## Roteiro sugerido para a demo

1. Abra o painel com o `sensores.py` rodando: os dias avançam e as cores mudam sozinhas.
2. Mostre o corpo: clique numa região vermelha e explique o indicador.
3. Clique num card vermelho: gráfico, "por que o espaço afeta isso" e "o que fazer agora".
4. Peça a um jurado para digitar uma temperatura de 38,5 °C: o painel fica vermelho na hora.
5. Faça o teste de reação.
6. Pergunte no chat: "por que minha pressão está alta?".
7. Envie um relatório à Terra e mostre o atraso de comunicação (até ~24 min em Marte).

## O que ficou de fora (de propósito)

Gamificação, agendador de lembretes, grade de Amsler e tela do médico de voo. Ficaram fora para priorizar um ciclo completo que funciona.

## Antes de apresentar

Revisem `conhecimento/indicadores.json` contra as fontes da NASA (Human Research Program). As faixas e textos são ilustrativos e podem ser ajustados sem mexer no código.
