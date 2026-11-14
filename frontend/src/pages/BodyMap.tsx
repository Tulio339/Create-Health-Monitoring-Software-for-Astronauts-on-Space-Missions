import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { setEnvironmentId } from '../api'
import { BodyFigure, isVisible, LAYERS, regionLabel } from '../components/BodyFigure'
import type { BodyLayer, BodySide, FigureRegion } from '../components/BodyFigure'
import { lastDays, MiniTrend } from '../components/MiniTrend'
import { STATUS_BORDER, STATUS_META, StatusBadge, StatusIcon } from '../components/StatusBadge'
import { worstStatus } from '../lib/classify'
import type { Panel } from '../lib/dashboard'
import { bodyHref, detailHref } from '../lib/route'
import type { Astronaut, BodyRegion, BodyRegionId, Environment, EnvironmentId, Hazard, Status } from '../types'

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  regions: BodyRegion[]
  /** Região aberta, vinda da rota. */
  regionId?: string
  environments: Environment[]
  environmentId: EnvironmentId
}

type MapRegion = FigureRegion & { region: BodyRegion; panels: Panel[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Painel ao lado em tela larga; gaveta embaixo no celular. */
function useWideScreen(): boolean {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** O que o ambiente escolhido diz sobre cada perigo da NASA (quando há um dado para mostrar). */
function environmentFact(hazard: Hazard, env: Environment): string | undefined {
  if (hazard.id === 'gravity') return `${env.short_name}: gravidade de ${env.gravity_label}.`
  if (hazard.id === 'radiation') {
    const dose = env.radiation_msv_day.toLocaleString('pt-BR', { minimumFractionDigits: 1 })
    return `${env.short_name}: cerca de ${dose} mSv por dia. ${env.radiation_note}`
  }
  if (hazard.id === 'distance') return `${env.short_name}: comunicação com a Terra ${env.comm_delay_label}.`
  return undefined
}

/** Perigos da NASA ligados à região: a união dos perigos dos seus indicadores. */
function regionHazards(panels: Panel[]): (Hazard & { via: string })[] {
  const seen = new Map<string, Hazard & { via: string }>()
  for (const panel of panels) {
    for (const info of panel.infos) {
      for (const hazard of info.hazards ?? []) {
        if (!seen.has(hazard.id)) seen.set(hazard.id, { ...hazard, via: panel.shortTitle })
      }
    }
  }
  return [...seen.values()]
}

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-1.5 font-mono text-xs uppercase tracking-wider text-accent">{children}</h3>
)

export function BodyMap({ astronaut, panels, regions, regionId, environments, environmentId }: Props) {
  const [layer, setLayer] = useState<BodyLayer>('overview')
  const [side, setSide] = useState<BodySide>('front')
  const wide = useWideScreen()
  const environment = environments.find((e) => e.id === environmentId) ?? environments[0]

  const mapRegions: MapRegion[] = regions.map((region) => {
    const linked = region.indicators.flatMap((id) => panels.filter((p) => p.id === id))
    const status = linked.length > 0 ? worstStatus(...linked.map((p) => p.classification.status)) : undefined
    const worst = linked.find((p) => p.classification.status === status)
    return {
      id: region.id,
      name: region.name,
      status,
      summary: worst
        ? `${plural(linked.length, 'indicador', 'indicadores')} · ${worst.shortTitle}: ${worst.value} ${worst.unit}`
        : 'Sem indicador medido',
      region,
      panels: linked,
    }
  })
  const selected = mapRegions.find((r) => r.id === regionId)
  const count = (status: Status) => mapRegions.filter((r) => r.status === status).length
  const attention = count('yellow')
  const alert = count('red')
  const heartRate = panels.find((p) => p.id === 'heart_rate')?.history.at(-1)?.value

  const select = (id: BodyRegionId) => {
    window.location.hash = bodyHref(astronaut.id, id)
  }
  const close = () => {
    window.location.hash = bodyHref(astronaut.id)
  }

  // Região aberta pela lista ou pelo link, mas fora da camada/vista atual: mostra-a na figura.
  useEffect(() => {
    if (!selected) return
    if (!LAYERS.find((l) => l.id === layer)!.regions.includes(selected.id)) setLayer('overview')
    if (selected.id === 'eyes') setSide('front')
  }, [selected?.id])

  // Esc fecha o painel.
  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected?.id, astronaut.id])

  // Ao abrir, o foco vai para o painel; ao fechar, volta para a região na figura.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastOpen = useRef<string>(undefined)
  useEffect(() => {
    if (selected) {
      lastOpen.current = selected.id
      headingRef.current?.focus({ preventScroll: true })
      if (wide) headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (lastOpen.current) {
      document.querySelector<SVGGElement>(`[data-region="${lastOpen.current}"]`)?.focus()
      lastOpen.current = undefined
    }
  }, [selected?.id])

  const toggle = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'border-accent bg-panel-hi text-ink' : 'border-line bg-panel text-ink-dim hover:border-ink-dim hover:text-ink'
    }`

  const hazards = selected ? regionHazards(selected.panels) : []

  const panel = selected && (
    <motion.aside
      key={selected.id}
      aria-labelledby="region-title"
      initial={{ opacity: 0, y: wide ? 8 : 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={
        wide
          ? `rounded-lg border border-l-4 border-line bg-panel p-5 ${selected.status ? STATUS_BORDER[selected.status] : ''}`
          : 'fixed inset-x-0 bottom-0 z-40 max-h-[58vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-panel p-4 pb-6 shadow-[0_-12px_32px_rgb(0_0_0/0.6)]'
      }
    >
      {!wide && <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="region-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold" style={{ outline: 'none' }}>
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
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-md border border-line bg-void/40 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink-dim"
        >
          Fechar <span aria-hidden="true">✕</span>
          <span className="ml-1 hidden text-ink-dim lg:inline">(Esc)</span>
        </button>
      </div>

      <div className="mt-4 space-y-4 text-sm leading-relaxed">
        <section>
          <SectionTitle>Função</SectionTitle>
          <p>{selected.region.function}</p>
        </section>

        <section>
          <SectionTitle>Como o espaço afeta</SectionTitle>
          <p>{selected.region.in_space}</p>
          {hazards.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-xs text-ink-dim">
                Perigos do voo espacial (NASA) ligados a esta região
                {environment ? `, no ambiente ${environment.short_name}` : ''}:
              </p>
              <ul className="space-y-1.5">
                {hazards.map((hazard) => {
                  const fact = environment && environmentFact(hazard, environment)
                  return (
                    <li key={hazard.id} className="rounded-md border border-line bg-void/40 px-3 py-2">
                      <span className="font-semibold">{hazard.name}</span>
                      <span className="block text-ink-dim">
                        {hazard.relation} <span className="text-xs">({hazard.via})</span>
                      </span>
                      {fact && <span className="mt-1 block text-xs text-ink">{fact}</span>}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section>
          <SectionTitle>Indicadores ligados</SectionTitle>
          <ul className="space-y-2">
            {selected.panels.map((p) => (
              <li
                key={p.id}
                className={`rounded-md border border-l-4 border-line bg-void/40 p-3 ${STATUS_BORDER[p.classification.status]}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold">{p.title}</span>
                  <StatusBadge status={p.classification.status} />
                </div>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-mono text-lg font-semibold tabular-nums">{p.value}</span>
                  <span className="text-xs text-ink-dim">{p.unit}</span>
                </p>
                <p className="text-ink-dim first-letter:uppercase">{p.classification.reason}.</p>
                <div className="mt-2">
                  <MiniTrend readings={lastDays(p.history)} unit={p.unit} title={p.title} />
                </div>
                <a
                  href={detailHref(astronaut.id, p.id)}
                  className="mt-2 inline-block rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Ver detalhe de {p.shortTitle} <span aria-hidden="true">→</span>
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
        </section>
      </div>
    </motion.aside>
  )

  return (
    <div className={selected && !wide ? 'pb-[40vh]' : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold">Mapa do corpo</h1>
          <p className="text-sm text-ink-dim">
            {astronaut.name} · Escolha uma região para ver a função do órgão e os indicadores ligados a ele.
          </p>
        </div>
        {environments.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            Ambiente
            <select
              value={environmentId}
              onChange={(e) => void setEnvironmentId(e.target.value as EnvironmentId)}
              className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink"
            >
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Resumo e legenda: o status é sempre ícone + texto, nunca só cor. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-line bg-panel px-4 py-3">
        <p role="status" className="font-medium">
          {attention === 0 && alert === 0
            ? 'Todas as regiões medidas estão normais.'
            : `${plural(attention, 'região', 'regiões')} em atenção, ${alert} em alerta`}
        </p>
        <ul aria-label="Legenda das cores" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
          <li className="flex items-center gap-1.5">
            <StatusIcon status="green" /> Verde: normal, brilho estável
          </li>
          <li className="flex items-center gap-1.5">
            <StatusIcon status="yellow" /> Amarelo: atenção, halo fixo
          </li>
          <li className="flex items-center gap-1.5">
            <StatusIcon status="red" /> Vermelho: alerta (médico de voo), pulsa
          </li>
        </ul>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start">
        <div className="holo-stage rounded-lg border border-line p-3 sm:p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Camada do corpo">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={l.id === layer}
                onClick={() => setLayer(l.id)}
                className={toggle(l.id === layer)}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSide(side === 'front' ? 'back' : 'front')}
              className={toggle(false)}
            >
              <span aria-hidden="true">⟳ </span>
              Girar: ver de {side === 'front' ? 'costas' : 'frente'}
            </button>
            <p className="font-mono text-xs text-ink-dim">
              Vista: {side === 'front' ? 'frente' : 'costas'}
              {heartRate !== undefined && (
                <>
                  {' '}
                  · <span aria-hidden="true">♥</span> FC {Math.round(heartRate)} bpm
                </>
              )}
            </p>
          </div>

          <BodyFigure
            regions={mapRegions}
            selectedId={selected?.id}
            onSelect={select}
            layer={layer}
            side={side}
            heartRate={heartRate}
            floating={environment ? environment.gravity_g < 0.05 : false}
          />

          {environment && (
            <p className="mt-1 text-center font-mono text-xs text-ink-dim">
              {environment.short_name} · {environment.gravity_label} ·{' '}
              {environment.radiation_msv_day.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} mSv/dia
              <span className="block">
                {environment.gravity_g < 0.05 ? 'Sem peso: o corpo flutua.' : 'Com peso: o corpo fica apoiado na base.'}
              </span>
            </p>
          )}
          {side === 'back' && LAYERS.find((l) => l.id === layer)!.regions.includes('eyes') && (
            <p className="mt-1 text-center text-xs text-ink-dim">Os olhos só aparecem na vista de frente.</p>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <nav aria-label="Regiões do corpo">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mapRegions.map((r) => (
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
                        {!isVisible(r.id, layer, side) && ' · fora desta vista'}
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
              para chegar à região e Enter para abrir; Esc fecha o painel.
            </p>
          )}

          {wide && panel}

          <p className="sr-only" aria-live="polite">
            {selected ? `Região aberta: ${regionLabel(selected)}` : ''}
          </p>
        </div>
      </div>

      {!wide && panel && createPortal(panel, document.body)}
    </div>
  )
}
