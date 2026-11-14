import { levelFromBackend, worstLevel } from '../../lib/levels'
import type { Astronaut, Environment, MissionStatus, OperatingMode } from '../../types'
import { LevelTag } from './LevelTag'

interface Props {
  astronauts: Astronaut[]
  current: Astronaut
  hrefFor: (astronautId: string) => string
  status?: MissionStatus
  environment?: Environment
  offline: boolean
}

const MODE_LABEL: Record<OperatingMode, string> = { assistido: 'Assistido', hibrido: 'Híbrido', autonomo: 'Autônomo' }

const PHASE_LABEL: Record<string, string> = {
  transito: 'trânsito',
  transito_profundo: 'trânsito profundo',
  superficie: 'superfície',
}

/** Latência de uma via: "95 s", "20 min"; sem enlace quando não há dado. */
export function latencyLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'sem enlace'
  return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`
}

const Sep = () => (
  <span aria-hidden="true" className="text-line">
    |
  </span>
)

export function MissionBar({ astronauts, current, hrefFor, status, environment, offline }: Props) {
  const overall = worstLevel((status?.casos_abertos ?? []).map((c) => levelFromBackend(c.level)))
  const mode = status?.operating_mode
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-void">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="sr-only">Astronauta</span>
          <select
            value={current.id}
            onChange={(e) => (window.location.hash = hrefFor(e.target.value))}
            className="max-w-[60vw] rounded-md border border-line bg-panel px-2 py-1 text-ink"
          >
            {astronauts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.id}
              </option>
            ))}
          </select>
        </label>
        {status && (
          <>
            <span className="text-ink-dim">
              {status.mission_name} · <span className="tnum text-ink">Dia {status.mission_day ?? '—'}</span> ·{' '}
              {PHASE_LABEL[status.mission_phase] ?? status.mission_phase}
            </span>
            <Sep />
          </>
        )}
        {environment && (
          <>
            <span className="text-ink-dim">{environment.short_name}</span>
            <Sep />
          </>
        )}
        {status && (
          <span className="tnum text-ink-dim">
            Terra: <span className="text-ink">{latencyLabel(status.comm_latency_s)}</span>
          </span>
        )}
        {mode && (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              mode === 'autonomo' ? 'border-accent font-semibold text-accent' : 'border-line text-ink-dim'
            }`}
            title="Modo de operação pela latência de comunicação"
          >
            {MODE_LABEL[mode]}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {offline && <span className="text-xs text-ink-faint">modo offline: classificação local</span>}
          {status && (
            <span className="flex items-center gap-2">
              <span className="text-ink-dim">Status</span>
              <LevelTag level={overall} className="text-sm" />
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
