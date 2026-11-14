import { IndicatorCard } from '../components/IndicatorCard'
import { STATUS_META, StatusIcon } from '../components/StatusBadge'
import type { Panel } from '../lib/dashboard'
import { detailHref, recordHref } from '../lib/route'
import type { Astronaut, Status } from '../types'

const STATUS_ORDER: Status[] = ['red', 'yellow', 'green']

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  /** Ex.: "Dia 30". */
  currentDay?: string
}

export function Dashboard({ astronaut, panels, currentDay }: Props) {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: panels.filter((p) => p.classification.status === status).length,
  }))
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <p className="text-ink-dim">
          Situação atual de {astronaut.name}
          {currentDay && ` — ${currentDay} de missão`}
        </p>
        <ul aria-label="Resumo dos status" className="flex flex-wrap gap-x-4 gap-y-1">
          {counts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-1.5">
              <StatusIcon status={status} />
              <span>
                <span className="font-mono font-semibold tabular-nums">{count}</span>{' '}
                <span className="text-ink-dim">{STATUS_META[status].label.toLowerCase()}</span>
              </span>
            </li>
          ))}
        </ul>
        <a
          href={recordHref(astronaut.id)}
          className="ml-auto rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-semibold text-void transition-colors hover:bg-accent/85"
        >
          + Registrar medição
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {panels.map((panel) => (
          <IndicatorCard key={panel.id} panel={panel} href={detailHref(astronaut.id, panel.id)} />
        ))}
      </div>
    </>
  )
}
