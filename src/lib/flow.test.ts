// Testes do fluxo de registro: validação de entrada, alertas e relatório para a Terra.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Astronaut, Baseline, IndicatorInfo, Measurement } from '../types'
import { INDICATORS } from '../types'
import { TIME_ACCELERATION, alertStatus, buildAlerts, buildReport, transmission } from './alerts'
import { classify, classifyAmsler } from './classify'
import { buildPanelsFor } from './dashboard'
import { missionDay } from './format'
import { AMSLER_SIZE, countAmsler, isCentralArea, isFalseStart, meanReaction, nextTimestamp, randomDelay } from './selfTests'
import { baselineWarning, parseNumber, validateBloodPressure, validateValue } from './validate'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

const astronauts = json<Astronaut[]>('public/mock/astronauts.json')
const measurements = json<Measurement[]>('public/mock/measurements.json')
const baselines = json<Baseline[]>('public/mock/baselines.json')
const infos = INDICATORS.map((id) => json<IndicatorInfo>(`knowledge/${id}.json`))
const START = astronauts[0].mission_start
const day = (timestamp: string) => missionDay(timestamp, START)

const CENTRAL = Array.from({ length: AMSLER_SIZE * AMSLER_SIZE }, (_, i) => i).filter(isCentralArea)

/** Atraso de comunicação do trânsito para Marte, em segundos. */
const MARS_DELAY_S = 20 * 60

const alertsFor = (astronautId: string, extra: Measurement[] = []) =>
  buildAlerts(astronautId, buildPanelsFor(astronautId, [...measurements, ...extra], baselines, infos))

describe('validação de entrada', () => {
  it('aceita vírgula ou ponto como decimal e recusa texto', () => {
    expect(parseNumber('36,6')).toBe(36.6)
    expect(parseNumber(' 36.6 ')).toBe(36.6)
    expect(parseNumber('')).toBeNaN()
    expect(parseNumber('abc')).toBeNaN()
    expect(parseNumber('36,6,1')).toBeNaN()
  })

  it('rejeita valores fisiologicamente impossíveis, com mensagem clara', () => {
    expect(validateValue('temperature', 366)).toBe(
      'Temperatura de 366 °C não é um valor possível. Digite um valor entre 25 e 45 °C.',
    )
    expect(validateValue('spo2', 101)).toBe('SpO2 de 101 % não é um valor possível. Digite um valor entre 50 e 100 %.')
    expect(validateValue('heart_rate', 0)).toMatch(/não é um valor possível/)
    expect(validateValue('sleep', 25)).toMatch(/não é um valor possível/)
    expect(validateValue('sleep', -1)).toMatch(/não é um valor possível/)
    expect(validateValue('mood', 6)).toMatch(/não é um valor possível/)
    expect(validateValue('mood', 3.5)).toMatch(/valor inteiro de 1 a 5/)
    expect(validateValue('glucose', NaN)).toBe('Glicemia: digite um número.')
  })

  it('aceita valores possíveis, mesmo que ruins (isso é papel do classify)', () => {
    expect(validateValue('temperature', 39.5)).toBeUndefined()
    expect(validateValue('spo2', 100)).toBeUndefined()
    expect(validateValue('spo2', 85)).toBeUndefined()
    expect(validateValue('sleep', 0)).toBeUndefined()
  })

  it('pressão: valida os dois campos e exige sistólica maior que diastólica', () => {
    expect(validateBloodPressure(120, 80)).toBeUndefined()
    expect(validateBloodPressure(1200, 80)).toMatch(/^Pressão sistólica de 1\.200 mmHg não é um valor possível/)
    expect(validateBloodPressure(120, 800)).toMatch(/^Pressão diastólica de 800 mmHg não é um valor possível/)
    expect(validateBloodPressure(80, 120)).toMatch(/precisa ser maior que a diastólica/)
  })

  it('pede confirmação para valores muito fora da linha de base, sem bloquear', () => {
    const baseline = { mean: 7.5, std: 0.4 }
    expect(baselineWarning('sleep', 7.0, baseline)).toBeUndefined() // 1,25 desvio
    expect(baselineWarning('sleep', 6.4, baseline)).toBeUndefined() // 2,75: amarelo, mas não pede confirmação
    expect(baselineWarning('sleep', 4.5, baseline)).toBe('Sono de 4,5 h está 7,5 desvios abaixo da sua média (7,5 h).')
    expect(validateValue('sleep', 4.5)).toBeUndefined() // continua sendo aceito
  })

  it('não pede confirmação no lado bom, sem linha de base, nem para radiação', () => {
    expect(baselineWarning('exercise', 110, { mean: 58, std: 6 })).toBeUndefined()
    expect(baselineWarning('heart_rate', 110)).toBeUndefined()
    expect(baselineWarning('radiation', 0.6, { mean: 0.008, std: 0.001 })).toBeUndefined()
  })
})

