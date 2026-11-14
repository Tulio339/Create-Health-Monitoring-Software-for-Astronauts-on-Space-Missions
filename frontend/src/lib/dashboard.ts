// Monta os painéis do dashboard (um por indicador) a partir dos dados de um astronauta.
// Pressão arterial junta sistólica e diastólica; radiação mostra a dose acumulada.
import type { Baseline, IndicatorId, IndicatorInfo, Measurement, MeasurementSource } from '../types'
import { INDICATORS } from '../types'
import { classify, classifyAmsler, classifyBloodPressure } from './classify'
import type { Classification } from './classify'
import { formatValue, unitLabel } from './format'

export type PanelId =
  | 'blood_pressure'
  | 'amsler'
  | Exclude<IndicatorId, 'bp_systolic' | 'bp_diastolic' | 'amsler_marks' | 'amsler_central'>

export interface PanelChart {
  heading?: string
  info: IndicatorInfo
  series: Measurement[]
  baseline?: Baseline
}

/** Uma leitura do painel em um instante, já classificada. */
export interface Reading {
  timestamp: string
  /** Valor formatado como aparece na tela (ex.: "137/84", "7,3"). */
  display: string
  /** Valor principal em número (sistólica na pressão; dose acumulada na radiação). */
  value: number
  classification: Classification
  source: MeasurementSource
}

export interface Panel {
  id: PanelId
  title: string
  shortTitle: string
  /** Valor atual, já formatado. */
  value: string
  unit: string
  /** Classificação da leitura mais recente. */
  classification: Classification
  /** Todas as leituras, em ordem cronológica. */
  history: Reading[]
  /** Série da miniatura do card. */
  spark: number[]
  charts: PanelChart[]
  /** Textos explicativos (knowledge/) dos indicadores do painel. */
  infos: IndicatorInfo[]
}

/** Indicadores (do contrato de dados) que compõem cada painel. */
export function panelIndicators(id: PanelId): IndicatorId[] {
  if (id === 'blood_pressure') return ['bp_systolic', 'bp_diastolic']
  if (id === 'amsler') return ['amsler_marks', 'amsler_central']
  return [id]
}

export function buildPanels(
  seriesByIndicator: Map<IndicatorId, Measurement[]>,
  baselines: Baseline[],
  infos: IndicatorInfo[],
): Panel[] {
  const seriesOf = (id: IndicatorId) => seriesByIndicator.get(id) ?? []
  const baselineOf = (id: IndicatorId) => baselines.find((b) => b.indicator === id)
  const infoOf = (id: IndicatorId) => infos.find((i) => i.indicator === id)
  const panels: Panel[] = []

  const finish = (panel: Omit<Panel, 'value' | 'classification' | 'spark'>): void => {
    const last = panel.history.at(-1)
    if (!last) return
    panels.push({
      ...panel,
      value: last.display,
      classification: last.classification,
      spark: panel.history.map((r) => r.value),
    })
  }

  const sysInfo = infoOf('bp_systolic')
  const diaInfo = infoOf('bp_diastolic')
  if (sysInfo && diaInfo) {
    const sys = seriesOf('bp_systolic')
    const dia = seriesOf('bp_diastolic')
    const sysBaseline = baselineOf('bp_systolic')
    const diaBaseline = baselineOf('bp_diastolic')
    // Sistólica e diastólica da mesma medição têm o mesmo horário.
    const diaByTime = new Map(dia.map((m) => [m.timestamp, m]))
    const history: Reading[] = []
    for (const s of sys) {
      const d = diaByTime.get(s.timestamp)
      if (!d) continue
      history.push({
        timestamp: s.timestamp,
        display: `${formatValue(s.value, s.unit)}/${formatValue(d.value, d.unit)}`,
        value: s.value,
        classification: classifyBloodPressure(s.value, d.value, { systolic: sysBaseline, diastolic: diaBaseline }),
        source: s.source,
      })
    }
    finish({
      id: 'blood_pressure',
      title: 'Pressão arterial',
      shortTitle: 'Pressão arterial',
      unit: sysInfo.unit,
      history,
      charts: [
        { heading: 'Sistólica', info: sysInfo, series: sys, baseline: sysBaseline },
        { heading: 'Diastólica', info: diaInfo, series: dia, baseline: diaBaseline },
      ],
      infos: [sysInfo, diaInfo],
    })
  }

  for (const id of INDICATORS) {
    if (id === 'bp_systolic' || id === 'bp_diastolic' || id === 'amsler_marks' || id === 'amsler_central') continue
    const info = infoOf(id)
    if (!info) continue
    const series = seriesOf(id)

    if (id === 'radiation') {
      // Radiação: o que se classifica é a dose acumulada, não a dose do dia.
      let total = 0
      const history = series.map((m): Reading => {
        total += m.value
        return {
          timestamp: m.timestamp,
          display: total.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          value: total,
          classification: classify('radiation', total),
          source: m.source,
        }
      })
      finish({
        id,
        title: info.name,
        shortTitle: info.short_name,
        unit: 'mSv acumulados',
        history,
        charts: [{ heading: 'Dose diária', info, series }], // sem faixa de linha de base
        infos: [info],
      })
      continue
    }

    const baseline = baselineOf(id)
    finish({
      id,
      title: info.name,
      shortTitle: info.short_name,
      unit: unitLabel(info.unit),
      history: series.map((m) => ({
        timestamp: m.timestamp,
        display: formatValue(m.value, m.unit),
        value: m.value,
        classification: classify(id, m.value, baseline),
        source: m.source,
      })),
      charts: [{ info, series, baseline }],
      infos: [info],
    })
  }
  // Grade de Amsler: total de áreas marcadas e quantas no centro, registradas juntas.
  const marksInfo = infoOf('amsler_marks')
  const centralInfo = infoOf('amsler_central')
  if (marksInfo && centralInfo) {
    const marks = seriesOf('amsler_marks')
    const central = seriesOf('amsler_central')
    const centralByTime = new Map(central.map((m) => [m.timestamp, m]))
    const history: Reading[] = []
    for (const m of marks) {
      const c = centralByTime.get(m.timestamp)
      if (!c) continue
      history.push({
        timestamp: m.timestamp,
        display: formatValue(m.value, m.unit),
        value: m.value,
        classification: classifyAmsler(m.value, c.value),
        source: m.source,
      })
    }
    finish({
      id: 'amsler',
      title: marksInfo.name,
      shortTitle: marksInfo.short_name,
      unit: 'áreas marcadas',
      history,
      charts: [
        { heading: 'Áreas marcadas, nos dois olhos', info: marksInfo, series: marks },
        { heading: 'Áreas marcadas no centro da visão', info: centralInfo, series: central },
      ],
      infos: [marksInfo, centralInfo],
    })
  }

  return panels
}

/** Agrupa as medições de um astronauta por indicador e monta os painéis. */
export function buildPanelsFor(
  astronautId: string,
  measurements: Measurement[],
  baselines: Baseline[],
  infos: IndicatorInfo[],
): Panel[] {
  const series = new Map<IndicatorId, Measurement[]>()
  for (const m of measurements) {
    if (m.astronaut_id !== astronautId) continue
    const list = series.get(m.indicator)
    if (list) list.push(m)
    else series.set(m.indicator, [m])
  }
  return buildPanels(
    series,
    baselines.filter((b) => b.astronaut_id === astronautId),
    infos,
  )
}
