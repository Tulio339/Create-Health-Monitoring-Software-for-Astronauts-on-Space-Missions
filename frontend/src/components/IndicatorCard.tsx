import { motion } from 'framer-motion'
import { Line, LineChart, YAxis } from 'recharts'
import type { Panel } from '../lib/dashboard'
import { STATUS_BORDER, StatusBadge } from './StatusBadge'

interface Props {
  panel: Panel
  /** Link para a página de detalhe do indicador. */
  href: string
}

export function IndicatorCard({ panel, href }: Props) {
  const { status, reason } = panel.classification
  const spark = panel.spark.map((value) => ({ value }))
  return (
    <motion.a
      href={href}
      whileHover={{ y: -2 }}
      className={`group flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-line bg-panel p-3 transition-colors hover:border-ink-dim hover:bg-panel-hi ${STATUS_BORDER[status]}`}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-ink-dim">{panel.shortTitle}</span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums">{panel.value}</span>
        <span className="text-xs text-ink-dim">{panel.unit}</span>
      </span>
      <StatusBadge status={status} />
      <span className="text-xs leading-snug text-ink-dim first-letter:uppercase">{reason}.</span>
      <span className="mt-auto flex items-end justify-between gap-2 pt-1">
        {/* Miniatura decorativa: o gráfico completo e a tabela ficam na página de detalhe */}
        <span aria-hidden="true" className="block h-7 overflow-hidden">
          <LineChart width={110} height={28} data={spark} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Line dataKey="value" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </span>
        <span className="text-xs text-ink-dim group-hover:text-accent">
          Detalhes <span aria-hidden="true">→</span>
        </span>
      </span>
    </motion.a>
  )
}