describe('alertas gerados pelas medições do mock', () => {
  it('ast-03: um único alerta de sono em aberto, que chegou a vermelho', () => {
    const sleep = alertsFor('ast-03').filter((a) => a.panelId === 'sleep' && !a.endedAt)
    expect(sleep).toHaveLength(1)
    expect(sleep[0].level).toBe('red')
    expect(sleep[0].trigger.classification.reason).toBe('abaixo do limite seguro (5 h)')
    expect(day(sleep[0].latest.timestamp)).toBe(30)
    expect(sleep[0].trend).toMatch(/^em queda: −\d,\d h em relação à média das 7 medições anteriores/)
    expect(alertStatus(sleep[0], {})).toBe('new')
  })

  it('ast-02: a febre dos dias 12 a 15 é um alerta vermelho já encerrado', () => {
    const fever = alertsFor('ast-02').filter((a) => a.panelId === 'temperature' && a.level === 'red')
    expect(fever).toHaveLength(1)
    expect(day(fever[0].startedAt)).toBe(12)
    expect(day(fever[0].trigger.timestamp)).toBe(13) // primeiro dia em vermelho
    expect(day(fever[0].endedAt!)).toBe(16)
    expect(alertStatus(fever[0], {})).toBe('resolved')
  })

  it('ast-01: a pressão está em aberto e chegou a vermelho no dia 28', () => {
    const pressure = alertsFor('ast-01').filter((a) => a.panelId === 'blood_pressure' && !a.endedAt)
    expect(pressure).toHaveLength(1)
    expect(pressure[0].level).toBe('red')
    expect(day(pressure[0].trigger.timestamp)).toBe(28)
    expect(pressure[0].trend).toMatch(/^sistólica em alta: \+/)
    expect(pressure[0].latest.classification.status).toBe('yellow') // hoje está em amarelo
  })

  it('a situação dada pelo usuário vale, e volta a "novo" se o alerta piorar', () => {
    const yellow = { ...alertsFor('ast-03').find((a) => a.panelId === 'reaction_time' && !a.endedAt)! }
    expect(yellow.level).toBe('yellow')
    const stored = { [yellow.stateKey]: 'seen' as const }
    expect(alertStatus(yellow, stored)).toBe('seen')
    const escalated = { ...yellow, level: 'red' as const, stateKey: `${yellow.id}:red` }
    expect(alertStatus(escalated, stored)).toBe('new')
  })
})

