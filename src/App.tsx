import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import {
  countLocalMeasurements,
  getAlertStatuses,
  getAstronauts,
  getBaselines,
  getBodyRegions,
  getIndicatorInfo,
  getMeasurements,
  subscribe,
} from './api'
import { DisclaimerBanner } from './components/DisclaimerBanner'
import { alertStatus, buildAlerts } from './lib/alerts'
import { buildPanelsFor } from './lib/dashboard'
import type { Panel } from './lib/dashboard'
import { dayLabel, missionDay } from './lib/format'
import { alertsHref, bodyHref, dashboardHref, detailHref, recordHref, testsHref, useRoute } from './lib/route'
import type { TestId } from './lib/route'
import { Alerts } from './pages/Alerts'
import { BodyMap } from './pages/BodyMap'
import { Dashboard } from './pages/Dashboard'
import { BackLink, IndicatorDetail } from './pages/IndicatorDetail'
import { RecordMeasurement } from './pages/RecordMeasurement'
import { Tests } from './pages/Tests'
import { INDICATORS } from './types'
import type { AlertStatus, Astronaut, Baseline, BodyRegion, IndicatorInfo, Measurement } from './types'

interface Data {
  measurements: Measurement[]
  baselines: Baseline[]
  alertStatuses: Record<string, AlertStatus>
  localCount: number
}

