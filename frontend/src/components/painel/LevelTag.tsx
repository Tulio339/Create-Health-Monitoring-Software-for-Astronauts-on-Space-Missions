import { LEVEL_META, isActionLevel } from '../../lib/levels'
import type { Level } from '../../types'

// Cor + palavra + forma. Normal e sem dado ficam neutros; só os níveis de ação ganham cor no texto.
export function LevelTag({ level, className = '' }: { level: Level; className?: string }) {
  const meta = LEVEL_META[level]
  const action = isActionLevel(level)
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${action ? 'font-semibold' : 'text-ink-faint'} ${className}`}
      style={action ? { color: meta.color } : undefined}
    >
      <span aria-hidden="true" style={{ color: meta.color }}>
        {meta.shape}
      </span>
      {meta.label}
    </span>
  )
}
