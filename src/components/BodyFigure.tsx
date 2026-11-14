// Corpo humano em SVG, desenhado à mão (sem imagens externas), com regiões clicáveis.
import { motion, useReducedMotion } from 'framer-motion'
import type { KeyboardEvent, SVGProps } from 'react'
import type { BodyRegionId, Status } from '../types'
import { STATUS_META } from './StatusBadge'

export interface FigureRegion {
  id: BodyRegionId
  name: string
  /** Pior status entre os indicadores da região; ausente se não há medição. */
  status?: Status
}

interface Props {
  regions: FigureRegion[]
  selectedId?: BodyRegionId
  onSelect: (id: BodyRegionId) => void
}

type Shape =
  | { t: 'path'; d: string; /** traço aberto, sem preenchimento */ open?: boolean }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; width: number; height: number; rx: number }

function draw(shape: Shape, key: number, props: SVGProps<SVGElement>) {
  const p = props as Record<string, unknown>
  switch (shape.t) {
    case 'path':
      return <path key={key} d={shape.d} {...p} />
    case 'ellipse':
      return <ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...p} />
    case 'circle':
      return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...p} />
    case 'rect':
      return <rect key={key} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...p} />
  }
}

// Desenho em um quadro de 260 × 560, corpo de frente (o lado esquerdo do corpo fica à direita).
const SILHOUETTE =
  'M118 88 L118 102 Q100 106 84 114 Q68 122 64 140 L52 212 L44 290 Q40 322 52 322 Q62 322 64 292 L76 216 L88 162 L92 240 L88 292 L92 400 L98 512 Q92 534 100 534 L122 534 Q126 534 124 512 L122 410 L128 310 L130 306 L132 310 L138 410 L136 512 Q134 534 138 534 L160 534 Q168 534 162 512 L168 400 L172 292 L168 240 L172 162 L184 216 L196 292 Q198 322 208 322 Q220 322 216 290 L208 212 L196 140 Q192 122 176 114 Q160 106 142 102 L142 88 Z'

/** `hit` = área de clique invisível, maior que o desenho, para regiões pequenas. */
const ANATOMY: Record<BodyRegionId, { shapes: Shape[]; hit?: Shape[] }> = {
  brain: {
    shapes: [
      { t: 'path', d: 'M130 18 Q112 16 107 30 Q102 44 112 52 Q121 57 130 54 Q139 57 148 52 Q158 44 153 30 Q148 16 130 18 Z' },
      { t: 'path', d: 'M130 20 L130 53 M117 28 Q122 34 116 41 M143 28 Q138 34 144 41', open: true },
    ],
  },
  eyes: {
    shapes: [
      { t: 'ellipse', cx: 117, cy: 66, rx: 7, ry: 4.5 },
      { t: 'ellipse', cx: 143, cy: 66, rx: 7, ry: 4.5 },
      { t: 'circle', cx: 117, cy: 66, r: 1.6 },
      { t: 'circle', cx: 143, cy: 66, r: 1.6 },
    ],
    hit: [{ t: 'rect', x: 104, y: 57, width: 52, height: 18, rx: 9 }],
  },
  lungs: {
    shapes: [
      { t: 'path', d: 'M124 130 Q104 134 100 190 Q100 206 112 203 Q124 199 124 180 Z' },
      { t: 'path', d: 'M136 130 Q156 134 160 190 Q160 206 148 203 Q136 199 136 180 Z' },
    ],
  },
  heart: {
    shapes: [
      { t: 'path', d: 'M139 190 C122 177 124 160 132 160 C137 160 139 164 139 167 C139 164 141 160 146 160 C154 160 156 177 139 190 Z' },
    ],
  },
  bones: {
    shapes: [
      { t: 'rect', x: 103, y: 316, width: 10, height: 82, rx: 5 },
      { t: 'rect', x: 147, y: 316, width: 10, height: 82, rx: 5 },
      { t: 'circle', cx: 108, cy: 404, r: 6 },
      { t: 'circle', cx: 152, cy: 404, r: 6 },
      { t: 'rect', x: 105, y: 410, width: 9, height: 94, rx: 4.5 },
      { t: 'rect', x: 146, y: 410, width: 9, height: 94, rx: 4.5 },
    ],
    hit: [
      { t: 'rect', x: 96, y: 312, width: 26, height: 196, rx: 10 },
      { t: 'rect', x: 138, y: 312, width: 26, height: 196, rx: 10 },
    ],
  },
  immune: {
    shapes: [
      { t: 'circle', cx: 113, cy: 99, r: 4.5 },
      { t: 'circle', cx: 147, cy: 99, r: 4.5 },
      { t: 'circle', cx: 92, cy: 156, r: 5 },
      { t: 'circle', cx: 168, cy: 156, r: 5 },
      { t: 'ellipse', cx: 154, cy: 228, rx: 10, ry: 6.5 },
      { t: 'circle', cx: 114, cy: 292, r: 5 },
      { t: 'circle', cx: 146, cy: 292, r: 5 },
    ],
    hit: [
      { t: 'circle', cx: 113, cy: 99, r: 10 },
      { t: 'circle', cx: 147, cy: 99, r: 10 },
      { t: 'circle', cx: 92, cy: 156, r: 11 },
      { t: 'circle', cx: 168, cy: 156, r: 11 },
      { t: 'ellipse', cx: 154, cy: 228, rx: 15, ry: 12 },
      { t: 'circle', cx: 114, cy: 292, r: 11 },
      { t: 'circle', cx: 146, cy: 292, r: 11 },
    ],
  },
}