export default function App() {
  const route = useRoute()
  const [astronauts, setAstronauts] = useState<Astronaut[]>([])
  const [infos, setInfos] = useState<IndicatorInfo[]>([])
  const [regions, setRegions] = useState<BodyRegion[]>([])
  const [data, setData] = useState<Data>()
  const [error, setError] = useState<string>()
  /** Último astronauta aberto, para a tela de Alertas saber para onde voltar. */
  const [lastAstronautId, setLastAstronautId] = useState<string>()

  useEffect(() => {
    Promise.all([getAstronauts(), Promise.all(INDICATORS.map(getIndicatorInfo)), getBodyRegions()])
      .then(([crew, texts, body]) => {
        setAstronauts(crew)
        setInfos(texts)
        setRegions(body)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // Carrega tudo pelo api.ts e recarrega sempre que algo é salvo.
  useEffect(() => {
    let stale = false
    const reload = () =>
      Promise.all([getMeasurements(), getBaselines(), getAlertStatuses(), countLocalMeasurements()])
        .then(([measurements, baselines, alertStatuses, localCount]) => {
          if (!stale) setData({ measurements, baselines, alertStatuses, localCount })
        })
        .catch((e: Error) => setError(e.message))
    void reload()
    const unsubscribe = subscribe(() => void reload())
    return () => {
      stale = true
      unsubscribe()
    }
  }, [])

  const routeAstronaut = route.page === 'alerts' ? undefined : astronauts.find((a) => a.id === route.astronautId)
  const astronaut = routeAstronaut ?? astronauts.find((a) => a.id === lastAstronautId) ?? astronauts[0]

  useEffect(() => {
    if (routeAstronaut) setLastAstronautId(routeAstronaut.id)
  }, [routeAstronaut])

  // Cada página começa do topo (abrir uma região no mapa do corpo não é trocar de página).
  const pageKey = route.page === 'body' ? 'body' : `${route.page}/${route.panelId ?? ''}`
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  const panelsByAstronaut = useMemo(() => {
    const map = new Map<string, Panel[]>()
    if (data) {
      for (const a of astronauts) map.set(a.id, buildPanelsFor(a.id, data.measurements, data.baselines, infos))
    }
    return map
  }, [astronauts, data, infos])

  const alerts = useMemo(
    () => astronauts.flatMap((a) => buildAlerts(a.id, panelsByAstronaut.get(a.id) ?? [])),
    [astronauts, panelsByAstronaut],
  )
  const newAlerts = data ? alerts.filter((a) => alertStatus(a, data.alertStatuses) === 'new').length : 0

  const ready = astronaut && data && infos.length > 0
  const panels = (astronaut && panelsByAstronaut.get(astronaut.id)) || []
  const panel = route.page === 'detail' ? panels.find((p) => p.id === route.panelId) : undefined
  const lastTimestamp = panels
    .map((p) => p.history.at(-1)?.timestamp ?? '')
    .sort()
    .at(-1)
  const currentDay =
    astronaut && lastTimestamp ? dayLabel(missionDay(lastTimestamp, astronaut.mission_start)) : undefined

  const navLink = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'border-accent bg-panel-hi text-ink' : 'border-line bg-panel text-ink-dim hover:border-ink-dim hover:text-ink'
    }`
  const astronautHref = (id: string) =>
    route.page === 'detail' && route.panelId
      ? detailHref(id, route.panelId)
      : route.page === 'record'
        ? recordHref(id, route.panelId)
        : route.page === 'body'
          ? bodyHref(id, route.panelId)
          : route.page === 'tests'
            ? testsHref(id, route.panelId as TestId | undefined)
            : dashboardHref(id)

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        <DisclaimerBanner />
        <header className="mx-auto max-w-6xl px-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Painel médico de bordo</p>
              <p className="text-2xl font-semibold">
                <a href={astronaut ? dashboardHref(astronaut.id) : '#/'} className="hover:text-accent">
                  Monitor de Saúde da Tripulação
                </a>
              </p>
            </div>
            {astronaut && (
              <nav aria-label="Seções" className="flex flex-wrap gap-2">
                <a
                  href={dashboardHref(astronaut.id)}
                  aria-current={route.page === 'dashboard' ? 'page' : undefined}
                  className={navLink(route.page === 'dashboard' || route.page === 'detail')}
                >
                  Dashboard
                </a>
                <a
                  href={recordHref(astronaut.id)}
                  aria-current={route.page === 'record' ? 'page' : undefined}
                  className={navLink(route.page === 'record')}
                >
                  Registrar medição
                </a>
                <a
                  href={bodyHref(astronaut.id)}
                  aria-current={route.page === 'body' ? 'page' : undefined}
                  className={navLink(route.page === 'body')}
                >
                  Corpo
                </a>
                <a
                  href={testsHref(astronaut.id)}
                  aria-current={route.page === 'tests' ? 'page' : undefined}
                  className={navLink(route.page === 'tests')}
                >
                  Testes
                </a>
                <a
                  href={alertsHref()}
                  aria-current={route.page === 'alerts' ? 'page' : undefined}
                  className={navLink(route.page === 'alerts')}
                >
                  Alertas
                  {newAlerts > 0 && (
                    <span className="ml-2 rounded-full border border-line bg-void px-1.5 py-0.5 font-mono text-xs text-ink">
                      {newAlerts} <span className="font-sans font-normal">{newAlerts === 1 ? 'novo' : 'novos'}</span>
                    </span>
                  )}
                </a>
              </nav>
            )}
          </div>

          {route.page !== 'alerts' && (
            <nav aria-label="Astronauta" className="mt-4 flex flex-wrap gap-2">
              {astronauts.map((a) => {
                const current = a.id === astronaut?.id
                return (
                  <a
                    key={a.id}
                    // Trocar de astronauta mantém a página aberta.
                    href={astronautHref(a.id)}
                    aria-current={current ? 'page' : undefined}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      current
                        ? 'border-accent bg-panel-hi text-ink'
                        : 'border-line bg-panel text-ink-dim hover:border-ink-dim hover:text-ink'
                    }`}
                  >
                    <span className="block font-medium">{a.name}</span>
                    <span className="block text-xs text-ink-dim">{a.role}</span>
                  </a>
                )
              })}
            </nav>
          )}
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-12 pt-6">
          {error && (
            <p role="alert" className="rounded-md border border-line bg-panel p-4">
              <strong>Erro ao carregar os dados:</strong> {error}
            </p>
          )}
          {!error && !ready && <p className="text-ink-dim">Carregando dados…</p>}

          {ready && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${route.page}/${route.page === 'alerts' ? '' : astronaut.id}/${route.page === 'detail' || route.page === 'tests' ? (route.panelId ?? '') : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {route.page === 'dashboard' && (
                  <>
                    <h1 className="sr-only">Dashboard</h1>
                    <Dashboard astronaut={astronaut} panels={panels} currentDay={currentDay} />
                  </>
                )}
                {route.page === 'detail' && panel && (
                  <IndicatorDetail astronaut={astronaut} panel={panel} currentDay={currentDay} />
                )}
                {route.page === 'detail' && !panel && (
                  <div className="space-y-4">
                    <p role="alert" className="rounded-md border border-line bg-panel p-4">
                      Indicador “{route.panelId}” não encontrado.
                    </p>
                    <BackLink astronautId={astronaut.id} />
                  </div>
                )}
                {route.page === 'record' && (
                  <RecordMeasurement
                    astronaut={astronaut}
                    panels={panels}
                    baselines={data.baselines.filter((b) => b.astronaut_id === astronaut.id)}
                    panelId={route.panelId}
                  />
                )}
                {route.page === 'body' && (
                  <BodyMap astronaut={astronaut} panels={panels} regions={regions} regionId={route.panelId} />
                )}
                {route.page === 'tests' && (
                  <Tests
                    astronaut={astronaut}
                    panels={panels}
                    baselines={data.baselines.filter((b) => b.astronaut_id === astronaut.id)}
                    infos={infos}
                    testId={route.panelId}
                  />
                )}
                {route.page === 'alerts' && (
                  <Alerts
                    astronauts={astronauts}
                    alerts={alerts}
                    statuses={data.alertStatuses}
                    astronautId={route.astronautId}
                    localCount={data.localCount}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </MotionConfig>
  )
}
