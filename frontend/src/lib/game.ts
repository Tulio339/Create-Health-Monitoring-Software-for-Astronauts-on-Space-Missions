// Gamificação cooperativa, calculada a partir das medições (nada é guardado à parte).
//   - XP por medição da rotina, com bônus por medir no horário e por fechar o dia;
//   - sequência de dias seguidos com medição;
//   - medalhas de missão;
//   - metas da tripulação, sempre somadas: não existe ranking entre astronautas.
import type { Panel } from './dashboard'
import { DAILY_TASKS, SCHEDULE, dayKey, isOnTime } from './tasks'
import type { Task } from './tasks'

export const XP_MEASURE = 10
export const XP_ON_TIME = 5
export const XP_FULL_DAY = 20
/** XP necessários para cada nível. */
export const LEVEL_XP = 1000

export interface Medal {
  id: string
  name: string
  description: string
  earned: boolean
  /** Ex.: "7 de 7 dias". */
  progress: string
}

export interface Progress {
  xp: number
  level: number
  /** XP já acumulados dentro do nível atual (0 a LEVEL_XP − 1). */
  xpIntoLevel: number
  /** XP ganhos hoje. */
  xpToday: number
  /** Dias seguidos com medição, contando até hoje (ou até ontem, se hoje ainda não houve medição). */
  streak: number
  /** A sequência cai se não houver medição hoje. */
  streakAtRisk: boolean
  bestStreak: number
  /** Dias de missão em que toda a rotina diária foi cumprida. */
  fullDays: string[]
  onTimeCount: number
  measureCount: number
  medals: Medal[]
}

const DAY_MS = 86_400_000
const previousDay = (day: string) => dayKey(Date.parse(`${day}T00:00:00Z`) - DAY_MS)

/**
 * Progresso de um astronauta. Conta uma medição por tarefa por dia, a partir do
 * início da missão; repetir a mesma medição no dia não rende XP extra.
 */
export function computeProgress(panels: Panel[], missionStart: string, nowMs: number, todayTasks: Task[] = []): Progress {
  const today = dayKey(nowMs)
  const xpByDay = new Map<string, number>()
  const dailyDoneByDay = new Map<string, number>()
  const measuredDays = new Set<string>()
  let onTimeCount = 0
  let measureCount = 0
  let amslerTests = 0
  const add = (day: string, xp: number) => xpByDay.set(day, (xpByDay.get(day) ?? 0) + xp)

  for (const def of SCHEDULE) {
    const panel = panels.find((p) => p.id === def.panelId)
    if (!panel) continue
    const seen = new Set<string>()
    for (const reading of panel.history) {
      const day = dayKey(reading.timestamp)
      measuredDays.add(day)
      if (day < missionStart || seen.has(day)) continue
      seen.add(day)
      measureCount++
      add(day, XP_MEASURE)
      if (isOnTime(def, reading.timestamp)) {
        onTimeCount++
        add(day, XP_ON_TIME)
      }
      if (def.every === 'day') dailyDoneByDay.set(day, (dailyDoneByDay.get(day) ?? 0) + 1)
      if (def.panelId === 'amsler') amslerTests++
    }
  }

  const fullDays = [...dailyDoneByDay].filter(([, done]) => done >= DAILY_TASKS.length).map(([day]) => day).sort()
  for (const day of fullDays) add(day, XP_FULL_DAY)
  const xp = [...xpByDay.values()].reduce((sum, v) => sum + v, 0)

  // Sequência atual: termina hoje, ou ontem se hoje ainda não houve medição.
  let cursor = measuredDays.has(today) ? today : previousDay(today)
  let streak = 0
  while (measuredDays.has(cursor)) {
    streak++
    cursor = previousDay(cursor)
  }
  let bestStreak = 0
  for (const day of measuredDays) {
    if (measuredDays.has(previousDay(day))) continue // só começa a contar no primeiro dia de cada sequência
    let run = 0
    let d = day
    while (measuredDays.has(d)) {
      run++
      d = dayKey(Date.parse(`${d}T00:00:00Z`) + DAY_MS)
    }
    bestStreak = Math.max(bestStreak, run)
  }

  const todayDone = todayTasks.filter((t) => t.state === 'done').length
  const cap = (value: number, target: number) => `${Math.min(value, target)} de ${target}`
  const medals: Medal[] = [
    {
      id: 'week_streak',
      name: 'Semana em órbita',
      description: '7 dias seguidos com medição.',
      earned: bestStreak >= 7,
      progress: `${cap(bestStreak, 7)} dias`,
    },
    {
      id: 'month_streak',
      name: 'Mês em órbita',
      description: '30 dias seguidos com medição.',
      earned: bestStreak >= 30,
      progress: `${cap(bestStreak, 30)} dias`,
    },
    {
      id: 'full_days',
      name: 'Checklist impecável',
      description: '10 dias de missão com toda a rotina diária cumprida.',
      earned: fullDays.length >= 10,
      progress: `${cap(fullDays.length, 10)} dias completos`,
    },
    {
      id: 'punctual',
      name: 'Relógio de bordo',
      description: '50 medições feitas no horário.',
      earned: onTimeCount >= 50,
      progress: `${cap(onTimeCount, 50)} no horário`,
    },
    {
      id: 'vision',
      name: 'Olho vivo',
      description: '4 testes da grade de Amsler durante a missão.',
      earned: amslerTests >= 4,
      progress: `${cap(amslerTests, 4)} testes`,
    },
    {
      id: 'today',
      name: 'Dia fechado',
      description: 'Todas as tarefas de hoje concluídas.',
      earned: todayTasks.length > 0 && todayDone === todayTasks.length,
      progress: `${todayDone} de ${todayTasks.length} tarefas hoje`,
    },
  ]

  return {
    xp,
    level: Math.floor(xp / LEVEL_XP) + 1,
    xpIntoLevel: xp % LEVEL_XP,
    xpToday: xpByDay.get(today) ?? 0,
    streak,
    streakAtRisk: streak > 0 && !measuredDays.has(today),
    bestStreak,
    fullDays,
    onTimeCount,
    measureCount,
    medals,
  }
}

