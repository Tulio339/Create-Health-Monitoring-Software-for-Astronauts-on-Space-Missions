// Alertas e relatórios para a Terra, derivados das leituras dos painéis.
//
// Um alerta é um EPISÓDIO: começa quando um indicador sai do verde e termina quando
// volta ao verde. O nível do alerta é o pior status atingido no episódio.
// Assim, 20 dias seguidos de sono ruim geram um alerta, não vinte.
//
// Todo alerta vermelho gera um relatório para a Terra, que entra na fila de envio
// no instante da medição que o deixou vermelho e leva o atraso de comunicação do
// ambiente da missão (ISS, Lua, trânsito para Marte) para chegar.
import type { AlertStatus, Astronaut } from '../types'
import type { Panel, PanelId, Reading } from './dashboard'

export interface Alert {
  id: string
  /** Chave da situação dada pelo usuário; muda se o alerta piorar, para ele voltar a "novo". */
  stateKey: string
  astronautId: string
  panelId: PanelId
  title: string
  unit: string
  level: 'yellow' | 'red'
  startedAt: string
  /** Primeira leitura no pior nível do episódio (a que gerou o alerta nesse nível). */
  trigger: Reading
  /** Leitura mais recente do episódio. */
  latest: Reading
  /** Horário da leitura em que o indicador voltou ao verde; ausente se o episódio continua. */
  endedAt?: string
  /** Texto de tendência no momento da leitura que gerou o alerta. */
  trend: string
}

const num = (value: number, decimals = 1) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals })

/** Quantas leituras anteriores entram na comparação de tendência. */
export const TREND_WINDOW = 7

/** Compara a leitura `index` com a média das leituras anteriores. */
export function describeTrend(panel: Pick<Panel, 'id' | 'unit'>, history: Reading[], index: number): string {
  const previous = history.slice(Math.max(0, index - TREND_WINDOW), index)
  if (previous.length === 0) return 'sem medições anteriores para comparar'
  const mean = previous.reduce((sum, r) => sum + r.value, 0) / previous.length
  const delta = history[index].value - mean
  const unit = panel.id === 'radiation' ? 'mSv' : panel.unit
  const subject = panel.id === 'blood_pressure' ? 'sistólica ' : ''
  const decimals = panel.id === 'radiation' ? 2 : 1
  const window = previous.length === 1 ? 'à medição anterior' : `à média das ${previous.length} medições anteriores`
  if (Math.abs(delta) <= Math.abs(mean) * 0.03) {
    return `${subject}estável em relação ${window} (${num(mean, decimals)} ${unit})`
  }
  const sign = delta > 0 ? '+' : '−'
  return `${subject}em ${delta > 0 ? 'alta' : 'queda'}: ${sign}${num(Math.abs(delta), decimals)} ${unit} em relação ${window} (${num(mean, decimals)} ${unit})`
}

export function buildAlerts(astronautId: string, panels: Panel[]): Alert[] {
  const alerts: Alert[] = []
  for (const panel of panels) {
    let open: Alert | undefined
    panel.history.forEach((reading, index) => {
      const { status } = reading.classification
      if (status === 'green') {
        if (open) open.endedAt = reading.timestamp
        open = undefined
        return
      }
      if (!open) {
        const id = `${astronautId}:${panel.id}:${reading.timestamp}`
        open = {
          id,
          stateKey: `${id}:${status}`,
          astronautId,
          panelId: panel.id,
          title: panel.title,
          unit: panel.unit,
          level: status,
          startedAt: reading.timestamp,
          trigger: reading,
          latest: reading,
          trend: describeTrend(panel, panel.history, index),
        }
        alerts.push(open)
        return
      }
      open.latest = reading
      if (status === 'red' && open.level === 'yellow') {
        open.level = 'red'
        open.stateKey = `${open.id}:red`
        open.trigger = reading
        open.trend = describeTrend(panel, panel.history, index)
      }
    })
  }
  // Mais recentes primeiro (pelo momento em que chegaram ao nível atual).
  return alerts.sort((a, b) => b.trigger.timestamp.localeCompare(a.trigger.timestamp))
}

/**
 * Situação do alerta: a que o usuário deu, se deu; senão, "resolvido" quando o
 * indicador já voltou ao normal e "novo" enquanto o episódio continua.
 */
export function alertStatus(alert: Alert, stored: Record<string, AlertStatus>): AlertStatus {
  return stored[alert.stateKey] ?? (alert.endedAt ? 'resolved' : 'new')
}

// --- Relatório para a Terra ----------------------------------------------------

/** Tempo acelerado para a demonstração: 60× = 20 minutos de atraso passam em 20 segundos. */
export const TIME_ACCELERATION = 60

export interface EarthReport {
  alertId: string
  astronautId: string
  astronaut: string
  role: string
  indicator: string
  value: string
  status: string
  reason: string
  trend: string
  /** Horário da medição (ISO 8601). */
  measuredAt: string
  /** Momento real (ms) em que entrou na fila e em que chega à Terra. */
  queuedAtMs: number
  deliveredAtMs: number
}

/** `delaySeconds` = atraso de comunicação com a Terra no ambiente atual (um sentido). */
export function buildReport(alert: Alert, astronaut: Astronaut, delaySeconds: number): EarthReport | undefined {
  if (alert.level !== 'red') return undefined
  const queuedAtMs = Date.parse(alert.trigger.timestamp)
  return {
    alertId: alert.id,
    astronautId: astronaut.id,
    astronaut: astronaut.name,
    role: astronaut.role,
    indicator: alert.title,
    value: `${alert.trigger.display} ${alert.unit}`,
    status: 'Vermelho — encaminhar ao médico de voo',
    reason: alert.trigger.classification.reason,
    trend: alert.trend,
    measuredAt: alert.trigger.timestamp,
    queuedAtMs,
    deliveredAtMs: queuedAtMs + (delaySeconds * 1000) / TIME_ACCELERATION,
  }
}

export interface Transmission {
  delivered: boolean
  /** 0 a 1. */
  progress: number
  /** Tempo simulado que falta, em segundos. */
  remainingSimSeconds: number
}

export function transmission(report: EarthReport, nowMs: number): Transmission {
  const total = report.deliveredAtMs - report.queuedAtMs
  const remaining = Math.max(0, report.deliveredAtMs - nowMs)
  return {
    delivered: remaining === 0,
    progress: total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1,
    remainingSimSeconds: Math.ceil((remaining * TIME_ACCELERATION) / 1000),
  }
}
