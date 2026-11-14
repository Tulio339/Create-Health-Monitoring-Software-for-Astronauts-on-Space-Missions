// Dose de carreira (radiation.cumulative_career_msv, já acumulada pelo backend) contra o limite
// de 600 mSv, com as marcas da diretiva DIR-RAD-001. Nada aqui soma incrementos.
import type { BackendLevel, Level, TelemetryPoint } from '../types'

export const CAREER_LIMIT_MSV = 600

export const RADIATION_MARKS: { msv: number; level: BackendLevel; label: string }[] = [
  { msv: 450, level: 'atencao', label: '75%' },
  { msv: 540, level: 'alerta', label: '90%' },
  { msv: 600, level: 'critico', label: '100%' },
]

/** Porcentagem do limite de carreira (pode passar de 100). */
export const pctOfLimit = (careerMsv: number): number => (careerMsv / CAREER_LIMIT_MSV) * 100

/** Largura da barra, presa entre 0 e 100%. */
export const barPct = (careerMsv: number): number => Math.min(100, Math.max(0, pctOfLimit(careerMsv)))

/** Taxa média (mSv/h) nas últimas `hours` horas da série de taxa de dose. */
export function meanRate(rates: TelemetryPoint[], hours = 24): number | undefined {
  const last = rates.at(-1)
  if (!last) return undefined
  const from = Date.parse(last.timestamp) - hours * 3_600_000
  const window = rates.filter((p) => Date.parse(p.timestamp) > from)
  return window.reduce((sum, p) => sum + p.valor, 0) / window.length
}

/** Dias até o limite de carreira no ritmo atual; undefined se a taxa for nula ou o limite já passou. */
export function daysToLimit(careerMsv: number, rateMsvH: number | undefined): number | undefined {
  if (!rateMsvH || rateMsvH <= 0 || careerMsv >= CAREER_LIMIT_MSV) return undefined
  return (CAREER_LIMIT_MSV - careerMsv) / rateMsvH / 24
}

/** Reserva offline: mesmas marcas da DIR-RAD-001 aplicadas no navegador. */
export function localRadiationLevel(careerMsv: number): Level {
  return [...RADIATION_MARKS].reverse().find((m) => careerMsv >= m.msv)?.level ?? 'normal'
}
