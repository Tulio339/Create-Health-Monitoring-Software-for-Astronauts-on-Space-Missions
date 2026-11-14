// Gera os dados simulados em public/mock (determinístico: mesma semente, mesmos dados).
// Uso: npm run mock
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock')

const PREFLIGHT_DAYS = 14
const MISSION_DAYS = 30
const MISSION_START = '2026-10-15' // dia de missão 1; pré-voo = 14 dias anteriores

const ASTRONAUTS = [
  { id: 'ast-01', name: 'Ana Ribeiro', role: 'Comandante' },
  { id: 'ast-02', name: 'Kenji Morita', role: 'Engenheiro de voo' },
  { id: 'ast-03', name: 'Lúcia Farah', role: 'Especialista de missão' },
]

// mean: média pessoal de cada astronauta (ordem de ASTRONAUTS); sd: variação do dia a dia
const INDICATORS = {
  bp_systolic:   { unit: 'mmHg',  source: 'device',         decimals: 0, mean: [118, 112, 121],    sd: 3.5 },
  bp_diastolic:  { unit: 'mmHg',  source: 'device',         decimals: 0, mean: [76, 72, 79],       sd: 2.5 },
  heart_rate:    { unit: 'bpm',   source: 'wearable',       decimals: 0, mean: [62, 58, 68],       sd: 3 },
  temperature:   { unit: '°C',    source: 'wearable',       decimals: 1, mean: [36.6, 36.5, 36.7], sd: 0.15 },
  glucose:       { unit: 'mg/dL', source: 'device',         decimals: 0, mean: [88, 92, 85],       sd: 5 },
  spo2:          { unit: '%',     source: 'wearable',       decimals: 0, mean: [98, 97.5, 98],     sd: 0.6, max: 100 },
  sleep:         { unit: 'h',     source: 'wearable',       decimals: 1, mean: [7.4, 7.0, 7.6],    sd: 0.35 },
  mood:          { unit: '1-5',   source: 'self_report',    decimals: 0, mean: [4.1, 3.9, 4.2],    sd: 0.5, min: 1, max: 5 },
  exercise:      { unit: 'min',   source: 'wearable',       decimals: 0, mean: [60, 75, 50],       sd: 10, min: 0 },
  radiation:     { unit: 'mSv',   source: 'device',         decimals: 3, mean: [0.008, 0.008, 0.008], sd: 0.001, min: 0 },
  reaction_time: { unit: 'ms',    source: 'cognitive_test', decimals: 0, mean: [265, 250, 280],    sd: 9 },
}

// Efeitos que valem para toda a tripulação durante a missão
function missionShift(indicator) {
  if (indicator === 'exercise') return 50 // protocolo de exercício em órbita
  if (indicator === 'radiation') return 0.55 // dose diária em órbita baixa
  return 0
}
const MISSION_NOISE = { radiation: 0.07 }

// Anomalias plantadas. md = dia de missão (1..30); devolve o desvio a somar.
function anomaly(astronautId, indicator, md) {
  // ast-01: pressão arterial subindo aos poucos a partir do dia 8
  if (astronautId === 'ast-01' && md >= 8) {
    if (indicator === 'bp_systolic') return 0.9 * (md - 7)
    if (indicator === 'bp_diastolic') return 0.5 * (md - 7)
  }
  // ast-02: febre por 4 dias (dias 12 a 15), com sinais associados
  if (astronautId === 'ast-02' && md >= 12 && md <= 15) {
    const i = md - 12
    if (indicator === 'temperature') return [1.5, 2.0, 1.8, 1.3][i]
    if (indicator === 'heart_rate') return [12, 18, 15, 9][i]
    if (indicator === 'spo2') return [-1, -2.5, -2, -0.5][i]
    if (indicator === 'sleep') return -1
    if (indicator === 'mood') return -1
    if (indicator === 'exercise') return -80
  }
  // ast-03: sono caindo a partir do dia 5; humor e tempo de reação pioram depois
  if (astronautId === 'ast-03') {
    if (indicator === 'sleep' && md >= 5) return -Math.min(3.2, 0.13 * (md - 4))
    if (indicator === 'reaction_time' && md >= 12) return 2.2 * (md - 11)
    if (indicator === 'mood' && md >= 12) return -0.06 * (md - 11)
  }
  return 0
}

// PRNG com semente (mulberry32) + ruído gaussiano (Box-Muller)
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261015)
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

const round = (v, d) => Number(v.toFixed(d))
const clamp = (v, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v))

const start = new Date(`${MISSION_START}T07:00:00Z`)
const measurements = []
const baselines = []

ASTRONAUTS.forEach((astronaut, a) => {
  for (const [indicator, cfg] of Object.entries(INDICATORS)) {
    const preflight = []
    for (let day = -PREFLIGHT_DAYS; day < MISSION_DAYS; day++) {
      const md = day + 1 // dia de missão; <= 0 significa pré-voo
      const inMission = md >= 1
      const sd = inMission && MISSION_NOISE[indicator] ? MISSION_NOISE[indicator] : cfg.sd
      let value = cfg.mean[a] + gauss() * sd
      if (inMission) value += missionShift(indicator) + anomaly(astronaut.id, indicator, md)
      value = round(clamp(value, cfg.min, cfg.max), cfg.decimals)
      if (!inMission) preflight.push(value)

      const timestamp = new Date(start.getTime() + day * 86_400_000).toISOString()
      measurements.push({
        astronaut_id: astronaut.id,
        indicator,
        value,
        unit: cfg.unit,
        timestamp,
        source: cfg.source,
      })
    }
    // Linha de base pessoal = média e desvio padrão amostral do pré-voo
    const mean = preflight.reduce((s, v) => s + v, 0) / preflight.length
    const variance = preflight.reduce((s, v) => s + (v - mean) ** 2, 0) / (preflight.length - 1)
    baselines.push({
      astronaut_id: astronaut.id,
      indicator,
      mean: round(mean, 3),
      std: round(Math.sqrt(variance), 3),
    })
  }
})

// Grade de Amsler: teste de visão feito de tempos em tempos, sem ruído e sem linha de base.
// No mock ninguém tem alteração: 0 áreas marcadas em todos os testes.
const AMSLER_DAYS = [-14, -1, 6, 13, 20, 27] // dias de missão 7, 14, 21 e 28, mais dois no pré-voo
for (const astronaut of ASTRONAUTS) {
  for (const day of AMSLER_DAYS) {
    const timestamp = new Date(start.getTime() + day * 86_400_000).toISOString()
    for (const indicator of ['amsler_marks', 'amsler_central']) {
      measurements.push({ astronaut_id: astronaut.id, indicator, value: 0, unit: 'áreas', timestamp, source: 'vision_test' })
    }
  }
}

const astronauts = ASTRONAUTS.map((a) => ({ ...a, mission_start: MISSION_START }))
const lines = (rows) => `[\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n]\n`

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'astronauts.json'), lines(astronauts))
writeFileSync(join(OUT, 'measurements.json'), lines(measurements))
writeFileSync(join(OUT, 'baselines.json'), lines(baselines))
console.log(`mock gerado em ${OUT}: ${astronauts.length} astronautas, ${measurements.length} medições, ${baselines.length} linhas de base`)
