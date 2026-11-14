// Corpo humano em SVG, estilo holograma, desenhado à mão (sem imagens externas),
// com regiões clicáveis, camadas (visão geral, esqueleto, órgãos, imune/nervoso) e vista de frente/costas.
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { BodyRegionId, Status } from '../types'
import { ANATOMY, CHIN, CX, DECOR, draw, MIRROR, SILHOUETTE } from './bodyShapes'
import type { BodyLayer, BodySide } from './bodyShapes'
import { STATUS_META, StatusIcon } from './StatusBadge'

export type { BodyLayer, BodySide } from './bodyShapes'

export interface FigureRegion {
  id: BodyRegionId
  name: string
  /** Pior status entre os indicadores da região; ausente se não há medição. */
  status?: Status
  /** Resumo curto para o tooltip (ex.: "2 indicadores · FC 62 bpm"). */
  summary?: string
}

export const LAYERS: { id: BodyLayer; label: string; regions: BodyRegionId[] }[] = [
  { id: 'overview', label: 'Visão geral', regions: ['brain', 'eyes', 'heart', 'lungs', 'bones', 'immune'] },
  { id: 'skeleton', label: 'Esqueleto e músculos', regions: ['bones'] },
  { id: 'organs', label: 'Órgãos', regions: ['brain', 'eyes', 'heart', 'lungs'] },
  { id: 'immune_nervous', label: 'Sistema imune e nervoso', regions: ['immune', 'brain'] },
]

/** Os olhos não aparecem na vista de costas. */
export function isVisible(id: BodyRegionId, layer: BodyLayer, side: BodySide): boolean {
  if (side === 'back' && id === 'eyes') return false
  return LAYERS.find((l) => l.id === layer)!.regions.includes(id)
}

interface Props {
  regions: FigureRegion[]
  selectedId?: BodyRegionId
  onSelect: (id: BodyRegionId) => void
  layer: BodyLayer
  side: BodySide
  /** Frequência cardíaca atual (bpm): dita o ritmo do batimento do coração. */
  heartRate?: number
  /** Em microgravidade o corpo flutua sobre a base do holograma. */
  floating?: boolean
}

// Ordem de desenho (o que vem depois fica por cima): o coração precisa ficar sobre os pulmões.
const DRAW_ORDER: BodyRegionId[] = ['lungs', 'heart', 'bones', 'immune', 'brain', 'eyes']

const STATUS_COLOR: Record<Status, string> = {
  green: 'var(--color-status-green)',
  yellow: 'var(--color-status-yellow)',
  red: 'var(--color-status-red)',
}

const statusLabel = (status?: Status) => (status ? STATUS_META[status].label : 'Sem medição')

export function regionLabel(region: FigureRegion): string {
  return `${region.name}: ${region.status ? STATUS_META[region.status].label : 'sem medição'}`
}

