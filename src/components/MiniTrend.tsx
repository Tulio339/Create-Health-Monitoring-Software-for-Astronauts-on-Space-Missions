// Mini-gráfico de linha dos últimos 30 dias de um indicador, em SVG puro.
// Passar o ponteiro mostra o valor de cada leitura; o resumo em texto vale para quem não vê o gráfico.
import { useState } from 'react'
import type { PointerEvent } from 'react'
import type { Reading } from '../lib/dashboard'
import { formatDate } from '../lib/format'

const DAY_MS = 86_400_000
const W = 240
const H = 52
const PAD = 6

/** Leituras dos 30 dias que terminam na leitura mais recente. */
export function lastDays(history: Reading[], days = 30): Reading[] {
  const last = history.at(-1)
  if (!last) return []
  const from = Date.parse(last.timestamp) - days * DAY_MS
  return history.filter((r) => Date.parse(r.timestamp) > from)
}

export function MiniTrend({ readings, unit, title }: { readings: Reading[]; unit: string; title: string }) {
  const [hover, setHover] = useState<number>()
  if (readings.length === 0) return null

  const values = readings.map((r) => r.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const minReading = readings[values.indexOf(min)]
  const maxReading = readings[values.indexOf(max)]
  const t0 = Date.parse(readings[0].timestamp)
  const span = Date.parse(readings.at(-1)!.timestamp) - t0
  const x = (r: Reading) => (span === 0 ? W - PAD : PAD + ((Date.parse(r.timestamp) - t0) / span) * (W - 2 * PAD))
  const y = (r: Reading) => (max === min ? H / 2 : H - PAD - ((r.value - min) / (max - min)) * (H - 2 * PAD))
  const points = readings.map((r) => `${x(r).toFixed(1)},${y(r).toFixed(1)}`).join(' ')

  const last = readings.at(-1)!
  const shown = hover === undefined ? undefined : readings[hover]
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * W
    let nearest = 0
    readings.forEach((r, i) => {
      if (Math.abs(x(r) - px) < Math.abs(x(readings[nearest]) - px)) nearest = i
    })
    setHover(nearest)
  }

  const summary = `${title}, últimos 30 dias: ${readings.length} ${
    readings.length === 1 ? 'leitura' : 'leituras'
  }, mínimo ${minReading.display}, máximo ${maxReading.display}, atual ${last.display} ${unit}.`

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="block h-auto w-full max-w-[300px] touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        <path d={`M${PAD} ${H - 1} H${W - PAD}`} stroke="var(--color-line)" strokeWidth={1} />
        {readings.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {shown && (
          <path d={`M${x(shown)} 2 V${H - 1}`} stroke="var(--color-ink-dim)" strokeWidth={1} strokeDasharray="2 2" />
        )}
        {/* Leitura atual (ou a que está sob o ponteiro), com anel na cor do fundo. */}
        <circle
          cx={x(shown ?? last)}
          cy={y(shown ?? last)}
          r={4}
          fill="var(--color-accent)"
          stroke="var(--color-void)"
          strokeWidth={2}
        />
      </svg>
      <p aria-hidden="true" className="mt-1 flex max-w-[300px] flex-wrap justify-between gap-x-3 text-xs text-ink-dim">
        {shown ? (
          <span>
            {formatDate(shown.timestamp)}:{' '}
            <span className="font-mono text-ink">
              {shown.display} {unit}
            </span>
          </span>
        ) : (
          <>
            <span>Últimos 30 dias</span>
            <span>
              mín <span className="font-mono text-ink">{minReading.display}</span> · máx{' '}
              <span className="font-mono text-ink">{maxReading.display}</span>
            </span>
          </>
        )}
      </p>
    </div>
  )
}