// Ordem de desenho (o que vem depois fica por cima): o coração precisa ficar sobre os pulmões.
const DRAW_ORDER: BodyRegionId[] = ['brain', 'eyes', 'lungs', 'heart', 'bones', 'immune']

const STATUS_COLOR: Record<Status, string> = {
  green: 'var(--color-status-green)',
  yellow: 'var(--color-status-yellow)',
  red: 'var(--color-status-red)',
}

export function regionLabel(region: FigureRegion): string {
  return `${region.name}: ${region.status ? STATUS_META[region.status].label : 'sem medição'}`
}

export function BodyFigure({ regions, selectedId, onSelect }: Props) {
  const reduceMotion = useReducedMotion()
  const ordered = DRAW_ORDER.flatMap((id) => regions.filter((r) => r.id === id))

  return (
    <svg
      viewBox="0 0 260 560"
      role="group"
      aria-labelledby="body-figure-title body-figure-desc"
      className="mx-auto block h-auto w-full max-w-[320px]"
    >
      <title id="body-figure-title">Corpo humano com as regiões monitoradas</title>
      <desc id="body-figure-desc">
        Figura de um corpo humano visto de frente. Regiões selecionáveis: {regions.map(regionLabel).join('; ')}.
      </desc>

      <g aria-hidden="true" fill="var(--color-panel-hi)" stroke="var(--color-line)" strokeWidth={2} strokeLinejoin="round">
        <path d={SILHOUETTE} />
        <ellipse cx={130} cy={52} rx={34} ry={41} />
      </g>

      {ordered.map((region) => {
        const { shapes, hit } = ANATOMY[region.id]
        const selected = region.id === selectedId
        const alert = region.status === 'yellow' || region.status === 'red'
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(region.id)
          }
        }
        return (
          <g
            key={region.id}
            role="button"
            tabIndex={0}
            aria-label={regionLabel(region)}
            aria-pressed={selected}
            data-region={region.id}
            onClick={() => onSelect(region.id)}
            onKeyDown={onKeyDown}
            className="group cursor-pointer outline-none"
            style={{ color: region.status ? STATUS_COLOR[region.status] : 'var(--color-ink-dim)' }}
          >
            <title>{regionLabel(region)}</title>
            {(hit ?? []).map((shape, i) => draw(shape, i, { fill: 'transparent' }))}

            {/* Regiões com alerta pulsam na cor do pior status (parado, se o sistema pede menos movimento). */}
            {alert &&
              (reduceMotion ? (
                <g aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={5} opacity={0.45}>
                  {shapes.map((shape, i) => draw(shape, i, {}))}
                </g>
              ) : (
                <motion.g
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  initial={{ opacity: 0.9, strokeWidth: 2 }}
                  animate={{ opacity: [0.9, 0], strokeWidth: [2, 11] }}
                  transition={{ duration: region.status === 'red' ? 1.1 : 1.8, repeat: Infinity, ease: 'easeOut' }}
                >
                  {shapes.map((shape, i) => draw(shape, i, {}))}
                </motion.g>
              ))}

            {shapes.map((shape, i) =>
              draw(shape, i, {
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
                className: `${shape.t === 'path' && shape.open ? 'fill-none' : 'fill-current'} stroke-current transition-[fill-opacity,stroke-width] group-hover:[fill-opacity:0.75] group-hover:stroke-ink group-focus-visible:[fill-opacity:0.75] group-focus-visible:stroke-ink group-focus-visible:[stroke-width:3.5] ${
                  selected ? '[fill-opacity:0.8] stroke-ink [stroke-width:2.5]' : '[fill-opacity:0.35] [stroke-width:1.5]'
                }`,
              }),
            )}
          </g>
        )
      })}
    </svg>
  )
}
