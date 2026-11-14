// Tarefas do dia: o que medir e até quando. Uma tarefa fica concluída sozinha quando
// existe uma medição daquele indicador no dia (nada é marcado à mão).
// O "dia" e os horários seguem o horário da missão, que aqui é UTC.
import type { Panel, PanelId } from './dashboard'

export interface TaskDef {
  panelId: PanelId
  /** Momento do dia, em texto. */
  when: string
  /** Prazo: hora do dia (UTC) até a qual a medição conta como "no horário". */
  dueHour: number
  /** Diária, ou semanal (a cada 7 dias). */
  every: 'day' | 'week'
  /** Registrada pelo formulário ou por um teste do app. */
  via: 'record' | 'reacao' | 'amsler'
}

export const SCHEDULE: TaskDef[] = [
  { panelId: 'sleep',          when: 'ao acordar',                    dueHour: 8,  every: 'day',  via: 'record' },
  { panelId: 'heart_rate',     when: 'ao acordar, em repouso',        dueHour: 8,  every: 'day',  via: 'record' },
  { panelId: 'blood_pressure', when: 'antes do café e do exercício',  dueHour: 9,  every: 'day',  via: 'record' },
  { panelId: 'temperature',    when: 'pela manhã',                    dueHour: 9,  every: 'day',  via: 'record' },
  { panelId: 'glucose',        when: 'em jejum',                      dueHour: 9,  every: 'day',  via: 'record' },
  { panelId: 'spo2',           when: 'pela manhã, em repouso',        dueHour: 9,  every: 'day',  via: 'record' },
  { panelId: 'exercise',       when: 'depois da última sessão',       dueHour: 20, every: 'day',  via: 'record' },
  { panelId: 'reaction_time',  when: 'fim da tarde, sem distrações',  dueHour: 20, every: 'day',  via: 'reacao' },
  { panelId: 'mood',           when: 'no fim do dia',                 dueHour: 21, every: 'day',  via: 'record' },
  { panelId: 'radiation',      when: 'leitura do dosímetro, à noite', dueHour: 21, every: 'day',  via: 'record' },
  { panelId: 'amsler',         when: 'uma vez por semana',            dueHour: 21, every: 'week', via: 'amsler' },
]

export const DAILY_TASKS = SCHEDULE.filter((t) => t.every === 'day')
/** Intervalo da tarefa semanal, em dias. */
export const WEEK_DAYS = 7
/** Minutos antes do prazo em que a tarefa vira lembrete ("vence em breve"). */
export const DUE_SOON_MIN = 60

const DAY_MS = 86_400_000

/** Dia (AAAA-MM-DD, UTC) de um instante. */
export const dayKey = (time: number | string): string => new Date(time).toISOString().slice(0, 10)

/** Instante (ms) do prazo de uma tarefa no dia indicado. */
export const dueAt = (def: TaskDef, day: string): number => Date.parse(`${day}T00:00:00Z`) + def.dueHour * 3_600_000

/** A medição foi feita dentro do prazo do seu dia? (A tarefa semanal não tem hora.) */
export function isOnTime(def: TaskDef, timestamp: string): boolean {
  return def.every === 'week' || Date.parse(timestamp) <= dueAt(def, dayKey(timestamp))
}

export type TaskState = 'overdue' | 'due_soon' | 'pending' | 'done'

export interface Task {
  def: TaskDef
  title: string
  state: TaskState
  dueAtMs: number
  /** Minutos até o prazo (negativo se já passou); só para tarefas não concluídas. */
  minutesLeft?: number
  /** Horário da medição que concluiu a tarefa. */
  doneAt?: string
  onTime?: boolean
}

const ORDER: Record<TaskState, number> = { overdue: 0, due_soon: 1, pending: 2, done: 3 }

/** Tarefas de hoje de um astronauta, das mais urgentes para as concluídas. */
export function tasksForDay(panels: Panel[], nowMs: number): Task[] {
  const today = dayKey(nowMs)
  const tasks: Task[] = []
  for (const def of SCHEDULE) {
    const panel = panels.find((p) => p.id === def.panelId)
    if (!panel) continue
    const doneToday = panel.history.find((r) => dayKey(r.timestamp) === today)
    if (def.every === 'week' && !doneToday) {
      // A tarefa semanal só entra na lista quando já passou uma semana do último teste.
      const last = panel.history.at(-1)
      const daysSince = last ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(last.timestamp)}T00:00:00Z`)) / DAY_MS : Infinity
      if (daysSince < WEEK_DAYS) continue
    }
    const dueAtMs = dueAt(def, today)
    if (doneToday) {
      tasks.push({
        def,
        title: panel.title,
        state: 'done',
        dueAtMs,
        doneAt: doneToday.timestamp,
        onTime: isOnTime(def, doneToday.timestamp),
      })
      continue
    }
    const minutesLeft = Math.ceil((dueAtMs - nowMs) / 60_000)
    tasks.push({
      def,
      title: panel.title,
      state: minutesLeft < 0 ? 'overdue' : minutesLeft <= DUE_SOON_MIN ? 'due_soon' : 'pending',
      dueAtMs,
      minutesLeft,
    })
  }
  return tasks.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.dueAtMs - b.dueAtMs)
}

/** Tarefas que pedem lembrete agora: atrasadas ou vencendo em breve. */
export const needsReminder = (task: Task): boolean => task.state === 'overdue' || task.state === 'due_soon'

/** "08:00" (UTC). */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

// Só o que depende do astronauta vira tarefa; sono, exercício, SpO₂, FC, temperatura e
// radiação vêm de sensores e não entram na lista de hoje.
export const MANUAL_PANELS: readonly PanelId[] = ['blood_pressure', 'glucose', 'mood', 'reaction_time', 'amsler']

const MANUAL_TITLES: Partial<Record<PanelId, string>> = {
  blood_pressure: 'Pressão arterial',
  glucose: 'Glicemia',
  mood: 'Humor e estresse',
  reaction_time: 'Teste de reação',
  amsler: 'Grade de Amsler',
}

export const isManualTask = (def: TaskDef): boolean => MANUAL_PANELS.includes(def.panelId)

/** Tarefas manuais de hoje; um indicador que nunca foi medido ainda vira tarefa (pendente). */
export function manualTasksForDay(panels: Panel[], nowMs: number): Task[] {
  const placeholders: Panel[] = MANUAL_PANELS.filter((id) => !panels.some((p) => p.id === id)).map((id) => ({
    id,
    title: MANUAL_TITLES[id] ?? id,
    shortTitle: MANUAL_TITLES[id] ?? id,
    value: '',
    unit: '',
    classification: { status: 'green', reason: '' },
    history: [],
    spark: [],
    charts: [],
    infos: [],
  }))
  return tasksForDay([...panels, ...placeholders], nowMs)
    .filter((t) => isManualTask(t.def))
    .map((t) => ({ ...t, title: MANUAL_TITLES[t.def.panelId] ?? t.title }))
}
