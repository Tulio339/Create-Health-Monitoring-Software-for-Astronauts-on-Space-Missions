# Base de Conhecimento — Monitoramento de Saúde de Astronautas

Base de conhecimento que alimenta o **motor de regras** (alertas determinísticos) e o
**agente de IA** (investigação e acompanhamento de cada alteração detectada).

Organizada a partir dos **5 riscos do NASA Human Research Program (RIDGE)**:
https://www.nasa.gov/hrp/hazards/

| Código | Risco | Arquivo |
|---|---|---|
| `RAD` | **R**adiação espacial | [hazards/radiation.md](hazards/radiation.md) |
| `ISO` | **I**solamento e confinamento | [hazards/isolation-confinement.md](hazards/isolation-confinement.md) |
| `DIST` | **D**istância da Terra | [hazards/distance-from-earth.md](hazards/distance-from-earth.md) |
| `GRAV` | Campos de **G**ravidade alterados | [hazards/gravity.md](hazards/gravity.md) |
| `ENV` | Ambientes hostis/fechados (**E**nvironment) | [hazards/hostile-environment.md](hazards/hostile-environment.md) |

---

## Como as peças se conectam

```
 Sensores / formulários           Base de conhecimento               Aplicação
 ────────────────────            ─────────────────────              ─────────
 wearables (FC, VFC, SpO2)  ┐    directives/*.yaml   ──┐
 dosímetro, GOES            │    (gatilhos + ações)    │
 ambiente (CO2, T, ruído)   ├──► engine/ ──────────────┼──► ALERTA (astronauta + solo)
 testes (PVT, OCT, humor)   │    avalia regras         │          │
 relatos de sintomas        ┘    vs. baseline          │          ▼
                                                       │    AGENTE DE IA abre um "caso"
                                 hazards/*.md  ────────┤    - busca contexto (RAG)
                                 symptoms/index.yaml ──┤    - cruza sintomas x riscos
                                 protocols/*.md  ──────┘    - pergunta ao astronauta
                                                            - recomenda ações da diretiva
                                                            - agenda acompanhamento
                                                            - fecha pelo critério de saída
```

1. **Telemetria** chega no formato de [schema/telemetry.schema.json](schema/telemetry.schema.json).
2. O **motor** ([engine/rules_engine.py](engine/rules_engine.py)) avalia cada diretiva contra a
   janela de dados e o **baseline pré-voo** do astronauta. Regras são determinísticas e
   auditáveis: a IA **não** decide se um alerta dispara, só investiga depois.
3. Cada disparo gera um **alerta** ([schema/alert.schema.json](schema/alert.schema.json)) com
   nível `atencao` / `alerta` / `critico` (ver [protocols/alert-levels.md](protocols/alert-levels.md)).
4. Alertas de nível `alerta` ou acima (ou padrões recorrentes de `atencao`) abrem um **caso** para o
   agente ([agent/](agent/)), que segue o fluxo de [agent/investigation-workflow.md](agent/investigation-workflow.md).
5. O agente acompanha o caso até o **critério de saída** da diretiva ser atingido.

## Estrutura

```
knowledge-base/
├── README.md                     ← este arquivo
├── hazards/                      ← documentação narrativa dos 5 riscos (fonte do RAG)
├── directives/                   ← regras executáveis (1 arquivo por condição clínica)
├── symptoms/index.yaml           ← sintoma → diretivas/riscos possíveis (diagnóstico diferencial)
├── protocols/                    ← níveis de alerta, escalonamento, comunicação
├── schema/                       ← contratos JSON (telemetria, diretiva, alerta, caso)
├── agent/                        ← prompt de sistema, ferramentas e fluxo do agente
├── engine/                       ← motor de regras de referência (Python)
└── examples/                     ← perfil + telemetria de exemplo para testar
```

## Diretivas iniciais

| ID | Condição | Risco(s) |
|---|---|---|
| [DIR-RAD-001](directives/DIR-RAD-001-dose-acumulada.yaml) | Dose acumulada / limite de carreira | RAD |
| [DIR-RAD-002](directives/DIR-RAD-002-evento-particulas-solares.yaml) | Evento de partículas solares (SPE) | RAD, DIST |
| [DIR-GRAV-001](directives/DIR-GRAV-001-sans.yaml) | Síndrome neuro-ocular (SANS) | GRAV, ENV |
| [DIR-GRAV-002](directives/DIR-GRAV-002-perda-ossea.yaml) | Perda óssea e risco de cálculo renal | GRAV |
| [DIR-GRAV-003](directives/DIR-GRAV-003-descondicionamento-cardiovascular.yaml) | Descondicionamento cardiovascular | GRAV |
| [DIR-GRAV-004](directives/DIR-GRAV-004-atrofia-muscular.yaml) | Atrofia muscular / adesão ao exercício | GRAV |
| [DIR-CARD-001](directives/DIR-CARD-001-arritmia.yaml) | Arritmia cardíaca | GRAV, RAD, ISO |
| [DIR-ISO-001](directives/DIR-ISO-001-sono-circadiano.yaml) | Déficit de sono / ritmo circadiano | ISO, ENV |
| [DIR-ISO-002](directives/DIR-ISO-002-saude-comportamental.yaml) | Saúde comportamental e cognição | ISO, DIST |
| [DIR-ENV-001](directives/DIR-ENV-001-co2.yaml) | CO₂ elevado na cabine | ENV |
| [DIR-ENV-002](directives/DIR-ENV-002-estresse-termico.yaml) | Estresse térmico / febre | ENV |
| [DIR-DIST-001](directives/DIR-DIST-001-autonomia-medica.yaml) | Autonomia médica sob latência de comunicação | DIST |

## Como adicionar uma diretiva

1. Copie [directives/_TEMPLATE.yaml](directives/_TEMPLATE.yaml).
2. Use métricas existentes no schema de telemetria (ou adicione-as lá antes).
3. Defina gatilhos para cada nível, sintomas a verificar, investigação, ações e **critério de saída**.
4. Mapeie os sintomas novos em [symptoms/index.yaml](symptoms/index.yaml).
5. Rode `python engine/rules_engine.py` para validar contra o exemplo.

> ⚠️ **Aviso:** valores de limiar são **referências para protótipo**, baseados em literatura
> pública da NASA (NASA-STD-3001, HRP Evidence Reports). Não são orientação médica operacional.
