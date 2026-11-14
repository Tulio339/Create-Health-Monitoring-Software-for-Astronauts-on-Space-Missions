import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '../../lib/cell'
import { LEVEL_META, worstLevel } from '../../lib/levels'
import type { Origin } from '../../lib/origin'
import type { DirectiveThreshold, Level } from '../../types'

export interface ChartPoint {
  t: number
  v: number
  origin?: Origin
}

interface Props {
  points: ChartPoint[]
  unit: string
  decimals: number
  baseline?: { mean: number; std: number }
  thresholds: DirectiveThreshold[]
  /** Autorrelatos diários em pontos; contínuos em linha. */
  dots: boolean
  label: string
}

const TICK = { fill: 'var(--color-ink-faint)', fontSize: 12 }
const OPS: Record<DirectiveThreshold['op'], (a: number, b: number) => boolean> = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
}
const day = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/** Nível do pior limiar de diretiva que o ponto cruza; normal se não cruza nenhum. */
export function pointLevel(v: number, thresholds: DirectiveThreshold[]): Level {
  return worstLevel(thresholds.filter((th) => OPS[th.op](v, th.value)).map((th) => th.level))
}

export function DetailChart({ points, unit, decimals, baseline, thresholds, dots, label }: Props) {
  if (points.length === 0) return <p className="text-sm text-ink-faint">Sem leituras nos últimos 30 dias.</p>
  const band = baseline && baseline.std > 0 ? { lo: baseline.mean - baseline.std, hi: baseline.mean + baseline.std } : undefined
  const ys = [...points.map((p) => p.v), ...thresholds.map((t) => t.value), ...(band ? [band.lo, band.hi] : [])]
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  const pad = (hi - lo) * 0.08 || 1
  const t0 = points[0].t
  const t1 = points.at(-1)!.t
  const ticks = [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3)

  return (
    <div role="img" aria-label={label} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" type="number" domain={[t0, t1]} ticks={ticks} tickFormatter={day} tick={TICK} tickLine={false} axisLine={false} />
          <YAxis
            domain={[lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad]}
            tickCount={4}
            tickFormatter={(v: number) => fmt(v, decimals)}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          {band && <ReferenceArea y1={band.lo} y2={band.hi} fill="var(--color-ink)" fillOpacity={0.06} stroke="none" />}
          {baseline && (
            <ReferenceLine
              y={baseline.mean}
              stroke="var(--color-ink-faint)"
              strokeWidth={1}
              label={{ value: 'pré-voo', position: 'insideBottomLeft', fill: 'var(--color-ink-faint)', fontSize: 11 }}
            />
          )}
          {thresholds.map((th) => (
            <ReferenceLine
              key={`${th.level}-${th.op}-${th.value}`}
              y={th.value}
              stroke={LEVEL_META[th.level].color}
              strokeWidth={1}
              strokeDasharray="4 4"
              label={{
                value: `${LEVEL_META[th.level].label} ${th.op} ${fmt(th.value, decimals)}`,
                position: 'insideTopRight',
                fill: LEVEL_META[th.level].color,
                fontSize: 11,
              }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ChartPoint | undefined
              if (!active || !p) return null
              return (
                <div className="rounded-md border border-line bg-panel-hi px-3 py-2 text-xs">
                  <div className="tnum text-sm text-ink">
                    {fmt(p.v, decimals)} <span className="text-ink-dim">{unit}</span>
                  </div>
                  <div className="text-ink-faint">
                    {new Date(p.t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                    {p.origin && ` · ${p.origin}`}
                  </div>
                </div>
              )
            }}
          />
          <Line
            dataKey="v"
            stroke={dots ? 'transparent' : 'var(--color-accent)'}
            strokeWidth={1.5}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: 'var(--color-accent)', stroke: 'var(--color-panel)' }}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: ChartPoint }) => {
              const { cx, cy, index, payload } = props
              const level = payload ? pointLevel(payload.v, thresholds) : 'normal'
              const out = level !== 'normal'
              if (cx === undefined || cy === undefined || (!dots && !out)) return <g key={index} />
              return <circle key={index} cx={cx} cy={cy} r={out ? 3 : 2.5} fill={out ? LEVEL_META[level].color : 'var(--color-accent)'} />
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