/** Ícone de status dentro do SVG: forma própria para cada status, nunca só cor. */
function Glyph({ status, x, y }: { status?: Status; x: number; y: number }) {
  const common = { fill: 'var(--color-void)', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round' as const }
  const mark = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' as const }
  return (
    <g transform={`translate(${x} ${y})`}>
      {status === 'green' && (
        <>
          <circle r={4.6} {...common} />
          <path d="M-2.2 0.2 L-0.6 1.9 L2.3 -1.6" {...mark} strokeLinejoin="round" />
        </>
      )}
      {status === 'yellow' && (
        <>
          <path d="M0 -5 L5.4 4.2 H-5.4 Z" {...common} />
          <path d="M0 -1.6 V1 M0 2.7 V2.8" {...mark} />
        </>
      )}
      {status === 'red' && (
        <>
          <path d="M-2 -4.8 H2 L4.8 -2 V2 L2 4.8 H-2 L-4.8 2 V-2 Z" {...common} />
          <path d="M-1.9 -1.9 L1.9 1.9 M1.9 -1.9 L-1.9 1.9" {...mark} />
        </>
      )}
      {!status && (
        <>
          <circle r={4.6} {...common} strokeDasharray="2 1.6" />
          <path d="M-2 0 H2" {...mark} />
        </>
      )}
    </g>
  )
}

interface Tip {
  id: BodyRegionId
  x: number
  y: number
  width: number
}

export function BodyFigure({ regions, selectedId, onSelect, layer, side, heartRate, floating }: Props) {
  const reduceMotion = useReducedMotion()

  // Giro frente/costas: o corpo vira de lado, troca o desenho e termina a volta.
  const controls = useAnimationControls()
  const [shown, setShown] = useState<BodySide>(side)
  useEffect(() => {
    if (reduceMotion) {
      setShown(side)
      return
    }
    if (side === shown) {
      void controls.start({ rotateY: 0, opacity: 1, transition: { duration: 0.28, ease: 'easeOut' } })
      return
    }
    let cancelled = false
    void controls.start({ rotateY: 90, opacity: 0.3, transition: { duration: 0.22, ease: 'easeIn' } }).then(() => {
      if (cancelled) return
      controls.set({ rotateY: -90 })
      setShown(side)
    })
    return () => {
      cancelled = true
    }
  }, [side, shown, reduceMotion, controls])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip>()
  const showTip = (id: BodyRegionId, clientX: number, clientY: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (box) setTip({ id, x: clientX - box.left, y: clientY - box.top, width: box.width })
  }

  const visible = DRAW_ORDER.flatMap((id) => regions.filter((r) => r.id === id && isVisible(id, layer, shown)))
  const tipRegion = tip && visible.find((r) => r.id === tip.id)
  const back = shown === 'back'
  // Um batimento completo dura 60/FC segundos.
  const beatSeconds = 60 / Math.min(220, Math.max(30, heartRate ?? 60))

  return (
    <div ref={wrapRef} className="relative" style={{ perspective: 900 }}>
      <motion.div animate={controls}>
        <svg
          viewBox="-60 -8 380 572"
          role="group"
          aria-labelledby="body-figure-title body-figure-desc"
          className="mx-auto block h-auto w-full max-w-[460px] font-sans"
        >
          <title id="body-figure-title">Corpo humano com as regiões monitoradas</title>
          <desc id="body-figure-desc">
            Holograma de um corpo humano visto de {back ? 'costas' : 'frente'}. Regiões selecionáveis nesta camada:{' '}
            {visible.map(regionLabel).join('; ')}.
          </desc>
          <defs>
            <linearGradient id="holo-body-fill" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="545">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity={0.05} />
              <stop offset="0.55" stopColor="var(--color-accent)" stopOpacity={0.03} />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Base do projetor */}
          <g aria-hidden="true" fill="none" stroke="var(--color-accent)">
            <ellipse cx={CX} cy={551} rx={78} ry={8} strokeWidth={1} opacity={0.5} />
            <ellipse cx={CX} cy={551} rx={52} ry={5} strokeWidth={0.8} opacity={0.35} />
            <ellipse cx={CX} cy={551} rx={24} ry={2.4} fill="var(--color-accent)" fillOpacity={0.25} stroke="none" />
          </g>

          <g className={floating ? 'holo-float' : undefined}>
            {/* Silhueta: de costas é espelhada, como o resto do corpo. */}
            <g aria-hidden="true" transform={back ? MIRROR : undefined} style={{ color: 'var(--color-accent)' }}>
              <path d={SILHOUETTE} fill="url(#holo-body-fill)" />
              <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
                <path d={SILHOUETTE} strokeWidth={1.1} />
                <path d={CHIN} strokeWidth={1.1} />
              </g>
              <g fill="none" stroke="currentColor" strokeWidth={0.7} strokeLinecap="round" opacity={0.3}>
                {DECOR[shown].map((shape, i) => draw(shape, i, { strokeDasharray: shape.dash }))}
              </g>
            </g>

            {visible.map((region) => {
              const anatomy = ANATOMY[region.id]
              const shapes = [...anatomy.base, ...(anatomy.detail?.[layer] ?? [])]
              const selected = region.id === selectedId
              const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(region.id)
                }
              }
              // De costas o miolo é espelhado, então a etiqueta troca de lado.
              const c = anatomy.callout
              const right = (c.side === 'right') !== back
              const ax = back ? 2 * CX - c.x : c.x
              const dir = right ? 1 : -1
              const edge = right ? 222 : 38
              const animStyle: CSSProperties | undefined =
                region.id === 'heart' ? { animationDuration: `${beatSeconds.toFixed(3)}s` } : undefined
              return (
                <g
                  key={region.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${regionLabel(region)}${region.summary ? `. ${region.summary}` : ''}`}
                  aria-pressed={selected}
                  data-region={region.id}
                  onClick={() => onSelect(region.id)}
                  onKeyDown={onKeyDown}
                  onPointerMove={(e) => showTip(region.id, e.clientX, e.clientY)}
                  onPointerLeave={() => setTip(undefined)}
                  onFocus={(e) => {
                    const box = e.currentTarget.querySelector('[data-shapes]')?.getBoundingClientRect()
                    if (box) showTip(region.id, box.left + box.width / 2, box.top)
                  }}
                  onBlur={() => setTip(undefined)}
                  className="holo-region cursor-pointer outline-none"
                  style={{ color: region.status ? STATUS_COLOR[region.status] : 'var(--color-ink-dim)' }}
                >
                  <g transform={back ? MIRROR : undefined}>
                    {[...(anatomy.hit ?? []), ...(anatomy.detailHit?.[layer] ?? [])].map((shape, i) =>
                      draw(shape, i, { fill: 'transparent' }),
                    )}
                    <g data-shapes className={`holo-glow ${anatomy.anim ?? ''}`} style={animStyle}>
                      {/* Vermelho pulsa (anel parado, se o sistema pede menos movimento); amarelo ganha um halo fixo. */}
                      {(region.status === 'red' || region.status === 'yellow') && (
                        <g
                          aria-hidden="true"
                          fill="none"
                          stroke="currentColor"
                          strokeLinejoin="round"
                          className={region.status === 'red' ? 'holo-alert' : 'holo-halo'}
                        >
                          {anatomy.base.filter((s) => !s.open).map((shape, i) => draw(shape, i, {}))}
                        </g>
                      )}
                      {shapes.map((shape, i) =>
                        draw(shape, i, {
                          strokeLinejoin: 'round',
                          strokeLinecap: 'round',
                          strokeDasharray: shape.dash,
                          style: shape.w ? { strokeWidth: shape.w } : undefined,
                          className: `holo-shape ${shape.open ? 'holo-open' : ''} ${shape.soft ? 'holo-soft' : ''}`,
                        }),
                      )}
                    </g>
                  </g>

                  {/* Etiqueta: linha-guia, ícone do status e texto. */}
                  <rect x={right ? edge : -58} y={c.labelY - 10} width={96} height={24} fill="transparent" />
                  <g aria-hidden="true">
                    <path
                      d={`M${ax} ${c.y} L${edge - dir * 8} ${c.labelY} H${edge}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={0.7}
                      opacity={0.8}
                    />
                    <circle cx={ax} cy={c.y} r={1.6} fill="currentColor" />
                    <Glyph status={region.status} x={edge + dir * 7} y={c.labelY} />
                    <text
                      x={edge + dir * 15}
                      y={c.labelY - 1}
                      textAnchor={right ? 'start' : 'end'}
                      fontSize={8.5}
                      fontWeight={600}
                      fill="var(--color-ink)"
                      className="holo-label"
                    >
                      {region.name}
                    </text>
                    <text
                      x={edge + dir * 15}
                      y={c.labelY + 8.5}
                      textAnchor={right ? 'start' : 'end'}
                      fontSize={7.5}
                      fill="var(--color-ink-dim)"
                    >
                      {statusLabel(region.status)}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        </svg>
      </motion.div>

      {/* Tooltip (o mesmo texto já está no aria-label da região). */}
      {tip && tipRegion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-md border border-line bg-void/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(tip.x, 112), Math.max(tip.width - 112, 112)),
            top: tip.y,
            transform: tip.y < 70 ? 'translate(-50%, 18px)' : 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <span className="block font-semibold text-ink">{tipRegion.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-ink">
            {tipRegion.status && <StatusIcon status={tipRegion.status} className="h-3.5 w-3.5" />}
            {statusLabel(tipRegion.status)}
          </span>
          {tipRegion.summary && <span className="mt-0.5 block text-ink-dim">{tipRegion.summary}</span>}
        </div>
      )}
    </div>
  )
}
