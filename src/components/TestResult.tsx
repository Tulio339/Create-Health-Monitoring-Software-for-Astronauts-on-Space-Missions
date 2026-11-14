// Resultado de um teste: status (cor, ícone e texto), razão, explicação e ação recomendada.
import type { ReactNode } from 'react'
import type { Classification } from '../lib/classify'
import { alertsHref } from '../lib/route'
import type { IndicatorInfo } from '../types'
import { STATUS_BORDER, STATUS_META, StatusBadge, StatusIcon } from './StatusBadge'

interface Props {
  title: string
  value: string
  unit: string
  classification: Classification
  info: IndicatorInfo
  astronautId: string
  /** Já foi salvo como medição? */
  saved: boolean
  /** Detalhes do teste (rodadas, contagem por olho). */
  children?: ReactNode
}

export function TestResult({ title, value, unit, classification, info, astronautId, saved, children }: Props) {
  const { status, reason } = classification
  return (
    <div className="space-y-4">
      <div role="status" className={`rounded-lg border border-l-4 border-line bg-panel p-4 sm:p-5 ${STATUS_BORDER[status]}`}>
        <p className="text-sm text-ink-dim">{saved ? 'Resultado salvo como medição' : 'Resultado do teste (ainda não salvo)'}</p>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-4xl font-semibold tabular-nums">{value}</span>
          <span className="text-sm text-ink-dim">{unit}</span>
        </p>
        <div className="mt-3">
          <StatusBadge status={status} />
          <p className="mt-2 font-medium first-letter:uppercase">{reason}.</p>
          <p className="text-sm text-ink-dim">{info.explanations[status]}</p>
        </div>
        {children && <div className="mt-4 border-t border-line pt-3 text-sm">{children}</div>}
      </div>

      {status === 'red' && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border-2 border-status-red bg-status-red/10 p-4">
          <StatusIcon status="red" className="mt-0.5 h-7 w-7" />
          <div className="text-sm leading-relaxed">
            <p className="text-lg font-semibold">Encaminhar ao médico de voo</p>
            {saved ? (
              <p>
                Um relatório para a Terra foi gerado e está na fila de envio.{' '}
                <a href={alertsHref(astronautId)} className="font-semibold underline underline-offset-2">
                  Acompanhar em Alertas
                </a>
              </p>
            ) : (
              <p>Salve o resultado para gerar o alerta e o relatório para a Terra.</p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">Ação recomendada</h3>
        {status === 'green' ? (
          <p className="text-sm">{STATUS_META.green.action} Repita o teste no próximo dia programado.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {info.actions[status].map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
