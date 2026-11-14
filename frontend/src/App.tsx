import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import {
  countLocalMeasurements,
  getAlertStatuses,
  getAstronauts,
  getBaselines,
  getBodyRegions,
  getEnvironmentId,
  getEnvironments,
  getIndicatorInfo,
  getIndicatorLevels,
  getIndicatorThresholds,
  getMeasurements,
  getRadiationSeries,
  getStatus,
  refreshLive,
  subscribe,
} from './api'
import { DisclaimerBanner } from './components/DisclaimerBanner'
import { MissionBar } from './components/painel/MissionBar'
import { alertStatus, buildAlerts } from './lib/alerts'
import { PANEL_IDS, buildPanelsFor } from './lib/dashboard'
import type { Panel, PanelId } from './lib/dashboard'
import { panelLevel } from './lib/levels'
import { meanRate } from './lib/radiation'
import { alertsHref, bodyHref, dashboardHref, detailHref, recordHref, testsHref, useRoute } from './lib/route'
import type { TestId } from './lib/route'
import { useLive } from './lib/useLive'
import { Alerts } from './pages/Alerts'
import { BodyMap } from './pages/BodyMap'
import { CaseTimeline } from './pages/CaseTimeline'
import { BackLink, IndicatorDetail } from './pages/IndicatorDetail'
import { Painel } from './pages/Painel'
import { RecordMeasurement } from './pages/RecordMeasurement'
import { Tests } from './pages/Tests'
import { INDICATORS } from './types'
import type {
  AlertStatus,
  Astronaut,
  Baseline,
  BodyRegion,
  Environment,
  EnvironmentId,
  IndicatorInfo,
  Measurement,
} from './types'

interface Data {
  measurements: Measurement[]
  baselines: Baseline[]
  alertStatuses: Record<string, AlertStatus>
  localCount: number
  environmentId: EnvironmentId
}

const POLL_MS = 5000
const OFFLINE_HINT = 'Backend fora do ar. Rode `python api.py` em `backend/`.'

const isPanelId = (id: string | undefined): id is PanelId => !!id && (PANEL_IDS as readonly string[]).includes(id)

// Humor e estresse são restritos (DIR-ISO-002): nunca entram em visão de tripulação.
const RESTRICTED_PANELS: readonly PanelId[] = ['mood']

