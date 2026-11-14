// Classificação verde / amarelo / vermelho de uma medição.
//
// Regra geral: o pior status entre
//   1. a faixa fixa do indicador (pode dar amarelo ou vermelho);
//   2. a linha de base pessoal: fora de média ± 2 desvios dá amarelo.
// A linha de base sozinha nunca dá vermelho: um valor dentro da faixa segura,
// mas fora do padrão da pessoa, pede ação do astronauta, não o médico de voo.
//
// Exceções:
//   - radiação: ignora a linha de base; usa a dose acumulada em % do limite de carreira;
//   - pressão arterial: sistólica e diastólica juntas, vale o pior status
//     (ver classifyBloodPressure);
//   - grade de Amsler: sem faixa nem linha de base; qualquer área marcada é amarelo,
//     muitas áreas ou marcação no centro é vermelho (ver classifyAmsler).
//
// Faixas de protótipo educacional — não são critério clínico.
import type { Baseline, IndicatorId, Status } from '../types'

export interface Classification {
  status: Status
  /** Razão em texto, pronta para mostrar na tela. */
  reason: string
}

type RangedIndicator = Exclude<IndicatorId, 'radiation' | 'amsler_marks' | 'amsler_central'>

export interface FixedRange {
  /** Dentro de [min, max] = verde. */
  green: [number, number]
  /** Fora do verde mas dentro de [min, max] = amarelo; fora disso = vermelho. */
  yellow: [number, number]
  unit: string
  /** Lado em que um desvio da linha de base preocupa. */
  baselineSide: 'both' | 'low' | 'high'
}

export const FIXED_RANGES: Record<RangedIndicator, FixedRange> = {
  bp_systolic:   { green: [90, 129],        yellow: [80, 139],        unit: 'mmHg',  baselineSide: 'both' },
  bp_diastolic:  { green: [60, 84],         yellow: [50, 89],         unit: 'mmHg',  baselineSide: 'both' },
  heart_rate:    { green: [45, 100],        yellow: [40, 120],        unit: 'bpm',   baselineSide: 'both' },
  temperature:   { green: [36.0, 37.5],     yellow: [35.0, 38.0],     unit: '°C',    baselineSide: 'both' },
  glucose:       { green: [70, 140],        yellow: [54, 180],        unit: 'mg/dL', baselineSide: 'both' },
  spo2:          { green: [95, 100],        yellow: [90, 100],        unit: '%',     baselineSide: 'low' },
  sleep:         { green: [6, 10],          yellow: [5, 12],          unit: 'h',     baselineSide: 'low' },
  mood:          { green: [3, 5],           yellow: [2, 5],           unit: '',      baselineSide: 'low' },
  exercise:      { green: [45, Infinity],   yellow: [20, Infinity],   unit: 'min',   baselineSide: 'low' },
  reaction_time: { green: [-Infinity, 350], yellow: [-Infinity, 450], unit: 'ms',    baselineSide: 'high' },
}

/** Limite de dose de radiação na carreira, em mSv. */
export const CAREER_RADIATION_LIMIT_MSV = 600
/** % do limite de carreira a partir da qual o status é amarelo / vermelho. */
export const RADIATION_YELLOW_PCT = 50
export const RADIATION_RED_PCT = 80

/** Desvios da linha de base a partir dos quais o status é amarelo. */
export const BASELINE_SIGMAS = 2

const SEVERITY: Record<Status, number> = { green: 0, yellow: 1, red: 2 }

export function worstStatus(...statuses: Status[]): Status {
  return statuses.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), 'green' as Status)
}

const num = (value: number, decimals = 1) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals })

const withUnit = (value: number, unit: string) => (unit ? `${num(value)} ${unit}` : num(value))

interface Finding {
  status: Status
  reason: string
}

function fixedRangeFinding(value: number, range: FixedRange): Finding | undefined {
  const [greenMin, greenMax] = range.green
  const [yellowMin, yellowMax] = range.yellow
  if (value >= greenMin && value <= greenMax) return undefined
  const above = value > greenMax
  if (value >= yellowMin && value <= yellowMax) {
    return {
      status: 'yellow',
      reason: above
        ? `acima da faixa esperada (até ${withUnit(greenMax, range.unit)})`
        : `abaixo da faixa esperada (a partir de ${withUnit(greenMin, range.unit)})`,
    }
  }
  return {
    status: 'red',
    reason: above
      ? `acima do limite seguro (${withUnit(yellowMax, range.unit)})`
      : `abaixo do limite seguro (${withUnit(yellowMin, range.unit)})`,
  }
}

