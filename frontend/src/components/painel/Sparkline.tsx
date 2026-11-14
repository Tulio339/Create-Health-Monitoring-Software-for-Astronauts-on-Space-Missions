import { useEffect, useRef, useState } from 'react'
import type { Point } from '../../lib/cell'

const H = 36
const PAD = 3

interface Props {
  points: Point[]
  /** Faixa normal desenhada como fundo bem suave. */
  band?: [number, number]
  /** Cor do último ponto (nível atual); sem cor = accent. */
  lastColor?: string
  label: string
  /** Autorrelatos diários vão em pontos, contínuos em linha. */
  dots?: boolean
}

// Sparkline sem eixos, grade, tooltip ou legenda; o texto alternativo descreve a tendência.
export function Sparkline({ points, band, lastColor, label, dots }: Props) {
  // Altura fixa: a largura é medida para o desenho não esticar em telas largas ou estreitas.
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(160)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(40, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  if (points.length === 0) return <div ref={ref} role="img" aria-label={label} className="h-9 w-full" />
  const values = points.map((p) => p.v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const t0 = points[0].t
  const span = points.at(-1)!.t - t0
  const x = (t: number) => (span === 0 ? W - PAD : PAD + ((t - t0) / span) * (W - 2 * PAD))
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD))
  const clampY = (v: number) => Math.min(H, Math.max(0, y(v)))
  const last = points.at(-1)!
  return (
    <div ref={ref} className="h-9 w-full min-w-0">
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block">
      {band && hi !== lo && (
        <rect
          x={0}
          width={W}
          y={clampY(band[1])}
          height={Math.max(0, clampY(band[0]) - clampY(band[1]))}
          fill="var(--color-ink)"
          fillOpacity={0.06}
        />
      )}
      {dots ? (
        points.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={1.6} fill="var(--color-accent)" />)
      ) : (
        <polyline
          points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      <circle cx={x(last.t)} cy={y(last.v)} r={2.4} fill={lastColor ?? 'var(--color-accent)'} />
    </svg>
    </div>
  )
}
