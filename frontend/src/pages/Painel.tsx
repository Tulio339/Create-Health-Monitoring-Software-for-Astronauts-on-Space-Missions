import { IndicatorCell } from '../components/painel/IndicatorCell'
import { LevelTag } from '../components/painel/LevelTag'
import { NowCards } from '../components/painel/NowCards'
import { RadiationBar } from '../components/painel/RadiationBar'
import { TodayTasks } from '../components/painel/TodayTasks'
import { PANEL_IDS } from '../lib/dashboard'
import type { Panel, PanelId } from '../lib/dashboard'
import { isStale, levelFromBackend, panelLevel } from '../lib/levels'
import { localRadiationLevel } from '../lib/radiation'
import { detailHref } from '../lib/route'
import { hourLabel, manualTasksForDay } from '../lib/tasks'
import type { Astronaut, BodyRegion, IndicatorInfo, IndicatorLevels, MissionStatus } from '../types'

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  regions: BodyRegion[]
  infos: IndicatorInfo[]
  status?: MissionStatus
  /** Ausente = backend sem a rota de níveis: usa a reserva local (classify.ts). */
  levels?: IndicatorLevels
  radiation: { careerMsv?: number; rateMsvH?: number }
  /** Relógio da missão: horário da leitura mais recente do astronauta. */
  nowMs: number
  tick: number
}

// Classes literais por quantidade de células, para o Tailwind enxergar.
const SPAN: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'sm:col-span-2 lg:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
}
const INNER: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

function shortName(id: PanelId, infos: IndicatorInfo[]): string {
  if (id === 'blood_pressure') return 'Pressão arterial'
  const key = id === 'amsler' ? 'amsler_marks' : id
  return infos.find((i) => i.indicator === key)?.short_name ?? id
}

export function Painel({ astronaut, panels, regions, infos, status, levels, radiation, nowMs, tick }: Props) {
  const tasks = manualTasksForDay(panels, nowMs)
  const next = tasks.find((t) => t.state !== 'done')
  const nextMeasurement = next ? `${next.title.toLowerCase()} até ${hourLabel(next.def.dueHour)}` : 'amanhã'

  // Radiação tem barra própria (D); o resto entra na grade pela região do corpo.
  const inRegions = new Set(regions.flatMap((r) => r.indicators))
  const others = PANEL_IDS.filter((id) => id !== 'radiation' && !inRegions.has(id))
  const groups = [
    ...regions.map((r) => ({ id: r.id, name: r.name, ids: r.indicators.filter((i) => i !== 'radiation') as PanelId[] })),
    ...(others.length ? [{ id: 'outros', name: 'Metabolismo', ids: others }] : []),
  ].filter((g) => g.ids.length > 0)

  const radiationStale = isStale('radiation', panels.find((p) => p.id === 'radiation')?.history.at(-1)?.timestamp, nowMs)
  const radiationLevel =
    radiation.careerMsv === undefined || radiationStale
      ? 'sem-dado'
      : levels
        ? levelFromBackend(levels.radiation?.level)
        : localRadiationLevel(radiation.careerMsv)

  return (
    <div className="space-y-8">
      <section aria-labelledby="now-title">
        <h2 id="now-title" className="mb-3 text-base font-semibold">
          Agora
        </h2>
        {status ? (
          <NowCards astronautId={astronaut.id} cases={status.casos_abertos} nextMeasurement={nextMeasurement} tick={tick} />
        ) : (
          <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-ink-faint">
            Casos indisponíveis: sem conexão com o motor de regras.
          </p>
        )}
      </section>

      <section aria-labelledby="grid-title">
        <h2 id="grid-title" className="mb-3 text-base font-semibold">
          Indicadores
        </h2>
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => {
            const n = Math.min(4, g.ids.length)
            return (
              <div key={g.id} className={`min-w-0 ${SPAN[n]}`}>
                <h3 className="mb-2 text-xs text-ink-faint">{g.name}</h3>
                <div className={`grid gap-4 ${INNER[n]}`}>
                  {g.ids.map((id) => {
                    const panel = panels.find((p) => p.id === id)
                    if (!panel) {
                      return (
                        <a
                          key={id}
                          href={detailHref(astronaut.id, id)}
                          className="flex min-h-24 flex-col justify-between gap-4 rounded-lg sm:min-h-40 border border-line bg-panel p-4 hover:bg-panel-hi"
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm text-ink-dim">{shortName(id, infos)}</span>
                            <LevelTag level="sem-dado" />
                          </span>
                          <span className="text-sm text-ink-faint">Nenhuma leitura registrada.</span>
                        </a>
                      )
                    }
                    return (
                      <IndicatorCell
                        key={id}
                        panel={panel}
                        level={panelLevel(panel, levels, nowMs).level}
                        nowMs={nowMs}
                        href={detailHref(astronaut.id, id)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RadiationBar
          careerMsv={radiation.careerMsv}
          rateMsvH={radiation.rateMsvH}
          level={radiationLevel}
          href={detailHref(astronaut.id, 'radiation')}
        />
        <TodayTasks astronautId={astronaut.id} tasks={tasks} />
      </div>
    </div>
  )
}
