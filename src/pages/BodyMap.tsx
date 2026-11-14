import { useEffect, useRef } from 'react'
import { BodyFigure, regionLabel } from '../components/BodyFigure'
import type { FigureRegion } from '../components/BodyFigure'
import { STATUS_BORDER, STATUS_META, StatusBadge, StatusIcon } from '../components/StatusBadge'
import { worstStatus } from '../lib/classify'
import type { Panel } from '../lib/dashboard'
import { bodyHref, detailHref } from '../lib/route'
import type { Astronaut, BodyRegion, BodyRegionId } from '../types'

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  regions: BodyRegion[]
  /** Região aberta, vinda da rota. */
  regionId?: string
}

export function BodyMap({ astronaut, panels, regions, regionId }: Props) {
  const panelsOf = (region: BodyRegion) =>
    region.indicators.flatMap((id) => panels.filter((p) => p.id === id))
  const figureRegions: (FigureRegion & { region: BodyRegion; panels: Panel[] })[] = regions.map((region) => {
    const linked = panelsOf(region)
    return {
      id: region.id,
      name: region.name,
      status: linked.length > 0 ? worstStatus(...linked.map((p) => p.classification.status)) : undefined,
      region,
      panels: linked,
    }
  })
  const selected = figureRegions.find((r) => r.id === regionId)
  const select = (id: BodyRegionId) => {
    window.location.hash = bodyHref(astronaut.id, id)
  }

  // Ao abrir uma região, leva o foco (e a rolagem, em tela estreita) para o painel.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!selected) return
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected?.id])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Mapa do corpo</h1>
      <p className="mb-4 text-sm text-ink-dim">
        {astronaut.name} · Escolha uma região para ver a função do órgão e os indicadores ligados a ele. Regiões com
        alerta pulsam.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-lg border border-line bg-panel p-4">
          <BodyFigure regions={figureRegions} selectedId={selected?.id} onSelect={select} />
        </div>

        <div className="min-w-0 space-y-4">
          <nav aria-label="Regiões do corpo">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {figureRegions.map((r) => (
                <li key={r.id}>
                  <a
                    href={bodyHref(astronaut.id, r.id)}
                    aria-current={r.id === selected?.id ? 'true' : undefined}
                    className={`flex h-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      r.id === selected?.id
                        ? 'border-accent bg-panel-hi text-ink'
                        : 'border-line bg-panel text-ink hover:border-ink-dim'
                    }`}
                  >
                    {r.status ? (
                      <StatusIcon status={r.status} />
                    ) : (
                      <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-ink-dim">
                        –
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-xs text-ink-dim">
                        {r.status ? STATUS_META[r.status].label : 'Sem medição'}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {!selected && (
            <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-dim">
              Nenhuma região aberta. Clique em uma parte do corpo ou em um nome da lista acima. Com o teclado, use Tab
              para chegar à região e Enter para abrir.
            </p>
          )}

          {selected && (
            <aside
              aria-labelledby="region-title"
              className={`rounded-lg border border-l-4 border-line bg-panel p-4 sm:p-5 ${
                selected.status ? STATUS_BORDER[selected.status] : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="region-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
                    {selected.name}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-dim">
                    {selected.status ? (
                      <>
                        Pior status da região: <StatusBadge status={selected.status} />
                      </>
                    ) : (
                      'Sem indicador medido nesta região.'
                    )}
                  </p>
                </div>
                <a
                  href={bodyHref(astronaut.id)}
                  className="rounded-md border border-line bg-void/40 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink-dim"
                >
                  Fechar <span aria-hidden="true">✕</span>
                </a>
              </div>

              <div className="mt-4 space-y-3 text-sm leading-relaxed">
                <div>
                  <h3 className="mb-1 font-mono text-xs uppercase tracking-wider text-accent">Função</h3>
                  <p>{selected.region.function}</p>
                </div>
                <div>
                  <h3 className="mb-1 font-mono text-xs uppercase tracking-wider text-accent">No espaço</h3>
                  <p>{selected.region.in_space}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">Indicadores ligados</h3>
                  <ul className="space-y-2">
                    {selected.panels.map((panel) => (
                      <li key={panel.id}>
                        <a
                          href={detailHref(astronaut.id, panel.id)}
                          className={`group block rounded-md border border-l-4 border-line bg-void/40 p-3 transition-colors hover:border-ink-dim hover:bg-panel-hi ${
                            STATUS_BORDER[panel.classification.status]
                          }`}
                        >
                          <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <span className="font-semibold">{panel.title}</span>
                            <StatusBadge status={panel.classification.status} />
                          </span>
                          <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                            <span className="font-mono text-lg font-semibold tabular-nums">{panel.value}</span>
                            <span className="text-xs text-ink-dim">{panel.unit}</span>
                          </span>
                          <span className="block text-ink-dim first-letter:uppercase">{panel.classification.reason}.</span>
                          <span className="mt-1 block text-xs text-ink-dim group-hover:text-accent">
                            Ver detalhe do indicador <span aria-hidden="true">→</span>
                          </span>
                        </a>
                      </li>
                    ))}
                    {selected.region.untracked.map((item) => (
                      <li key={item.name} className="rounded-md border border-dashed border-line p-3">
                        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="font-semibold">{item.name}</span>
                          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink-dim">
                            Sem medição
                          </span>
                        </span>
                        <span className="mt-1 block text-ink-dim">{item.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          )}

          <p className="sr-only" aria-live="polite">
            {selected ? `Região aberta: ${regionLabel(selected)}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
