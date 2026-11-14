import type { ReactNode } from 'react'
import { getDirective } from '../api'
import { DetailChart } from '../components/painel/DetailChart'
import type { ChartPoint } from '../components/painel/DetailChart'
import { LevelTag } from '../components/painel/LevelTag'
import { DECIMALS, cellValue, fmt } from '../lib/cell'
import type { Panel, PanelId } from '../lib/dashboard'
import { DOT_PANELS, formatAgo, isActionLevel } from '../lib/levels'
import { originOf } from '../lib/origin'
import { dashboardHref, recordHref, testsHref } from '../lib/route'
import { MANUAL_PANELS } from '../lib/tasks'
import { useLive } from '../lib/useLive'
import type { Astronaut, DirectiveThreshold, IndicatorInfo, IndicatorThresholds, Level, TelemetryPoint } from '../types'

const DAY_MS = 86_400_000

export function BackLink({ astronautId }: { astronautId: string }) {
  return (
    <a href={dashboardHref(astronautId)} className="text-sm text-ink-dim hover:text-accent">
      <span aria-hidden="true">←</span> Painel
    </a>
  )
}

interface Props {
  astronaut: Astronaut
  panelId: PanelId
  panel?: Panel
  infos: IndicatorInfo[]
  level: Level
  reason?: string
  directiveId?: string
  thresholds?: IndicatorThresholds
  /** Dose de carreira já acumulada (só para radiação). */
  radiationCareer?: TelemetryPoint[]
  nowMs: number
  tick: number
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  )
}

/** Remove limiares repetidos (mesmo nível e valor vindos de gatilhos diferentes). */
function uniqueThresholds(list: DirectiveThreshold[] = []): DirectiveThreshold[] {
  const seen = new Map<string, DirectiveThreshold>()
  for (const th of list) seen.set(`${th.level}|${th.op}|${th.value}`, th)
  return [...seen.values()]
}

const last30 = (points: ChartPoint[]): ChartPoint[] => {
  const end = points.at(-1)?.t ?? 0
  return points.filter((p) => p.t > end - 30 * DAY_MS)
}

export function IndicatorDetail(props: Props) {
  const { astronaut, panelId, panel, infos, level, reason, directiveId, thresholds, radiationCareer, nowMs, tick } = props
  const { data: directive } = useLive(directiveId, () => getDirective(directiveId!), tick)
  const infoKeys = panelId === 'blood_pressure' ? ['bp_systolic', 'bp_diastolic'] : panelId === 'amsler' ? ['amsler_marks', 'amsler_central'] : [panelId]
  const panelInfos = infos.filter((i) => infoKeys.includes(i.indicator))
  const info = panelInfos[0]
  const title = panel?.title ?? info?.name ?? panelId
  const last = panel?.history.at(-1)
  const testId = panelId === 'amsler' ? 'amsler' : panelId === 'reaction_time' ? 'reacao' : undefined
  const manual = MANUAL_PANELS.includes(panelId)
  const decimals = DECIMALS[panelId]

  const charts =
    panelId === 'radiation'
      ? [
          {
            key: 'radiation',
            heading: 'Dose de carreira',
            unit: 'mSv',
            points: last30((radiationCareer ?? []).map((p) => ({ t: Date.parse(p.timestamp), v: p.valor, origin: 'sensor' as const }))),
            baseline: undefined,
            thresholds: uniqueThresholds(thresholds?.radiation),
          },
        ]
      : (panel?.charts ?? []).map((c) => ({
          key: c.info.indicator,
          heading: panel && panel.charts.length > 1 ? c.heading : undefined,
          unit: c.info.unit === '1-5' ? 'de 5' : c.info.unit,
          points: last30(c.series.map((m) => ({ t: Date.parse(m.timestamp), v: m.value, origin: originOf(m.source) }))),
          baseline: c.baseline,
          thresholds: uniqueThresholds(thresholds?.[c.info.indicator]),
        }))

  const knowledgeActions = info && isActionLevel(level) ? info.actions[level === 'atencao' ? 'yellow' : 'red'] : undefined
  const directiveActions = isActionLevel(level) ? directive?.actions?.[level] : undefined
  const careerNow = radiationCareer?.at(-1)?.valor

  return (
    <article aria-labelledby="detail-title" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink astronautId={astronaut.id} />
        {manual && (
          <a
            href={testId ? testsHref(astronaut.id, testId) : recordHref(astronaut.id, panelId)}
            className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-panel-hi"
          >
            {testId ? 'Fazer o teste' : 'Registrar medição'}
          </a>
        )}
      </div>

      <header className="space-y-2">
        <h1 id="detail-title" className="text-base font-semibold">
          {title}
        </h1>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-[28px] leading-none font-semibold">
            {panelId === 'radiation' ? (careerNow === undefined ? '—' : fmt(careerNow, decimals)) : panel ? cellValue(panel) : '—'}
          </span>
          <span className="text-xs text-ink-dim">{panelId === 'radiation' ? 'mSv de carreira' : panel?.unit}</span>
          <LevelTag level={level} className="text-sm" />
        </p>
        <p className="text-xs text-ink-faint">
          {last ? `${originOf(last.source)} · ${formatAgo(last.timestamp, nowMs)}` : 'nenhuma leitura registrada'}
          {reason && ` · ${reason}`}
          {directive && ` · ${directive.id}`}
        </p>
      </header>

      <section aria-label="Últimos 30 dias" className="space-y-6 rounded-lg border border-line bg-panel p-4">
        {charts.map((c) => (
          <div key={c.key}>
            {c.heading && <h2 className="mb-2 text-sm text-ink-dim">{c.heading}</h2>}
            <DetailChart
              points={c.points}
              unit={c.unit}
              decimals={decimals}
              baseline={c.baseline}
              thresholds={c.thresholds}
              dots={DOT_PANELS.includes(panelId)}
              label={`${title}, últimos 30 dias, ${c.points.length} leituras`}
            />
          </div>
        ))}
        {charts.length === 0 && <p className="text-sm text-ink-faint">Sem leituras para mostrar.</p>}
        <p className="text-xs text-ink-faint">
          Faixa clara: linha de base pré-voo (média ± 1 desvio; o desvio é aproximado pelo backend). Tracejados: limiares
          das diretivas.
        </p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-8">
          {info && (
            <Block title="O que é">
              {panelInfos.map((i) => (
                <p key={i.indicator}>{i.what}</p>
              ))}
            </Block>
          )}
          {info && (
            <Block title="Por que o espaço afeta">
              <p>{info.why_in_space}</p>
            </Block>
          )}
        </div>
        <div className="space-y-8">
          <Block title="O que fazer agora">
            {!isActionLevel(level) && (
              <p>{level === 'sem-dado' ? 'Sem leitura recente: faça uma nova medição.' : 'Nada a fazer: siga a rotina.'}</p>
            )}
            {directiveActions && (
              <ul className="list-disc space-y-1 pl-5 text-ink">
                {directiveActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {knowledgeActions && (
              <ul className="list-disc space-y-1 pl-5">
                {knowledgeActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </Block>
          {info && (
            <Block title="Como medir">
              <ol className="list-decimal space-y-1 pl-5">
                {info.how_to_measure.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Block>
          )}
        </div>
      </div>
    </article>
  )
}
