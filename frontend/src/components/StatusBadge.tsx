import type { Status } from '../types'

// O status nunca é só cor: cada um tem forma de ícone e texto próprios.
export const STATUS_META: Record<Status, { label: string; action: string; color: string }> = {
  green: { label: 'Normal', action: 'Tudo certo, siga a rotina.', color: 'text-status-green' },
  yellow: { label: 'Atenção', action: 'Você age e acompanha.', color: 'text-status-yellow' },
  red: { label: 'Médico de voo', action: 'Encaminhar ao médico de voo.', color: 'text-status-red' },
}

export const STATUS_BORDER: Record<Status, string> = {
  green: 'border-l-status-green',
  yellow: 'border-l-status-yellow',
  red: 'border-l-status-red',
}

export function StatusIcon({ status, className = 'h-4 w-4' }: { status: Status; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: `${className} shrink-0 ${STATUS_META[status].color}`,
  }
  if (status === 'green') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="m7.5 12.5 3 3 6-6.5" />
      </svg>
    )
  }
  if (status === 'yellow') {
    return (
      <svg {...common}>
        <path d="M12 3 1.8 20.5h20.4L12 3Z" />
        <path d="M12 10v4.5M12 17.6v.1" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8L8 2.5Z" />
      <path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" />
    </svg>
  )
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-void/60 py-0.5 pl-1.5 pr-2.5 text-xs font-semibold text-ink">
      <StatusIcon status={status} />
      {STATUS_META[status].label}
    </span>
  )
}
