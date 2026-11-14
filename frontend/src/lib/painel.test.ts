import { describe, expect, it } from 'vitest'
import type { Panel } from './dashboard'
import { formatAgo, isStale, levelFromBackend, panelBackendLevel, resolveLevel, worstLevel } from './levels'
import { originOf } from './origin'
import { barPct, daysToLimit, meanRate, pctOfLimit, RADIATION_MARKS } from './radiation'
import { MANUAL_PANELS, manualTasksForDay, SCHEDULE } from './tasks'

const HOUR = 3_600_000
const NOW = Date.parse('2026-11-12T12:00:00Z')

describe('mapeamento de níveis do backend', () => {
  it('sem caso ou alerta é normal', () => {
    expect(levelFromBackend(undefined)).toBe('normal')
    expect(levelFromBackend(null)).toBe('normal')
    expect(levelFromBackend('verde')).toBe('normal')
  })

  it('repassa os três níveis do motor sem inventar outros', () => {
    expect(levelFromBackend('atencao')).toBe('atencao')
    expect(levelFromBackend('alerta')).toBe('alerta')
    expect(levelFromBackend('critico')).toBe('critico')
    expect(levelFromBackend('vermelho')).toBe('normal')
  })

  it('pior nível vence', () => {
    expect(worstLevel(['atencao', 'critico', 'alerta'])).toBe('critico')
    expect(worstLevel([])).toBe('normal')
  })

  it('pressão arterial junta sistólica e diastólica', () => {
    const levels = { bp_systolic: { level: 'critico' as const, directive_id: 'DIR-GRAV-003', reason: 'r', privacy: 'normal' as const } }
    expect(panelBackendLevel('blood_pressure', levels).level).toBe('critico')
    expect(panelBackendLevel('heart_rate', levels).level).toBe('normal')
  })
})

describe('dado atrasado', () => {
  it('contínuo passa de 2 h', () => {
    expect(isStale('heart_rate', new Date(NOW - 1.5 * HOUR).toISOString(), NOW)).toBe(false)
    expect(isStale('heart_rate', new Date(NOW - 2.5 * HOUR).toISOString(), NOW)).toBe(true)
  })

  it('diário passa de 36 h e semanal de 8 dias', () => {
    expect(isStale('mood', new Date(NOW - 30 * HOUR).toISOString(), NOW)).toBe(false)
    expect(isStale('mood', new Date(NOW - 37 * HOUR).toISOString(), NOW)).toBe(true)
    expect(isStale('amsler', new Date(NOW - 7 * 24 * HOUR).toISOString(), NOW)).toBe(false)
    expect(isStale('amsler', new Date(NOW - 9 * 24 * HOUR).toISOString(), NOW)).toBe(true)
  })

  it('sem leitura nenhuma é atrasado e vira sem-dado', () => {
    expect(isStale('glucose', undefined, NOW)).toBe(true)
    expect(resolveLevel(true, 'critico')).toBe('sem-dado')
    expect(resolveLevel(false, 'alerta')).toBe('alerta')
  })

  it('formata há quanto tempo', () => {
    expect(formatAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('há 5 min')
    expect(formatAgo(new Date(NOW - 3 * HOUR).toISOString(), NOW)).toBe('há 3 h')
    expect(formatAgo(new Date(NOW - 72 * HOUR).toISOString(), NOW)).toBe('há 3 d')
  })
})

describe('radiação: dose de carreira contra o limite', () => {
  it('converte em porcentagem de 600 mSv', () => {
    expect(pctOfLimit(450)).toBe(75)
    expect(pctOfLimit(540)).toBe(90)
    expect(pctOfLimit(660)).toBeCloseTo(110)
    expect(barPct(660)).toBe(100)
  })

  it('marcas iguais às da DIR-RAD-001', () => {
    expect(RADIATION_MARKS.map((m) => [m.msv, m.level])).toEqual([
      [450, 'atencao'],
      [540, 'alerta'],
      [600, 'critico'],
    ])
  })

  it('projeta dias até o limite pela taxa média de 24 h', () => {
    const rates = [0, 1, 2].map((h) => ({ timestamp: new Date(NOW + h * HOUR).toISOString(), valor: 0.5 }))
    expect(meanRate(rates)).toBe(0.5)
    expect(daysToLimit(588, 0.5)).toBe(1)
    expect(daysToLimit(600, 0.5)).toBeUndefined()
  })
})

describe('origem da leitura', () => {
  it('agrupa as fontes em sensor, manual e teste', () => {
    expect(originOf('wearable')).toBe('sensor')
    expect(originOf('manual')).toBe('manual')
    expect(originOf('self_report')).toBe('manual')
    expect(originOf('cognitive_test')).toBe('teste')
    expect(originOf('vision_test')).toBe('teste')
  })
})

describe('tarefas de hoje: só medições manuais', () => {
  it('sensores não viram tarefa', () => {
    const tasks = manualTasksForDay([], NOW)
    const ids = tasks.map((t) => t.def.panelId)
    for (const sensor of ['sleep', 'exercise', 'spo2', 'heart_rate', 'radiation', 'temperature']) {
      expect(ids).not.toContain(sensor)
    }
    expect(new Set(ids)).toEqual(new Set(MANUAL_PANELS))
  })

  it('tarefa do dia fica concluída com uma medição de hoje', () => {
    const mood: Panel = {
      id: 'mood', title: 'Humor', shortTitle: 'Humor', value: '4', unit: 'de 5',
      classification: { status: 'green', reason: '' },
      history: [{ timestamp: '2026-11-12T08:00:00Z', display: '4', value: 4, classification: { status: 'green', reason: '' }, source: 'self_report' }],
      spark: [4], charts: [], infos: [],
    }
    const task = manualTasksForDay([mood], NOW).find((t) => t.def.panelId === 'mood')
    expect(task?.state).toBe('done')
    expect(SCHEDULE.length).toBeGreaterThan(MANUAL_PANELS.length)
  })
})

describe('radiação offline', () => {
  it('usa as mesmas marcas da diretiva', async () => {
    const { localRadiationLevel } = await import('./radiation')
    expect(localRadiationLevel(449)).toBe('normal')
    expect(localRadiationLevel(450)).toBe('atencao')
    expect(localRadiationLevel(545)).toBe('alerta')
    expect(localRadiationLevel(600)).toBe('critico')
  })
})