describe('medição nova registrada pelo astronauta', () => {
  const now = '2026-11-14T10:00:00.000Z'
  const fever: Measurement = {
    astronaut_id: 'ast-01',
    indicator: 'temperature',
    value: 39.2,
    unit: '°C',
    timestamp: now,
    source: 'manual',
  }

  it('entra no painel como leitura mais recente', () => {
    const panel = buildPanelsFor('ast-01', [...measurements, fever], baselines, infos).find((p) => p.id === 'temperature')!
    expect(panel.value).toBe('39,2')
    expect(panel.classification).toEqual({ status: 'red', reason: 'acima do limite seguro (38 °C)' })
    expect(panel.history.at(-1)!.source).toBe('manual')
  })

  it('gera alerta vermelho novo e relatório para a Terra', () => {
    const alert = alertsFor('ast-01', [fever]).find((a) => a.panelId === 'temperature' && !a.endedAt)!
    expect(alert.level).toBe('red')
    expect(alertStatus(alert, {})).toBe('new')

    const report = buildReport(alert, astronauts[0], MARS_DELAY_S)!
    expect(report).toMatchObject({
      astronaut: 'Ana Ribeiro',
      indicator: 'Temperatura corporal',
      value: '39,2 °C',
      reason: 'acima do limite seguro (38 °C)',
      measuredAt: now,
    })
    expect(report.trend).toMatch(/^em alta: \+2,\d °C em relação à média das 7 medições anteriores \(36,\d °C\)$/)
  })

  it('o relatório fica na fila pelo atraso simulado e depois é entregue', () => {
    const alert = alertsFor('ast-01', [fever]).find((a) => a.panelId === 'temperature' && !a.endedAt)!
    const report = buildReport(alert, astronauts[0], MARS_DELAY_S)!
    const t0 = Date.parse(now)
    const realDelayMs = (MARS_DELAY_S * 1000) / TIME_ACCELERATION

    expect(transmission(report, t0)).toEqual({ delivered: false, progress: 0, remainingSimSeconds: MARS_DELAY_S })
    const half = transmission(report, t0 + realDelayMs / 2)
    expect(half.delivered).toBe(false)
    expect(half.progress).toBeCloseTo(0.5)
    expect(half.remainingSimSeconds).toBe(MARS_DELAY_S / 2)
    expect(transmission(report, t0 + realDelayMs)).toEqual({ delivered: true, progress: 1, remainingSimSeconds: 0 })
  })

  it('alerta amarelo não gera relatório', () => {
    const yellow = alertsFor('ast-03').find((a) => a.level === 'yellow')!
    expect(buildReport(yellow, astronauts[2], MARS_DELAY_S)).toBeUndefined()
  })

  it('pressão: sistólica e diastólica registradas juntas viram uma leitura só', () => {
    const pair: Measurement[] = [
      { astronaut_id: 'ast-02', indicator: 'bp_systolic', value: 150, unit: 'mmHg', timestamp: now, source: 'manual' },
      { astronaut_id: 'ast-02', indicator: 'bp_diastolic', value: 95, unit: 'mmHg', timestamp: now, source: 'manual' },
    ]
    const panel = buildPanelsFor('ast-02', [...measurements, ...pair], baselines, infos).find((p) => p.id === 'blood_pressure')!
    expect(panel.value).toBe('150/95')
    expect(panel.classification.status).toBe('red')
    expect(panel.history).toHaveLength(45)
  })
})

describe('mapa do corpo (knowledge/body.json)', () => {
  const regions = json<{ id: string; indicators: string[]; untracked: unknown[] }[]>('knowledge/body.json')
  const panelIds = buildPanelsFor('ast-01', measurements, baselines, infos).map((p) => p.id as string)

  it('tem as seis regiões', () => {
    expect(regions.map((r) => r.id)).toEqual(['brain', 'eyes', 'heart', 'lungs', 'bones', 'immune'])
  })

  it('todo indicador ligado a uma região existe no dashboard', () => {
    for (const region of regions) for (const id of region.indicators) expect(panelIds).toContain(id)
  })

  it('toda região tem ao menos um indicador ou um exame ainda não registrado', () => {
    for (const region of regions) expect(region.indicators.length + region.untracked.length).toBeGreaterThan(0)
  })
})

