import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dayLabel, formatDate, formatValue, missionDay, unitLabel } from '../lib/format'
import type { Baseline, IndicatorInfo, Measurement } from '../types'

interface Props {
  info: IndicatorInfo
  series: Measurement[]
  baseline?: Baseline
  missionStart: string
}

interface Point {
  day: number
  value: number
  timestamp: string
}

const AXIS = { fill: 'var(--color-ink-dim)', fontSize: 12 }

export function IndicatorChart({ info, series, baseline, missionStart }: Props) {
  const points: Point[] = series.map((m) => ({
    day: missionDay(m.timestamp, missionStart),
    value: m.value,
    timestamp: m.timestamp,
  }))
  if (points.length === 0) return <p className="text-sm text-ink-dim">Sem medições para este indicador.</p>

  const band = baseline && { lo: baseline.mean - 2 * baseline.std, hi: baseline.mean + 2 * baseline.std }
  const values = points.map((p) => p.value)
  const lo = Math.min(...values, band?.lo ?? Infinity)
  const hi = Math.max(...values, band?.hi ?? -Infinity)
  const pad = (hi - lo) * 0.08 || 1
  const firstDay = points[0].day
  const lastDay = points[points.length - 1].day
  const ticks = [firstDay, ...[-6, 1, 8, 15, 22].filter((d) => d > firstDay && d < lastDay), lastDay]

  return (
    <div>
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="day"
              type="number"
              domain={[firstDay, lastDay]}
              ticks={ticks}
              tickFormatter={(d: number) => (d >= 1 ? `D${d}` : `Pré −${1 - d}`)}
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
            />
            <YAxis
              domain={[lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad]}
              tickFormatter={(v: number) => formatValue(Number(v.toPrecision(3)), '')}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {band && (
              <ReferenceArea y1={band.lo} y2={band.hi} fill="var(--color-ink-dim)" fillOpacity={0.14} stroke="none" />
            )}
            <ReferenceLine
              x={1}
              stroke="var(--color-ink-dim)"
              strokeDasharray="4 4"
              label={{ value: 'Início da missão', position: 'top', fill: 'var(--color-ink-dim)', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-dim)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Point | undefined
                if (!active || !p) return null
                return (
                  <div className="rounded-md border border-line bg-panel-hi px-3 py-2 text-sm shadow-lg">
                    <div className="text-xs text-ink-dim">
                      {dayLabel(p.day)} · {formatDate(p.timestamp)}
                    </div>
                    <div className="font-mono font-semibold tabular-nums">
                      {formatValue(p.value, info.unit)}{' '}
                      <span className="font-sans font-normal text-ink-dim">{unitLabel(info.unit)}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Line
              dataKey="value"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--color-panel)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {band && (
        <p className="mt-2 flex items-start gap-2 text-xs text-ink-dim">
          <span aria-hidden="true" className="mt-0.5 inline-block h-3 w-5 shrink-0 rounded-sm bg-ink-dim/25" />
          <span>
            Faixa sombreada: linha de base pessoal (média ± 2 desvios do pré-voo), de {formatValue(band.lo, info.unit)}{' '}
            a {formatValue(band.hi, info.unit)} {unitLabel(info.unit)}.
          </span>
        </p>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-dim hover:text-ink">Ver dados em tabela</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-panel-hi text-xs text-ink-dim">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Dia
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  Data
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  {info.short_name} ({unitLabel(info.unit)})
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {points.map((p) => (
                <tr key={p.timestamp} className="border-t border-line/60">
                  <td className="px-3 py-1 font-sans">{dayLabel(p.day)}</td>
                  <td className="px-3 py-1">{formatDate(p.timestamp)}</td>
                  <td className="px-3 py-1 text-right">{formatValue(p.value, info.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
