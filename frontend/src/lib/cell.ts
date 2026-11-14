// Números de cada célula da grade: valor com casas fixas, janela de 7 dias, tendência e faixa normal.
import { FIXED_RANGES } from './classify'
import type { Panel, PanelId } from './dashboard'

const DAY_MS = 86_400_000

/** Casas decimais fixas por indicador (o valor não muda de formato entre leituras). */
export const DECIMALS: Record<PanelId, number> = {
  heart_rate: 0,
  blood_pressure: 0,
  temperature: 1,
  glucose: 0,
  spo2: 0,
  sleep: 1,
  mood: 1,
  exercise: 0,
  reaction_time: 0,
  amsler: 0,
  radiation: 1,
}

export const fmt = (value: number, decimals: number): string =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** Valor atual formatado; pressão arterial mostra sistólica/diastólica. */
export function cellValue(panel: Panel): string {
  const d = DECIMALS[panel.id]
  if (panel.id === 'blood_pressure') {
    const sys = panel.charts[0]?.series.at(-1)?.value
    const dia = panel.charts[1]?.series.at(-1)?.value
    if (sys !== undefined && dia !== undefined) return `${fmt(sys, 0)}/${fmt(dia, 0)}`
  }
  const last = panel.history.at(-1)
  return last ? fmt(last.value, d) : '—'
}

export interface Point {
  t: number
  v: number
}

/** Pontos dos últimos `days` dias, contados a partir da leitura mais recente. */
export function lastDaysPoints(panel: Panel, days: number): Point[] {
  const last = panel.history.at(-1)
  if (!last) return []
  const from = Date.parse(last.timestamp) - days * DAY_MS
  return panel.history.filter((r) => Date.parse(r.timestamp) > from).map((r) => ({ t: Date.parse(r.timestamp), v: r.value }))
}

export type Trend = 'up' | 'down' | 'flat'

export const TREND_META: Record<Trend, { arrow: string; label: string }> = {
  up: { arrow: '↑', label: 'subindo' },
  down: { arrow: '↓', label: 'caindo' },
  flat: { arrow: '→', label: 'estável' },
}

/** Compara a média da metade recente com a da metade antiga; menos de 3% é estável. */
export function trendOf(points: Point[]): Trend {
  if (points.length < 4) return 'flat'
  const half = Math.floor(points.length / 2)
  const mean = (ps: Point[]) => ps.reduce((s, p) => s + p.v, 0) / ps.length
  const older = mean(points.slice(0, half))
  const recent = mean(points.slice(half))
  if (Math.abs(recent - older) <= Math.abs(older) * 0.03) return 'flat'
  return recent > older ? 'up' : 'down'
}

/** Faixa esperada do indicador (classify.ts), usada só como fundo suave do sparkline. */
export function normalBand(panelId: PanelId): [number, number] | undefined {
  const key = panelId === 'blood_pressure' ? 'bp_systolic' : panelId
  if (key === 'radiation' || key === 'amsler') return undefined
  return FIXED_RANGES[key].green
}
