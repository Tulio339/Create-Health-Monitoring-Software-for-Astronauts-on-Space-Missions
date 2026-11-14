import type { ReactNode } from 'react'
import { IndicatorChart } from '../components/IndicatorChart'
import { STATUS_BORDER, STATUS_META, StatusBadge, StatusIcon } from '../components/StatusBadge'
import type { Panel } from '../lib/dashboard'
import { dashboardHref, recordHref, testsHref } from '../lib/route'
import type { Astronaut, Status } from '../types'

interface Props {
  astronaut: Astronaut
  panel: Panel
  /** Ex.: "Dia 30". */
  currentDay?: string
}

export function BackLink({ astronautId }: { astronautId: string }) {
  return (
    <a
      href={dashboardHref(astronautId)}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
    >
      <span aria-hidden="true">←</span> Voltar ao dashboard
    </a>
  )
}

// Posição do card quando a página vira uma coluna só (classes literais para o Tailwind enxergar).
const NARROW_ORDER = { 1: 'order-1', 2: 'order-2', 3: 'order-3', 4: 'order-4' } as const

function Section({ title, order, children }: { title: string; order: 1 | 2 | 3 | 4; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-panel p-4 sm:p-5 lg:order-none ${NARROW_ORDER[order]}`}>
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function ActionList({
  status,
  current,
  actions,
}: {
  status: Exclude<Status, 'green'>
  current: Status
  actions: string[]
}) {
  const isCurrent = status === current
  return (
    <div className={`rounded-md border border-l-4 border-line p-3 ${STATUS_BORDER[status]} ${isCurrent ? 'bg-panel-hi' : ''}`}>
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
        <StatusIcon status={status} />
        {status === 'yellow' ? 'Se estiver em amarelo (atenção)' : 'Se estiver em vermelho (médico de voo)'}
        {isCurrent && (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-dim">
            situação atual
          </span>
        )}
      </h3>
      <p className="mt-1 text-ink-dim">{STATUS_META[status].action}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </div>
  )
}

export function IndicatorDetail({ astronaut, panel, currentDay }: Props) {
  const { status, reason } = panel.classification
  const info = panel.infos[0]
  // Indicadores medidos por um teste do próprio app.
  const testId = panel.id === 'amsler' ? 'amsler' : panel.id === 'reaction_time' ? 'reacao' : undefined
  return (
    <article aria-labelledby="detail-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink astronautId={astronaut.id} />
        <a
          href={testId ? testsHref(astronaut.id, testId) : recordHref(astronaut.id, panel.id)}
          className="rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-semibold text-void transition-colors hover:bg-accent/85"
        >
          {testId ? 'Fazer o teste' : '+ Registrar medição'}
        </a>
      </div>

      <header className={`mt-4 rounded-lg border border-l-4 border-line bg-panel p-4 sm:p-5 ${STATUS_BORDER[status]}`}>
        <p className="text-sm text-ink-dim">
          {astronaut.name} · {astronaut.role}
          {currentDay && ` · ${currentDay} de missão`}
        </p>
        <h1 id="detail-title" className="text-2xl font-semibold">
          {panel.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-semibold tabular-nums">{panel.value}</span>
            <span className="text-sm text-ink-dim">{panel.unit}</span>
          </p>
          <div className="min-w-0 flex-1 basis-64">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-ink-dim">Status atual</span>
              <StatusBadge status={status} />
            </p>
            <p className="mt-1 font-medium first-letter:uppercase">{reason}.</p>
            <p className="text-sm text-ink-dim">{info.explanations[status]}</p>
          </div>
        </div>
      </header>

      {status === 'red' && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg border-2 border-status-red bg-status-red/10 p-4 sm:p-5"
        >
          <StatusIcon status="red" className="mt-0.5 h-7 w-7" />
          <div>
            <p className="text-lg font-semibold">Encaminhar ao médico de voo</p>
            <p className="text-sm leading-relaxed">
              Este valor está fora da faixa segura. Não espere a próxima medição: comunique o médico de voo agora e
              siga as ações em vermelho em “O que fazer”.
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="chart-title" className="mt-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h2 id="chart-title" className="font-mono text-xs uppercase tracking-wider text-accent">
          Histórico
        </h2>
        <p className="mb-4 text-sm text-ink-dim">
          Dias de missão, com os 14 dias de pré-voo que formam a linha de base.
        </p>
        <div className="grid gap-6 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
          {panel.charts.map((chart) => (
            <div key={chart.info.indicator} className="min-w-0">
              {chart.heading && (
                <h3 className="mb-1 text-sm font-medium text-ink-dim">
                  {chart.heading} ({chart.info.unit})
                </h3>
              )}
              <IndicatorChart
                info={chart.info}
                series={chart.series}
                baseline={chart.baseline}
                missionStart={astronaut.mission_start}
              />
            </div>
          ))}
        </div>
        {panel.id === 'radiation' && (
          <p className="mt-3 text-xs text-ink-dim">
            Radiação não usa linha de base pessoal: o status vem da dose acumulada em relação ao limite de carreira.
          </p>
        )}
        {panel.id === 'amsler' && (
          <p className="mt-3 text-xs text-ink-dim">
            A grade de Amsler não usa linha de base pessoal: qualquer área marcada já muda o status.
          </p>
        )}
      </section>

      {/* Duas colunas independentes: cada uma empilha seus cards, sem igualar alturas.
          Em tela estreita as colunas somem (display: contents) e `order` define a sequência. */}
      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <Section order={1} title="O que é">
            {panel.infos.map((i) => (
              <p key={i.indicator}>{i.what}</p>
            ))}
          </Section>

          <Section order={3} title="Como medir">
            <ol className="list-decimal space-y-1 pl-5 marker:font-mono marker:text-ink-dim">
              {info.how_to_measure.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Section>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <Section order={2} title="Por que importa no espaço">
            <p>{info.why_in_space}</p>
            <dl className="space-y-2 pt-1">
              {info.hazards.map((hazard) => (
                <div key={hazard.id} className="rounded-md border border-line bg-void/40 p-3">
                  <dt className="font-semibold">
                    <span className="font-normal text-ink-dim">Perigo: </span>
                    {hazard.name}
                  </dt>
                  <dd className="text-ink-dim">{hazard.relation}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section order={4} title="O que fazer">
            {status === 'green' && (
              <p className="flex items-start gap-2">
                <StatusIcon status="green" className="mt-0.5 h-4 w-4" />
                <span>Agora está tudo certo: siga a rotina e continue medindo. Se o status mudar, as ações são estas:</span>
              </p>
            )}
            <ActionList status="yellow" current={status} actions={info.actions.yellow} />
            <ActionList status="red" current={status} actions={info.actions.red} />
          </Section>
        </div>
      </div>

      <div className="mt-6">
        <BackLink astronautId={astronaut.id} />
      </div>
    </article>
  )
}
