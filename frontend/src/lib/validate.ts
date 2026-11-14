// Validação da entrada de uma medição.
//   1. Valores fisiologicamente impossíveis são rejeitados (validateValue).
//   2. Valores possíveis, mas muito fora da linha de base pessoal, pedem
//      confirmação sem bloquear (baselineWarning).
import type { Baseline, IndicatorId } from '../types'
import { FIXED_RANGES } from './classify'
import type { FixedRange } from './classify'

interface Plausible {
  label: string
  unit: string
  min: number
  max: number
  integer?: boolean
}

/** Limites do que é fisicamente possível medir em uma pessoa viva — não são faixas de saúde. */
export const PLAUSIBLE: Record<IndicatorId, Plausible> = {
  bp_systolic:   { label: 'Pressão sistólica',  unit: 'mmHg',  min: 50,  max: 300 },
  bp_diastolic:  { label: 'Pressão diastólica', unit: 'mmHg',  min: 20,  max: 200 },
  heart_rate:    { label: 'Frequência cardíaca', unit: 'bpm',  min: 20,  max: 250 },
  temperature:   { label: 'Temperatura',        unit: '°C',    min: 25,  max: 45 },
  glucose:       { label: 'Glicemia',           unit: 'mg/dL', min: 10,  max: 1000 },
  spo2:          { label: 'SpO2',               unit: '%',     min: 50,  max: 100 },
  sleep:         { label: 'Sono',               unit: 'h',     min: 0,   max: 24 },
  mood:          { label: 'Humor',              unit: '',      min: 1,   max: 5, integer: true },
  exercise:      { label: 'Exercício',          unit: 'min',   min: 0,   max: 1440 },
  radiation:     { label: 'Dose diária de radiação', unit: 'mSv', min: 0, max: 1000 },
  reaction_time: { label: 'Tempo de reação',    unit: 'ms',    min: 100, max: 5000 },
  amsler_marks:   { label: 'Áreas marcadas na grade de Amsler', unit: 'áreas', min: 0, max: 200, integer: true },
  amsler_central: { label: 'Áreas marcadas no centro da grade', unit: 'áreas', min: 0, max: 8,   integer: true },
}

/** Desvios da linha de base a partir dos quais se pede confirmação. */
export const CONFIRM_SIGMAS = 4

const num = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const withUnit = (value: number, unit: string) => (unit ? `${num(value)} ${unit}` : num(value))

/** Converte o texto digitado ("36,6" ou "36.6") em número; NaN se não for um número. */
export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(',', '.')
  return cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned) ? NaN : Number(cleaned)
}

/** Mensagem de erro se o valor for impossível; undefined se for aceitável. */
export function validateValue(indicator: IndicatorId, value: number): string | undefined {
  const p = PLAUSIBLE[indicator]
  if (!Number.isFinite(value)) return `${p.label}: digite um número.`
  if (p.integer && !Number.isInteger(value)) return `${p.label}: escolha um valor inteiro de ${p.min} a ${p.max}.`
  if (value < p.min || value > p.max) {
    return `${p.label} de ${withUnit(value, p.unit)} não é um valor possível. Digite um valor entre ${num(p.min)} e ${withUnit(p.max, p.unit)}.`
  }
  return undefined
}

export function validateBloodPressure(systolic: number, diastolic: number): string | undefined {
  const error = validateValue('bp_systolic', systolic) ?? validateValue('bp_diastolic', diastolic)
  if (error) return error
  if (systolic <= diastolic) {
    return 'A pressão sistólica (número maior) precisa ser maior que a diastólica. Confira se os campos estão trocados.'
  }
  return undefined
}

/**
 * Pergunta de confirmação se o valor estiver muito fora da linha de base pessoal,
 * no lado que preocupa. Radiação não usa linha de base.
 */
export function baselineWarning(
  indicator: IndicatorId,
  value: number,
  baseline?: Pick<Baseline, 'mean' | 'std'>,
): string | undefined {
  // Radiação e grade de Amsler não usam linha de base (não têm faixa em FIXED_RANGES).
  const range = (FIXED_RANGES as Partial<Record<IndicatorId, FixedRange>>)[indicator]
  if (!range || !baseline || !(baseline.std > 0)) return undefined
  const sigmas = (value - baseline.mean) / baseline.std
  if (Math.abs(sigmas) <= CONFIRM_SIGMAS) return undefined
  const side = range.baselineSide
  if ((sigmas > 0 && side === 'low') || (sigmas < 0 && side === 'high')) return undefined
  const p = PLAUSIBLE[indicator]
  const sigmaText = Math.abs(sigmas).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${p.label} de ${withUnit(value, p.unit)} está ${sigmaText} desvios ${sigmas > 0 ? 'acima' : 'abaixo'} da sua média (${withUnit(Number(baseline.mean.toFixed(1)), p.unit)}).`
}