describe('testes do app: tempo de reação', () => {
  it('o atraso antes do sinal fica entre 1 e 4 segundos', () => {
    expect(randomDelay(() => 0)).toBe(1000)
    expect(randomDelay(() => 0.5)).toBe(2500)
    expect(randomDelay(() => 0.999999)).toBeLessThan(4000)
    for (let i = 0; i < 200; i++) {
      const delay = randomDelay()
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThan(4000)
    }
  })

  it('clique antes do sinal (ou rápido demais) é erro', () => {
    expect(isFalseStart(undefined)).toBe(true) // clicou antes de o sinal aparecer
    expect(isFalseStart(40)).toBe(true) // rápido demais para ser reação
    expect(isFalseStart(100)).toBe(false)
    expect(isFalseStart(280)).toBe(false)
  })

  it('a média usa só as rodadas válidas e é comparada com a linha de base', () => {
    const mean = meanReaction([251, 262, 248, 270, 259])
    expect(mean).toBe(258)
    const baseline = baselines.find((b) => b.astronaut_id === 'ast-02' && b.indicator === 'reaction_time')!
    expect(classify('reaction_time', mean, baseline).status).toBe('green')
    const slow = classify('reaction_time', meanReaction([330, 345, 338, 351, 341]), baseline)
    expect(slow.status).toBe('yellow')
    expect(slow.reason).toMatch(/^acima da sua média em \d+,?\d* desvios$/)
    expect(classify('reaction_time', 480, baseline)).toEqual({ status: 'red', reason: 'acima do limite seguro (450 ms)' })
  })

  it('o resultado salvo vira a leitura mais recente do painel', () => {
    const panel = buildPanelsFor('ast-02', measurements, baselines, infos).find((p) => p.id === 'reaction_time')!
    const timestamp = nextTimestamp(panel.history, Date.parse('2026-11-14T12:00:00Z'))
    expect(timestamp).toBe('2026-11-14T12:00:00.000Z')
    // relógio atrasado: ainda assim fica depois da última leitura
    expect(Date.parse(nextTimestamp(panel.history, 0))).toBe(Date.parse(panel.history.at(-1)!.timestamp) + 1000)
  })
})

describe('testes do app: grade de Amsler', () => {
  const eye = (...indexes: number[]) => new Set(indexes)

  it('o centro são as quatro áreas em volta do ponto de fixação', () => {
    expect(CENTRAL).toEqual([44, 45, 54, 55])
  })

  it('conta as marcações por olho, o total e as do centro', () => {
    expect(countAmsler({ right: eye(0, 12, 44), left: eye(99) })).toEqual({ right: 3, left: 1, total: 4, central: 1 })
    expect(countAmsler({ right: eye(), left: eye() })).toEqual({ right: 0, left: 0, total: 0, central: 0 })
  })

  it('sem marcações é verde; com marcações é amarelo', () => {
    expect(classifyAmsler(0, 0)).toEqual({ status: 'green', reason: 'nenhuma área marcada nos dois olhos' })
    expect(classifyAmsler(1, 0)).toEqual({ status: 'yellow', reason: '1 área marcada, fora do centro da visão' })
    expect(classifyAmsler(7, 0)).toEqual({ status: 'yellow', reason: '7 áreas marcadas, fora do centro da visão' })
  })

  it('muitas marcações ou marcação no centro é vermelho', () => {
    expect(classifyAmsler(8, 0)).toEqual({ status: 'red', reason: '8 áreas marcadas (a partir de 8 é considerado muito)' })
    expect(classifyAmsler(1, 1)).toEqual({ status: 'red', reason: '1 área marcada, 1 no centro da visão' })
    expect(classifyAmsler(3, 2).status).toBe('red')
  })

  it('no mock todos têm a grade limpa, e o painel aparece no dashboard', () => {
    for (const { id } of astronauts) {
      const panel = buildPanelsFor(id, measurements, baselines, infos).find((p) => p.id === 'amsler')!
      expect(panel.history).toHaveLength(6)
      expect(panel.classification.status).toBe('green')
    }
    expect(alertsFor('ast-01').filter((a) => a.panelId === 'amsler')).toHaveLength(0)
  })

  it('um teste com marcação no centro gera alerta vermelho e relatório para a Terra', () => {
    const now = '2026-11-14T10:00:00.000Z'
    const result: Measurement[] = [
      { astronaut_id: 'ast-01', indicator: 'amsler_marks', value: 3, unit: 'áreas', timestamp: now, source: 'vision_test' },
      { astronaut_id: 'ast-01', indicator: 'amsler_central', value: 1, unit: 'áreas', timestamp: now, source: 'vision_test' },
    ]
    const alert = alertsFor('ast-01', result).find((a) => a.panelId === 'amsler')!
    expect(alert.level).toBe('red')
    expect(alert.trigger.classification.reason).toBe('3 áreas marcadas, 1 no centro da visão')
    const report = buildReport(alert, astronauts[0], MARS_DELAY_S)!
    expect(report).toMatchObject({ indicator: 'Grade de Amsler', value: '3 áreas marcadas' })
    expect(report.trend).toBe('em alta: +3 áreas marcadas em relação à média das 6 medições anteriores (0 áreas marcadas)')
  })
})
