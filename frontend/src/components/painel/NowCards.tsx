import { getDirective } from '../../api'
import { LEVEL_META, compareLevels } from '../../lib/levels'
import { caseHref } from '../../lib/route'
import { useLive } from '../../lib/useLive'
import type { Directive, OpenCase } from '../../types'
import { LevelTag } from './LevelTag'

interface Props {
  astronautId: string
  cases: OpenCase[]
  /** Texto da próxima medição, para a linha calma sem casos. */
  nextMeasurement?: string
  tick: number
}

export function NowCards({ astronautId, cases, nextMeasurement, tick }: Props) {
  const top = [...cases].sort((a, b) => compareLevels(a.level, b.level)).slice(0, 3)
  const ids = [...new Set(top.map((c) => c.directives[0]).filter(Boolean))]
  const { data: directives } = useLive<Directive[]>(ids.join(',') || undefined, () => Promise.all(ids.map(getDirective)), tick)

  if (top.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-ink-dim">
        <span aria-hidden="true" style={{ color: LEVEL_META.normal.color }}>
          ●
        </span>
        Tudo dentro do esperado.{nextMeasurement && ` Próxima medição: ${nextMeasurement}.`}
      </p>
    )
  }

  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {top.map((c) => {
        const directive = directives?.find((d) => d.id === c.directives[0])
        const message = directive?.astronaut_message?.[c.level] ?? c.summary
        const firstAction = directive?.actions?.[c.level]?.[0]
        return (
          <li key={c.case_id}>
            <a
              href={caseHref(astronautId, c.case_id)}
              className="flex h-full flex-col gap-2 rounded-lg border bg-panel p-4 transition-colors hover:bg-panel-hi"
              style={{ borderColor: LEVEL_META[c.level].color }}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-base font-semibold">{directive?.title ?? c.directives[0]}</span>
                <LevelTag level={c.level} className="shrink-0 text-sm" />
              </span>
              <span className="text-sm text-ink">{message}</span>
              {firstAction && (
                <span className="text-sm text-ink-dim">
                  <span className="font-semibold text-ink">Faça agora:</span> {firstAction}
                </span>
              )}
              <span className="mt-auto pt-2 text-xs text-accent">
                Linha do tempo do caso <span aria-hidden="true">→</span>
              </span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}
