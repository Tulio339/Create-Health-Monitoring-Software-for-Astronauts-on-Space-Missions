import { DOT_PANELS, LEVEL_META, formatAgo, isActionLevel } from '../../lib/levels'
import { TREND_META, cellValue, lastDaysPoints, normalBand, trendOf } from '../../lib/cell'
import type { Panel } from '../../lib/dashboard'
import { originOf } from '../../lib/origin'
import type { Level } from '../../types'
import { LevelTag } from './LevelTag'
import { Sparkline } from './Sparkline'

interface Props {
  panel: Panel
  level: Level
  nowMs: number
  href: string
}

export function IndicatorCell({ panel, level, nowMs, href }: Props) {
  const last = panel.history.at(-1)
  const points = lastDaysPoints(panel, 7)
  const trend = TREND_META[trendOf(points)]
  const value = cellValue(panel)
  const action = isActionLevel(level)
  const stale = level === 'sem-dado'
  const label = `${panel.shortTitle} ${trend.label}, ${value} ${panel.unit}`
  return (
    <a
      href={href}
      className="flex min-w-0 flex-col gap-2 rounded-lg border bg-panel p-4 transition-colors hover:bg-panel-hi"
      style={{ borderColor: action ? LEVEL_META[level].color : 'var(--color-line)' }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="truncate text-sm text-ink-dim">{panel.shortTitle}</span>
        <LevelTag level={level} className="shrink-0" />
      </span>

      {stale ? (
        <span className="flex min-h-9 flex-col justify-center">
          <span className="text-sm text-ink">{last ? `Sem leitura ${formatAgo(last.timestamp, nowMs)}` : 'Sem leitura'}</span>
          {last && (
            <span className="tnum text-xs text-ink-faint">
              última: {value} {panel.unit}
            </span>
          )}
        </span>
      ) : (
        <span className="flex min-h-9 items-baseline gap-1.5">
          <span className="tnum text-[28px] leading-none font-semibold">{value}</span>
          <span className="text-xs text-ink-dim">{panel.unit}</span>
        </span>
      )}

      <Sparkline
        points={points}
        band={normalBand(panel.id)}
        lastColor={action ? LEVEL_META[level].color : undefined}
        dots={DOT_PANELS.includes(panel.id)}
        label={points.length ? `${label}, últimos 7 dias` : `${panel.shortTitle}: sem leituras nos últimos 7 dias`}
      />

      <span className="flex items-center justify-between gap-2 text-xs text-ink-faint">
        <span title={`Tendência de 7 dias: ${trend.label}`}>
          <span aria-hidden="true">{trend.arrow}</span> {trend.label}
        </span>
        {last && (
          <span className="tnum">
            {originOf(last.source)} · {formatAgo(last.timestamp, nowMs)}
          </span>
        )}
      </span>
    </a>
  )
}