function baselineFinding(
  value: number,
  baseline: Pick<Baseline, 'mean' | 'std'> | undefined,
  side: FixedRange['baselineSide'],
): Finding | undefined {
  if (!baseline || !(baseline.std > 0)) return undefined
  const sigmas = (value - baseline.mean) / baseline.std
  if (Math.abs(sigmas) <= BASELINE_SIGMAS) return undefined
  const above = sigmas > 0
  if ((above && side === 'low') || (!above && side === 'high')) return undefined
  return {
    status: 'yellow',
    reason: `${above ? 'acima' : 'abaixo'} da sua média em ${num(Math.abs(sigmas))} desvios`,
  }
}

/** Áreas marcadas na grade de Amsler (somando os dois olhos) a partir das quais o status é vermelho. */
export const AMSLER_MANY = 8

/**
 * Grade de Amsler: `marks` = total de áreas marcadas nos dois olhos;
 * `central` = quantas delas ficam no centro da visão.
 */
export function classifyAmsler(marks: number, central: number): Classification {
  const areas = (n: number) => (n === 1 ? '1 área marcada' : `${n} áreas marcadas`)
  if (marks <= 0 && central <= 0) return { status: 'green', reason: 'nenhuma área marcada nos dois olhos' }
  if (central > 0) {
    return { status: 'red', reason: `${areas(Math.max(marks, central))}, ${central} no centro da visão` }
  }
  if (marks >= AMSLER_MANY) {
    return { status: 'red', reason: `${areas(marks)} (a partir de ${AMSLER_MANY} é considerado muito)` }
  }
  return { status: 'yellow', reason: `${areas(marks)}, fora do centro da visão` }
}

function classifyRadiation(cumulativeDose: number): Classification {
  const pct = (cumulativeDose / CAREER_RADIATION_LIMIT_MSV) * 100
  const status: Status = pct >= RADIATION_RED_PCT ? 'red' : pct >= RADIATION_YELLOW_PCT ? 'yellow' : 'green'
  return {
    status,
    reason: `dose acumulada de ${num(cumulativeDose)} mSv, ${num(pct)}% do limite de carreira (${CAREER_RADIATION_LIMIT_MSV} mSv)`,
  }
}

/**
 * Classifica uma medição.
 * Para radiação, `value` é a dose ACUMULADA em mSv (ver cumulativeDose) e a linha de base é ignorada.
 */
export function classify(
  indicator: IndicatorId,
  value: number,
  baseline?: Pick<Baseline, 'mean' | 'std'>,
): Classification {
  if (indicator === 'radiation') return classifyRadiation(value)
  if (indicator === 'amsler_marks') return classifyAmsler(value, 0)
  if (indicator === 'amsler_central') return classifyAmsler(value, value)

  const range = FIXED_RANGES[indicator]
  const fixed = fixedRangeFinding(value, range)
  const personal = baselineFinding(value, baseline, range.baselineSide)
  const findings = [fixed, personal].filter((f): f is Finding => f !== undefined)

  if (findings.length === 0) {
    return {
      status: 'green',
      reason: baseline ? 'dentro da faixa esperada e próximo da sua média' : 'dentro da faixa esperada',
    }
  }
  const status = worstStatus(...findings.map((f) => f.status))
  // A razão cita o que determinou o status (os dois motivos, se empatarem).
  const reason = findings
    .filter((f) => f.status === status)
    .map((f) => f.reason)
    .join(' e ')
  return { status, reason }
}

/** Pressão arterial: classifica sistólica e diastólica e fica com o pior status. */
export function classifyBloodPressure(
  systolic: number,
  diastolic: number,
  baselines: { systolic?: Pick<Baseline, 'mean' | 'std'>; diastolic?: Pick<Baseline, 'mean' | 'std'> } = {},
): Classification {
  const sys = classify('bp_systolic', systolic, baselines.systolic)
  const dia = classify('bp_diastolic', diastolic, baselines.diastolic)
  const status = worstStatus(sys.status, dia.status)
  if (status === 'green') {
    return {
      status,
      reason:
        baselines.systolic && baselines.diastolic
          ? 'sistólica e diastólica dentro da faixa esperada e próximas da sua média'
          : 'sistólica e diastólica dentro da faixa esperada',
    }
  }
  const parts: string[] = []
  if (sys.status === status) parts.push(`sistólica ${sys.reason}`)
  if (dia.status === status) parts.push(`diastólica ${dia.reason}`)
  return { status, reason: parts.join('; ') }
}

/** Dose de radiação acumulada (mSv) a partir das doses diárias. */
export function cumulativeDose(dailyDoses: number[]): number {
  return dailyDoses.reduce((sum, dose) => sum + dose, 0)
}
