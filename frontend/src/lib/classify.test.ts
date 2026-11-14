import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Astronaut, Baseline, IndicatorId, Measurement } from '../types'
import { classify, classifyBloodPressure, cumulativeDose, worstStatus } from './classify'
import { missionDay } from './format'

const mock = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../public/mock/${name}.json`, import.meta.url), 'utf8'))

const astronauts = mock<Astronaut[]>('astronauts')
const measurements = mock<Measurement[]>('measurements')
const baselines = mock<Baseline[]>('baselines')
const MISSION_START = astronauts[0].mission_start

/** Valor medido em um dia de missão (1..30; <= 0 é pré-voo). */
function valueOn(astronautId: string, indicator: IndicatorId, day: number): number {
  const m = measurements.find(
    (x) =>
      x.astronaut_id === astronautId && x.indicator === indicator && missionDay(x.timestamp, MISSION_START) === day,
  )
  if (!m) throw new Error(`sem medição: ${astronautId} ${indicator} dia ${day}`)
  return m.value
}

function baselineOf(astronautId: string, indicator: IndicatorId): Baseline {
  const b = baselines.find((x) => x.astronaut_id === astronautId && x.indicator === indicator)
  if (!b) throw new Error(`sem linha de base: ${astronautId} ${indicator}`)
  return b
}

const classifyOn = (astronautId: string, indicator: IndicatorId, day: number) =>
  classify(indicator, valueOn(astronautId, indicator, day), baselineOf(astronautId, indicator))

const pressureOn = (astronautId: string, day: number) =>
  classifyBloodPressure(valueOn(astronautId, 'bp_systolic', day), valueOn(astronautId, 'bp_diastolic', day), {
    systolic: baselineOf(astronautId, 'bp_systolic'),
    diastolic: baselineOf(astronautId, 'bp_diastolic'),
  })

describe('classify — regras', () => {
  const baseline = { mean: 60, std: 5 }

  it('verde quando está na faixa fixa e perto da linha de base', () => {
    expect(classify('heart_rate', 62, baseline)).toEqual({
      status: 'green',
      reason: 'dentro da faixa esperada e próximo da sua média',
    })
  })

  it('amarelo fora de média ± 2 desvios, com a razão em desvios', () => {
    expect(classify('heart_rate', 72, baseline)).toEqual({
      status: 'yellow',
      reason: 'acima da sua média em 2,4 desvios',
    })
    expect(classify('heart_rate', 47, baseline)).toEqual({
      status: 'yellow',
      reason: 'abaixo da sua média em 2,6 desvios',
    })
  })

  it('exatamente 2 desvios ainda é verde', () => {
    expect(classify('heart_rate', 70, baseline).status).toBe('green')
  })

  it('a linha de base sozinha nunca dá vermelho', () => {
    expect(classify('heart_rate', 95, baseline).status).toBe('yellow') // 7 desvios, mas dentro da faixa fixa
  })

  it('faixa fixa dá amarelo e vermelho mesmo sem linha de base', () => {
    expect(classify('temperature', 36.8)).toEqual({ status: 'green', reason: 'dentro da faixa esperada' })
    expect(classify('temperature', 37.8)).toEqual({
      status: 'yellow',
      reason: 'acima da faixa esperada (até 37,5 °C)',
    })
    expect(classify('temperature', 38.6)).toEqual({ status: 'red', reason: 'acima do limite seguro (38 °C)' })
    expect(classify('spo2', 88)).toEqual({ status: 'red', reason: 'abaixo do limite seguro (90 %)' })
  })

  it('quando faixa fixa e linha de base dão amarelo, a razão cita as duas', () => {
    expect(classify('bp_systolic', 135, { mean: 118, std: 4 }).reason).toBe(
      'acima da faixa esperada (até 129 mmHg) e acima da sua média em 4,3 desvios',
    )
  })

  it('quando a faixa fixa dá vermelho, a razão é só a do vermelho', () => {
    expect(classify('bp_systolic', 145, { mean: 118, std: 4 })).toEqual({
      status: 'red',
      reason: 'acima do limite seguro (139 mmHg)',
    })
  })

  it('desvio para o lado bom não gera alerta', () => {
    expect(classify('exercise', 110, { mean: 58, std: 6 }).status).toBe('green') // mais exercício
    expect(classify('reaction_time', 230, { mean: 265, std: 8 }).status).toBe('green') // mais rápido
    expect(classify('sleep', 8.6, { mean: 7.4, std: 0.4 }).status).toBe('green') // dormiu mais
  })

  it('ignora linha de base sem variação (desvio zero)', () => {
    expect(classify('mood', 3, { mean: 4, std: 0 }).status).toBe('green')
  })

  it('worstStatus fica com o mais grave', () => {
    expect(worstStatus('green', 'yellow')).toBe('yellow')
    expect(worstStatus('yellow', 'red', 'green')).toBe('red')
    expect(worstStatus('green', 'green')).toBe('green')
  })
})

describe('classify — radiação (dose acumulada, sem linha de base)', () => {
  it('usa % do limite de carreira de 600 mSv', () => {
    expect(classify('radiation', 120)).toEqual({
      status: 'green',
      reason: 'dose acumulada de 120 mSv, 20% do limite de carreira (600 mSv)',
    })
    expect(classify('radiation', 300).status).toBe('yellow') // 50%
    expect(classify('radiation', 479).status).toBe('yellow')
    expect(classify('radiation', 480).status).toBe('red') // 80%
  })

  it('ignora a linha de base mesmo quando ela é passada', () => {
    // No mock, a dose diária em órbita fica centenas de desvios acima do pré-voo.
    const result = classify('radiation', 17, baselineOf('ast-01', 'radiation'))
    expect(result.status).toBe('green')
    expect(result.reason).not.toContain('desvios')
  })

  it('mock: os 3 astronautas terminam a missão em verde, com menos de 5% do limite', () => {
    for (const { id } of astronauts) {
      const doses = measurements.filter((m) => m.astronaut_id === id && m.indicator === 'radiation').map((m) => m.value)
      const total = cumulativeDose(doses)
      expect(total).toBeGreaterThan(10)
      expect(total).toBeLessThan(30)
      expect(classify('radiation', total).status).toBe('green')
    }
  })
})

describe('mock — ast-01: pressão arterial subindo aos poucos', () => {
  it('começa a missão em verde', () => {
    expect(pressureOn('ast-01', 1).status).toBe('green')
    expect(pressureOn('ast-01', 5).status).toBe('green')
  })

  it('passa a amarelo no meio da missão', () => {
    expect(pressureOn('ast-01', 19).status).toBe('yellow')
  })

  it('chega a vermelho no dia 28 (sistólica acima do limite seguro)', () => {
    expect(valueOn('ast-01', 'bp_systolic', 28)).toBeGreaterThanOrEqual(140)
    const result = pressureOn('ast-01', 28)
    expect(result.status).toBe('red')
    expect(result.reason).toBe('sistólica acima do limite seguro (139 mmHg)')
  })

  it('no último dia está em amarelo, e a razão cita sistólica e diastólica', () => {
    const result = pressureOn('ast-01', 30)
    expect(result.status).toBe('yellow')
    expect(result.reason).toMatch(/^sistólica acima da faixa esperada \(até 129 mmHg\) e acima da sua média em \d+,\d desvios; diastólica acima da sua média em \d+,\d desvios$/)
  })

  it('o pior status vale: diastólica verde não esconde sistólica vermelha', () => {
    expect(classifyBloodPressure(150, 75)).toEqual({
      status: 'red',
      reason: 'sistólica acima do limite seguro (139 mmHg)',
    })
    expect(classifyBloodPressure(120, 92).status).toBe('red')
    expect(classifyBloodPressure(120, 75)).toEqual({
      status: 'green',
      reason: 'sistólica e diastólica dentro da faixa esperada',
    })
  })
})

describe('mock — ast-02: febre por 4 dias (dias 12 a 15)', () => {
  it('temperatura normal antes e depois', () => {
    expect(classifyOn('ast-02', 'temperature', 11).status).toBe('green')
    expect(classifyOn('ast-02', 'temperature', 16).status).toBe('green')
    expect(classifyOn('ast-02', 'temperature', 30).status).toBe('green')
  })

  it('nenhum dos 4 dias de febre fica verde', () => {
    for (const day of [12, 13, 14, 15]) {
      expect(classifyOn('ast-02', 'temperature', day).status).not.toBe('green')
    }
  })

  it('o pico da febre (dias 13 e 14) é vermelho', () => {
    for (const day of [13, 14]) {
      expect(classifyOn('ast-02', 'temperature', day)).toEqual({
        status: 'red',
        reason: 'acima do limite seguro (38 °C)',
      })
    }
  })

  it('a frequência cardíaca acompanha a febre: amarelo pela linha de base', () => {
    const result = classifyOn('ast-02', 'heart_rate', 13)
    expect(result.status).toBe('yellow')
    expect(result.reason).toMatch(/^acima da sua média em \d+,\d desvios$/)
  })
})

describe('mock — ast-03: sono caindo', () => {
  it('começa a missão em verde', () => {
    expect(classifyOn('ast-03', 'sleep', 1).status).toBe('green')
  })

  it('no dia 15 está em amarelo só pela linha de base (ainda dentro da faixa fixa)', () => {
    const result = classifyOn('ast-03', 'sleep', 15)
    expect(result.status).toBe('yellow')
    expect(result.reason).toMatch(/^abaixo da sua média em \d+,\d desvios$/)
  })

  it('termina a missão em vermelho (menos de 5 h)', () => {
    expect(classifyOn('ast-03', 'sleep', 30)).toEqual({
      status: 'red',
      reason: 'abaixo do limite seguro (5 h)',
    })
  })

  it('o tempo de reação piora junto: amarelo no último dia', () => {
    const result = classifyOn('ast-03', 'reaction_time', 30)
    expect(result.status).toBe('yellow')
    expect(result.reason).toMatch(/^acima da sua média em \d+,\d desvios$/)
  })
})
