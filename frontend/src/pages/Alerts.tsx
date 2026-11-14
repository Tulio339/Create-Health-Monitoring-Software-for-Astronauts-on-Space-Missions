import { useEffect, useState } from 'react'
import { clearLocalData, setAlertStatus } from '../api'
import { STATUS_BORDER, StatusBadge } from '../components/StatusBadge'
import { TIME_ACCELERATION, alertStatus, buildReport, transmission } from '../lib/alerts'

/** Atraso de comunicação usado enquanto o seletor de ambiente não está ligado a esta tela (Marte: 20 min). */
const DELAY_SECONDS = 20 * 60
const EARTH_DELAY_MIN = DELAY_SECONDS / 60
import type { Alert, EarthReport } from '../lib/alerts'
import { dayLabel, missionDay } from '../lib/format'
import { alertsHref, detailHref } from '../lib/route'
import type { AlertStatus, Astronaut } from '../types'

interface Props {
  astronauts: Astronaut[]
  alerts: Alert[]
  statuses: Record<string, AlertStatus>
  /** Filtro por astronauta vindo da rota; ausente = todos. */
  astronautId?: string
  /** Medições registradas neste navegador. */
  localCount: number
}

const STATE_LABEL: Record<AlertStatus, string> = { new: 'Novo', seen: 'Visto', resolved: 'Resolvido' }
const STATE_MARK: Record<AlertStatus, string> = { new: '●', seen: '◐', resolved: '✓' }

const CHIP = 'rounded-md border px-3 py-1.5 text-sm transition-colors'
const chip = (active: boolean) =>
  `${CHIP} ${active ? 'border-accent bg-panel-hi text-ink' : 'border-line bg-panel text-ink-dim hover:border-ink-dim hover:text-ink'}`
const SMALL_BUTTON =
  'rounded-md border border-line bg-void/40 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink-dim'