export interface CrewGoal {
  id: string
  name: string
  description: string
  value: number
  target: number
  unit: string
}

/** XP da tripulação para cada marco coletivo. */
export const CREW_MILESTONE_XP = 5000

/** Metas da tripulação: tudo somado, sem comparar um astronauta com o outro. */
export function computeCrewGoals(crew: { progress: Progress; tasks: Task[] }[], nowMs: number): CrewGoal[] {
  const today = dayKey(nowMs)
  const allTasks = crew.flatMap((c) => c.tasks)
  const lastWeek = new Set(Array.from({ length: 7 }, (_, i) => dayKey(nowMs - i * DAY_MS)))
  const xp = crew.reduce((sum, c) => sum + c.progress.xp, 0)
  const nextMilestone = (Math.floor(xp / CREW_MILESTONE_XP) + 1) * CREW_MILESTONE_XP
  return [
    {
      id: 'today',
      name: 'Checklist de hoje',
      description: 'Tarefas do dia concluídas por toda a tripulação.',
      value: allTasks.filter((t) => t.state === 'done').length,
      target: allTasks.length,
      unit: 'tarefas',
    },
    {
      id: 'everyone',
      name: 'Ninguém fica para trás',
      description: 'Tripulantes que já fizeram ao menos uma medição hoje.',
      value: crew.filter((c) => c.tasks.some((t) => t.state === 'done' && t.doneAt && dayKey(t.doneAt) === today)).length,
      target: crew.length,
      unit: 'tripulantes',
    },
    {
      id: 'week',
      name: 'Semana completa',
      description: 'Dias com a rotina inteira cumprida nos últimos 7 dias, somando a tripulação.',
      value: crew.reduce((sum, c) => sum + c.progress.fullDays.filter((d) => lastWeek.has(d)).length, 0),
      target: crew.length * 7,
      unit: 'dias completos',
    },
    {
      id: 'xp',
      name: 'Próximo marco da tripulação',
      description: `XP somado de todos. A cada ${CREW_MILESTONE_XP.toLocaleString('pt-BR')} XP a tripulação atinge um novo marco.`,
      value: xp,
      target: nextMilestone,
      unit: 'XP',
    },
  ]
}
