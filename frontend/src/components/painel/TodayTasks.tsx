import { recordHref, testsHref } from '../../lib/route'
import type { Task } from '../../lib/tasks'
import { hourLabel } from '../../lib/tasks'

const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

function taskHref(astronautId: string, task: Task): string {
  if (task.def.via === 'reacao') return testsHref(astronautId, 'reacao')
  if (task.def.via === 'amsler') return testsHref(astronautId, 'amsler')
  return recordHref(astronautId, task.def.panelId)
}

function stateLabel(task: Task): string {
  if (task.state === 'done') return `feito às ${time(task.doneAt!)}`
  if (task.state === 'overdue') return `atrasada (até ${hourLabel(task.def.dueHour)})`
  return `até ${hourLabel(task.def.dueHour)}`
}

export function TodayTasks({ astronautId, tasks }: { astronautId: string; tasks: Task[] }) {
  return (
    <section aria-labelledby="tasks-title" className="rounded-lg border border-line bg-panel p-4">
      <h2 id="tasks-title" className="mb-3 text-base font-semibold">
        Tarefas de hoje
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-faint">Nenhuma medição manual pendente.</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((task) => {
            const done = task.state === 'done'
            return (
              <li key={task.def.panelId}>
                <a href={taskHref(astronautId, task)} className="flex items-center gap-3 py-2 text-sm hover:text-accent">
                  <span aria-hidden="true" className={done ? 'text-ink-faint' : 'text-ink-dim'}>
                    {done ? '✓' : '○'}
                  </span>
                  <span className={`min-w-0 flex-1 ${done ? 'text-ink-faint' : 'text-ink'}`}>
                    {task.title}
                    <span className="block text-xs text-ink-faint">{task.def.when}</span>
                  </span>
                  <span
                    className={`tnum shrink-0 text-xs ${task.state === 'overdue' ? 'font-semibold' : 'text-ink-faint'}`}
                    style={task.state === 'overdue' ? { color: 'var(--color-level-atencao)' } : undefined}
                  >
                    {stateLabel(task)}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
