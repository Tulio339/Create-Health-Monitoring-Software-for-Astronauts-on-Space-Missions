import { AmslerTest } from '../components/AmslerTest'
import { ReactionTest } from '../components/ReactionTest'
import { StatusBadge } from '../components/StatusBadge'
import type { Panel } from '../lib/dashboard'
import { testsHref } from '../lib/route'
import type { TestId } from '../lib/route'
import type { Astronaut, Baseline, IndicatorInfo } from '../types'

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  baselines: Baseline[]
  infos: IndicatorInfo[]
  /** Teste aberto, vindo da rota. */
  testId?: string
}

const TESTS: { id: TestId; panelId: 'reaction_time' | 'amsler'; title: string; summary: string; duration: string }[] = [
  {
    id: 'reacao',
    panelId: 'reaction_time',
    title: 'Tempo de reação',
    summary: 'O painel acende após um tempo aleatório e você toca o mais rápido que puder. Mede atenção e fadiga.',
    duration: '5 rodadas · cerca de 30 segundos',
  },
  {
    id: 'amsler',
    panelId: 'amsler',
    title: 'Grade de Amsler',
    summary: 'Você olha para o ponto central de uma grade, um olho de cada vez, e marca onde as linhas parecem tortas, borradas ou ausentes.',
    duration: '2 etapas · cerca de 2 minutos',
  },
]

export function Tests({ astronaut, panels, baselines, infos, testId }: Props) {
  const test = TESTS.find((t) => t.id === testId)

  if (!test) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Testes</h1>
        <p className="mb-4 text-sm text-ink-dim">
          {astronaut.name} · Testes que rodam aqui mesmo. O resultado é salvo como medição e aparece no dashboard e nos
          alertas.
        </p>
        <ul className="grid gap-4 md:grid-cols-2">
          {TESTS.map((t) => {
            const panel = panels.find((p) => p.id === t.panelId)
            return (
              <li key={t.id}>
                <a
                  href={testsHref(astronaut.id, t.id)}
                  className="group flex h-full flex-col gap-2 rounded-lg border border-line bg-panel p-4 transition-colors hover:border-ink-dim hover:bg-panel-hi sm:p-5"
                >
                  <span className="text-lg font-semibold">{t.title}</span>
                  <span className="text-sm leading-relaxed text-ink-dim">{t.summary}</span>
                  <span className="font-mono text-xs text-ink-dim">{t.duration}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-sm">
                    {panel ? (
                      <>
                        <span className="text-ink-dim">Último resultado:</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {panel.value} {panel.unit}
                        </span>
                        <StatusBadge status={panel.classification.status} />
                      </>
                    ) : (
                      <span className="text-ink-dim">Ainda sem resultado.</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-accent">
                    Fazer o teste <span aria-hidden="true">→</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const panel = panels.find((p) => p.id === test.panelId)
  const amslerInfo = infos.find((i) => i.indicator === 'amsler_marks')
  return (
    <div className="mx-auto max-w-2xl">
      <a
        href={testsHref(astronaut.id)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">←</span> Todos os testes
      </a>
      <h1 className="mt-4 text-2xl font-semibold">{test.title}</h1>
      <p className="mb-4 text-sm text-ink-dim">
        {astronaut.name} · {astronaut.role}
      </p>
      {test.id === 'reacao' &&
        (panel ? (
          <ReactionTest
            key={astronaut.id}
            astronaut={astronaut}
            panel={panel}
            baseline={baselines.find((b) => b.indicator === 'reaction_time')}
          />
        ) : (
          <p className="text-ink-dim">Sem dados de tempo de reação para este astronauta.</p>
        ))}
      {test.id === 'amsler' &&
        (amslerInfo ? (
          <AmslerTest key={astronaut.id} astronaut={astronaut} info={amslerInfo} panel={panel} />
        ) : (
          <p className="text-ink-dim">Textos da grade de Amsler não encontrados.</p>
        ))}
    </div>
  )
}