export default function App() {
  const route = useRoute()
  const [astronauts, setAstronauts] = useState<Astronaut[]>([])
  const [infos, setInfos] = useState<IndicatorInfo[]>([])
  const [regions, setRegions] = useState<BodyRegion[]>([])
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [data, setData] = useState<Data>()
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  /** Último astronauta aberto, para a tela de Alertas saber para onde voltar. */
  const [lastAstronautId, setLastAstronautId] = useState<string>()

  // Atualização periódica (acompanha sensores_kb.py ao vivo) e depois de cada registro.
  useEffect(() => {
    const bump = () => {
      refreshLive()
      setTick((t) => t + 1)
    }
    const timer = window.setInterval(bump, POLL_MS)
    const unsubscribe = subscribe(bump)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    Promise.all([Promise.all(INDICATORS.map(getIndicatorInfo)), getBodyRegions(), getEnvironments()])
      .then(([texts, body, envs]) => {
        setInfos(texts)
        setRegions(body)
        setEnvironments(envs)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    let stale = false
    Promise.all([
      getAstronauts(),
      getMeasurements(),
      getBaselines(),
      getAlertStatuses(),
      countLocalMeasurements(),
      getEnvironmentId(),
    ])
      .then(([crew, measurements, baselines, alertStatuses, localCount, environmentId]) => {
        if (stale) return
        setAstronauts(crew)
        setData({ measurements, baselines, alertStatuses, localCount, environmentId })
        setError(undefined)
      })
      .catch(() => !stale && setError(OFFLINE_HINT))
    return () => {
      stale = true
    }
  }, [tick])

  const routeAstronaut = route.page === 'alerts' ? undefined : astronauts.find((a) => a.id === route.astronautId)
  const astronaut = routeAstronaut ?? astronauts.find((a) => a.id === lastAstronautId) ?? astronauts[0]

  useEffect(() => {
    if (routeAstronaut) setLastAstronautId(routeAstronaut.id)
  }, [routeAstronaut])

  const pageKey = route.page === 'body' ? 'body' : `${route.page}/${route.panelId ?? ''}`
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  const aid = astronaut?.id
  const status = useLive(aid && `status/${aid}`, () => getStatus(aid!), tick)
  const levels = useLive(aid && `levels/${aid}`, () => getIndicatorLevels(aid!), tick)
  const thresholds = useLive('thresholds', getIndicatorThresholds, tick)
  const radiation = useLive(aid && `rad/${aid}`, () => getRadiationSeries(aid!), tick)

  const panelsByAstronaut = useMemo(() => {
    const map = new Map<string, Panel[]>()
    if (data) {
      for (const a of astronauts) map.set(a.id, buildPanelsFor(a.id, data.measurements, data.baselines, infos))
    }
    return map
  }, [astronauts, data, infos])

  // Visão de tripulação: sem os indicadores restritos.
  const crewAlerts = useMemo(
    () =>
      astronauts.flatMap((a) =>
        buildAlerts(a.id, (panelsByAstronaut.get(a.id) ?? []).filter((p) => !RESTRICTED_PANELS.includes(p.id))),
      ),
    [astronauts, panelsByAstronaut],
  )
  const newAlerts = data ? crewAlerts.filter((a) => alertStatus(a, data.alertStatuses) === 'new').length : 0

  const panels = (astronaut && panelsByAstronaut.get(astronaut.id)) || []
  // Relógio da missão: a leitura mais recente do astronauta (os cenários simulados têm datas fixas).
  const lastTs = panels.map((p) => p.history.at(-1)?.timestamp ?? '').sort().at(-1)
  const nowMs = lastTs ? Date.parse(lastTs) : Date.now()

  const levelsSettled = levels.data !== undefined || levels.error !== undefined
  const offline = levels.data === undefined && levels.error !== undefined
  const ready = astronaut && data && infos.length > 0 && levelsSettled

  const career = radiation.data?.series['radiation.cumulative_career_msv']
  const rates = radiation.data?.series['radiation.dose_rate_msv_h']
  const environment = data && environments.find((e) => e.id === data.environmentId)

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

  const navLink = (active: boolean) => `py-1 ${active ? 'text-ink border-b border-accent' : 'text-ink-dim hover:text-ink'}`
  const detailPanelId = route.page === 'detail' && isPanelId(route.panelId) ? route.panelId : undefined
  const detailPanel = detailPanelId ? panels.find((p) => p.id === detailPanelId) : undefined
  const detailLevel = detailPanel
    ? panelLevel(detailPanel, levels.data, nowMs)
    : { level: 'sem-dado' as const, reason: undefined }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        {astronaut && route.page !== 'alerts' && (
          <MissionBar
            astronauts={astronauts}
            current={astronaut}
            hrefFor={astronautHref}
            status={status.data}
            environment={environment}
            offline={offline}
          />
        )}

        {astronaut && (
          <nav aria-label="Seções" className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 pt-4 text-sm">
            <a href={dashboardHref(astronaut.id)} className={navLink(['dashboard', 'detail', 'case'].includes(route.page))}>
              Painel
            </a>
            <a href={recordHref(astronaut.id)} className={navLink(route.page === 'record')}>
              Registrar
            </a>
            <a href={bodyHref(astronaut.id)} className={navLink(route.page === 'body')}>
              Corpo
            </a>
            <a href={testsHref(astronaut.id)} className={navLink(route.page === 'tests')}>
              Testes
            </a>
            <a href={alertsHref()} className={navLink(route.page === 'alerts')}>
              Alertas da tripulação
              {newAlerts > 0 && <span className="tnum ml-1.5 text-xs text-ink-faint">({newAlerts})</span>}
            </a>
          </nav>
        )}

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-12">
          {error && (
            <p role="alert" className="mb-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
              {data ? 'Sem conexão: mostrando os últimos dados recebidos. ' : ''}
              {error}
            </p>
          )}

          {!ready && !(error && !data) && <Skeleton />}

          {ready && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${route.page}/${route.page === 'alerts' || route.page === 'body' ? '' : astronaut.id}/${route.page === 'detail' || route.page === 'tests' || route.page === 'case' ? (route.panelId ?? '') : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {(route.page === 'dashboard' || route.page === 'mission') && (
                  <>
                    <h1 className="sr-only">Painel de {astronaut.name}</h1>
                    <Painel
                      astronaut={astronaut}
                      panels={panels}
                      regions={regions}
                      infos={infos}
                      status={status.data}
                      levels={levels.data}
                      radiation={{ careerMsv: career?.at(-1)?.valor, rateMsvH: rates && meanRate(rates) }}
                      nowMs={nowMs}
                      tick={tick}
                    />
                  </>
                )}
                {detailPanelId && (
                  <IndicatorDetail
                    astronaut={astronaut}
                    panelId={detailPanelId}
                    panel={detailPanel}
                    infos={infos}
                    level={detailPanelId === 'radiation' && levels.data?.radiation ? levels.data.radiation.level : detailLevel.level}
                    reason={detailPanelId === 'radiation' ? levels.data?.radiation?.reason : detailLevel.reason}
                    directiveId={
                      detailPanelId === 'blood_pressure'
                        ? (levels.data?.bp_systolic ?? levels.data?.bp_diastolic)?.directive_id
                        : detailPanelId === 'amsler'
                          ? undefined
                          : levels.data?.[detailPanelId]?.directive_id
                    }
                    thresholds={thresholds.data}
                    radiationCareer={career}
                    nowMs={nowMs}
                    tick={tick}
                  />
                )}
                {route.page === 'detail' && !detailPanelId && (
                  <div className="space-y-4">
                    <p role="alert" className="text-sm">
                      Indicador “{route.panelId}” não encontrado.
                    </p>
                    <BackLink astronautId={astronaut.id} />
                  </div>
                )}
                {route.page === 'case' && route.panelId && (
                  <CaseTimeline astronautId={astronaut.id} caseId={route.panelId} tick={tick} />
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
                  <BodyMap
                    astronaut={astronaut}
                    panels={panels}
                    regions={regions}
                    regionId={route.panelId}
                    environments={environments}
                    environmentId={data.environmentId}
                  />
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
                    alerts={crewAlerts}
                    statuses={data.alertStatuses}
                    astronautId={route.astronautId}
                    localCount={data.localCount}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <DisclaimerBanner />
      </div>
    </MotionConfig>
  )
}

// Esqueleto só no primeiro carregamento; depois os dados antigos ficam na tela enquanto atualiza.
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-8">
      <div className="h-14 rounded-lg bg-panel" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-40 rounded-lg bg-panel" />
        ))}
      </div>
    </div>
  )
}