function when(timestamp: string, missionStart: string): string {
  const date = new Date(timestamp)
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${dayLabel(missionDay(timestamp, missionStart))} · ${day} ${time} UTC`
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Relógio que só anda enquanto `active` (há relatório em trânsito). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function ReportCard({ report, missionStart, now }: { report: EarthReport; missionStart: string; now: number }) {
  const tx = transmission(report, now)
  return (
    <li className="rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-semibold">
          {report.indicator} — {report.astronaut}
        </h3>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden="true" className="font-mono text-accent">
            {tx.delivered ? '✓' : '➤'}
          </span>
          {tx.delivered ? 'Recebido na Terra' : 'Em trânsito para a Terra'}
        </p>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-dim">Astronauta</dt>
        <dd>
          {report.astronaut} ({report.role})
        </dd>
        <dt className="text-ink-dim">Indicador</dt>
        <dd>{report.indicator}</dd>
        <dt className="text-ink-dim">Valor</dt>
        <dd>
          <span className="font-mono font-semibold tabular-nums">{report.value}</span>{' '}
          <span className="first-letter:uppercase">— {report.reason}</span>
        </dd>
        <dt className="text-ink-dim">Tendência</dt>
        <dd className="first-letter:uppercase">{report.trend}</dd>
        <dt className="text-ink-dim">Horário</dt>
        <dd>{when(report.measuredAt, missionStart)}</dd>
      </dl>
      {!tx.delivered && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label="Transmissão para a Terra"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(tx.progress * 100)}
            className="h-2 overflow-hidden rounded-full bg-void"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${tx.progress * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-dim">
            Chega à Terra em <span className="font-mono tabular-nums text-ink">{clock(tx.remainingSimSeconds)}</span>{' '}
            (tempo simulado)
          </p>
        </div>
      )}
    </li>
  )
}

export function Alerts({ astronauts, alerts, statuses, astronautId, localCount }: Props) {
  const [showResolved, setShowResolved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const filter = astronauts.find((a) => a.id === astronautId)
  const astronautOf = (id: string) => astronauts.find((a) => a.id === id)
  const mine = alerts.filter((a) => !filter || a.astronautId === filter.id)
  const visible = mine.filter((a) => showResolved || alertStatus(a, statuses) !== 'resolved')
  const resolvedCount = mine.length - mine.filter((a) => alertStatus(a, statuses) !== 'resolved').length

  // Fila de envio: relatórios dos alertas vermelhos, os mais recentes primeiro.
  const reports = mine.flatMap((alert) => {
    const astronaut = astronautOf(alert.astronautId)
    const report = astronaut && buildReport(alert, astronaut, DELAY_SECONDS)
    return report ? [{ report, missionStart: astronaut.mission_start }] : []
  })
  const anyInTransit = reports.some(({ report }) => report.deliveredAtMs > Date.now())
  const now = useNow(anyInTransit)
  const inTransit = reports.filter(({ report }) => !transmission(report, now).delivered)
  const delivered = reports.filter(({ report }) => transmission(report, now).delivered)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <p className="text-sm text-ink-dim">
          Gerados quando um indicador sai do verde. Dias seguidos fora do normal contam como um alerta só.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Filtrar por astronauta" className="flex flex-wrap gap-2">
          <a href={alertsHref()} aria-current={!filter ? 'page' : undefined} className={chip(!filter)}>
            Todos
          </a>
          {astronauts.map((a) => (
            <a
              key={a.id}
              href={alertsHref(a.id)}
              aria-current={filter?.id === a.id ? 'page' : undefined}
              className={chip(filter?.id === a.id)}
            >
              {a.name}
            </a>
          ))}
        </nav>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Mostrar resolvidos ({resolvedCount})
        </label>
      </div>

      <section aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="mb-3 font-mono text-xs uppercase tracking-wider text-accent">
          {showResolved ? 'Todos os alertas' : 'Alertas em aberto'} ({visible.length})
        </h2>
        {visible.length === 0 && (
          <p className="rounded-lg border border-line bg-panel p-4 text-sm text-ink-dim">
            Nenhum alerta em aberto{filter ? ` para ${filter.name}` : ''}.
          </p>
        )}
        <ul className="space-y-3">
          {visible.map((alert) => {
            const astronaut = astronautOf(alert.astronautId)
            if (!astronaut) return null
            const state = alertStatus(alert, statuses)
            const ongoing = !alert.endedAt
            const set = (status: AlertStatus) => void setAlertStatus(alert.stateKey, status)
            return (
              <li
                key={alert.id}
                className={`rounded-lg border border-l-4 border-line bg-panel p-4 ${STATUS_BORDER[alert.level]} ${
                  state === 'resolved' ? 'opacity-75' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <StatusBadge status={alert.level} />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">
                    <span aria-hidden="true" className="font-mono">
                      {STATE_MARK[state]}
                    </span>
                    {STATE_LABEL[state]}
                  </span>
                  <span className="text-sm text-ink-dim">{when(alert.trigger.timestamp, astronaut.mission_start)}</span>
                </div>
                <h3 className="mt-2 font-semibold">
                  {alert.title} — {astronaut.name}
                </h3>
                <p className="text-sm">
                  <span className="font-mono font-semibold tabular-nums">
                    {alert.trigger.display} {alert.unit}
                  </span>
                  : {alert.trigger.classification.reason}.
                </p>
                <p className="mt-1 text-sm text-ink-dim">
                  {ongoing
                    ? alert.latest.timestamp === alert.trigger.timestamp
                      ? 'Esta é a leitura mais recente.'
                      : `Leitura mais recente: ${alert.latest.display} ${alert.unit} — ${alert.latest.classification.reason}.`
                    : `Voltou ao normal em ${when(alert.endedAt!, astronaut.mission_start)}.`}
                  {alert.level === 'red' && ' Relatório para a Terra na fila de envio abaixo.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {state === 'new' && (
                    <button type="button" className={SMALL_BUTTON} onClick={() => set('seen')}>
                      Marcar como visto
                    </button>
                  )}
                  {state !== 'resolved' && (
                    <button type="button" className={SMALL_BUTTON} onClick={() => set('resolved')}>
                      Marcar como resolvido
                    </button>
                  )}
                  {state === 'resolved' && (
                    <button type="button" className={SMALL_BUTTON} onClick={() => set('seen')}>
                      Reabrir
                    </button>
                  )}
                  <a href={detailHref(alert.astronautId, alert.panelId)} className={SMALL_BUTTON}>
                    Ver indicador
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="queue-title">
        <h2 id="queue-title" className="font-mono text-xs uppercase tracking-wider text-accent">
          Fila de envio para a Terra
        </h2>
        <p className="mb-3 text-sm text-ink-dim">
          Cada alerta vermelho gera um relatório. Atraso de comunicação simulado: {EARTH_DELAY_MIN} minutos (Marte),
          em tempo acelerado {TIME_ACCELERATION}× para a demonstração.
        </p>
        {reports.length === 0 && (
          <p className="rounded-lg border border-line bg-panel p-4 text-sm text-ink-dim">Nenhum relatório na fila.</p>
        )}
        {inTransit.length > 0 && (
          <ul aria-label="Relatórios em trânsito" aria-live="polite" className="mb-3 space-y-3">
            {inTransit.map(({ report, missionStart }) => (
              <ReportCard key={report.alertId} report={report} missionStart={missionStart} now={now} />
            ))}
          </ul>
        )}
        {delivered.length > 0 && (
          <details open={inTransit.length === 0 && delivered.length <= 3}>
            <summary className="cursor-pointer text-sm text-ink-dim hover:text-ink">
              Relatórios já recebidos na Terra ({delivered.length})
            </summary>
            <ul className="mt-3 space-y-3">
              {delivered.map(({ report, missionStart }) => (
                <ReportCard key={report.alertId} report={report} missionStart={missionStart} now={now} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <footer className="border-t border-line pt-4 text-sm text-ink-dim">
        <p>
          {localCount === 0
            ? 'Nenhuma medição registrada neste navegador ainda; os alertas acima vêm dos dados simulados.'
            : `${localCount} ${localCount === 1 ? 'medição registrada' : 'medições registradas'} neste navegador.`}
        </p>
        {confirmClear ? (
          <p className="mt-2 flex flex-wrap items-center gap-2">
            Apagar as medições registradas e a situação dos alertas?
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => {
                setConfirmClear(false)
                void clearLocalData()
              }}
            >
              Sim, apagar
            </button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setConfirmClear(false)}>
              Cancelar
            </button>
          </p>
        ) : (
          <button type="button" className={`mt-2 ${SMALL_BUTTON}`} onClick={() => setConfirmClear(true)}>
            Reiniciar a demonstração
          </button>
        )}
      </footer>
    </div>
  )
}
