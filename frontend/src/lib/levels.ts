// Nível de cada indicador no painel. A fonte de verdade é o motor de regras do backend;
// classify.ts só entra como reserva quando a API está fora do ar.
import type { BackendLevel, IndicatorLevels, Level, Status } from '../types'
import type { Panel, PanelId } from './dashboard'
import { panelIndicators } from './dashboard'

export const LEVEL_META: Record<Level, { label: string; shape: string; color: string }> = {
  normal: { label: 'Normal', shape: '●', color: 'var(--color-level-normal)' },
  atencao: { label: 'Atenção', shape: '▲', color: 'var(--color-level-atencao)' },
  alerta: { label: 'Alerta', shape: '◆', color: 'var(--color-level-alerta)' },
  critico: { label: 'Crítico', shape: '■', color: 'var(--color-level-critico)' },
  'sem-dado': { label: 'Sem dado', shape: '○', color: 'var(--color-level-sem-dado)' },
}

const RANK: Record<Level, number> = { 'sem-dado': -1, normal: 0, atencao: 1, alerta: 2, critico: 3 }

const BACKEND_LEVELS: readonly string[] = ['atencao', 'alerta', 'critico']

/** Converte o `level` cru do backend; ausência de caso/alerta (ou "verde") é normal. */
export function levelFromBackend(level: string | null | undefined): Level {
  return level && BACKEND_LEVELS.includes(level) ? (level as BackendLevel) : 'normal'
}

export function worstLevel(levels: Level[]): Level {
  return levels.reduce<Level>((worst, l) => (RANK[l] > RANK[worst] ? l : worst), 'normal')
}

export const isActionLevel = (level: Level): level is BackendLevel => RANK[level] >= 1

export const compareLevels = (a: Level, b: Level): number => RANK[b] - RANK[a]

// Reserva offline: verde/amarelo/vermelho do classify.ts. Vermelho = "médico de voo", que é o alerta.
const FROM_STATUS: Record<Status, Level> = { green: 'normal', yellow: 'atencao', red: 'alerta' }
export const levelFromLocalStatus = (status: Status): Level => FROM_STATUS[status]

/** Pior nível do backend entre os indicadores que compõem o painel (ex.: sistólica + diastólica). */
export function panelBackendLevel(panelId: PanelId, levels: IndicatorLevels): { level: Level; reason?: string } {
  let best: { level: Level; reason?: string } = { level: 'normal' }
  for (const id of panelIndicators(panelId)) {
    const entry = levels[id]
    if (entry && RANK[entry.level] > RANK[best.level]) best = { level: entry.level, reason: entry.reason }
  }
  return best
}

// --- Dado atrasado -----------------------------------------------------------------------------

const HOUR_MS = 3_600_000

/** Prazo esperado entre leituras: contínuos 2 h, diários 36 h, semanais 8 dias. */
export const CADENCE: Record<PanelId, 'continuous' | 'daily' | 'weekly'> = {
  heart_rate: 'continuous',
  spo2: 'continuous',
  temperature: 'continuous',
  radiation: 'continuous',
  blood_pressure: 'daily',
  glucose: 'daily',
  sleep: 'daily',
  mood: 'daily',
  exercise: 'daily',
  reaction_time: 'daily',
  amsler: 'weekly',
}

/** Autorrelatos e testes vão em pontos nos gráficos; o resto em linha. */
export const DOT_PANELS: readonly PanelId[] = ['mood', 'glucose', 'reaction_time', 'amsler']

export const MAX_AGE_MS = { continuous: 2 * HOUR_MS, daily: 36 * HOUR_MS, weekly: 8 * 24 * HOUR_MS } as const

export function isStale(panelId: PanelId, lastTimestamp: string | undefined, nowMs: number): boolean {
  if (!lastTimestamp) return true
  return nowMs - Date.parse(lastTimestamp) > MAX_AGE_MS[CADENCE[panelId]]
}

/** "agora", "há 12 min", "há 3 h", "há 2 d". */
export function formatAgo(timestamp: string, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - Date.parse(timestamp)) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} d`
}

/** Nível final da célula: atrasado vira sem-dado; senão vale o do backend (ou a reserva local). */
export function resolveLevel(stale: boolean, level: Level): Level {
  return stale ? 'sem-dado' : level
}

/** Nível da célula: backend (ou classify.ts se `levels` não veio, modo offline), atrasado vira sem-dado. */
export function panelLevel(panel: Panel, levels: IndicatorLevels | undefined, nowMs: number): { level: Level; reason?: string } {
  const base = levels ? panelBackendLevel(panel.id, levels) : { level: levelFromLocalStatus(panel.classification.status), reason: panel.classification.reason }
  const stale = isStale(panel.id, panel.history.at(-1)?.timestamp, nowMs)
  return { level: resolveLevel(stale, base.level), reason: stale ? undefined : base.reason }
}
