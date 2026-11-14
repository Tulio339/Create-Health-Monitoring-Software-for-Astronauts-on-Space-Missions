// Única porta de acesso a dados do front.
// getAstronauts/getMeasurements/getBaselines chamam a API real (backend/api.py); o resto
// (textos de knowledge/, o que o astronauta registra) continua no localStorage do navegador
// (funciona offline). Ver ../../FLUXO.md para o mapeamento completo rota-a-rota.
import type {
  AlertStatus,
  Astronaut,
  Baseline,
  BodyRegion,
  CaseDetail,
  Directive,
  IndicatorLevels,
  IndicatorThresholds,
  MissionStatus,
  TelemetryResponse,
  Environment,
  EnvironmentId,
  IndicatorId,
  IndicatorInfo,
  Measurement,
} from './types'

// Pode ser trocado com VITE_API_BASE_URL (ver .env.example) se o backend rodar em outro host/porta.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const cache = new Map<string, Promise<unknown>>()

/** `path` já inclui query string quando houver (ex.: "/api/measurements?astronaut_id=AST-C"). */
function load<T>(path: string): Promise<T> {
  let pending = cache.get(path)
  if (!pending) {
    pending = fetch(`${API_BASE}${path}`).then((res) => {
      if (!res.ok) throw new Error(`Falha ao chamar ${path} (HTTP ${res.status}). O backend está rodando (python api.py)?`)
      return res.json()
    })
    pending.catch(() => cache.delete(path)) // não guardar erro em cache
    cache.set(path, pending)
  }
  return pending as Promise<T>
}

// --- Armazenamento local -----------------------------------------------------
// O localStorage pode falhar (modo privado, cota, bloqueio): nesse caso os dados
// ficam só em memória até a página ser recarregada, e o app continua funcionando.

const MEASUREMENTS_KEY = 'ahm:measurements:v1'
const ALERT_STATUS_KEY = 'ahm:alert-status:v1'
const ENVIRONMENT_KEY = 'ahm:environment:v1'
const memory = new Map<string, unknown>()

function readLocal<T>(key: string, fallback: T, isValid: (value: unknown) => boolean): T {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (isValid(parsed)) return parsed as T
  } catch {
    // dado ilegível ou armazenamento indisponível: usa o valor padrão
  }
  return fallback
}

function writeLocal(key: string, value: unknown): void {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // fica só em memória
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const localMeasurements = () => readLocal<Measurement[]>(MEASUREMENTS_KEY, [], Array.isArray)

// Quem mostra dados se inscreve para recarregar quando algo é salvo.
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = () => listeners.forEach((listener) => listener())

// --- Leitura -----------------------------------------------------------------

/** Forma crua de GET /api/astronauts (backend/api.py) — superset do que o frontend usa. */
interface BackendAstronaut {
  id: string
  name: string
  role: string
  /** AAAA-MM-DD; null se o astronauta ainda não recebeu nenhuma amostra de telemetria. */
  mission_start: string | null
}

// Astronautas sem telemetria ainda não têm mission_start calculável (ver motor.mission_start_date);
// cai no início da janela de exemplo do knowledge-base pra não quebrar o cálculo de dia de missão.
const FALLBACK_MISSION_START = '2026-11-07'

export async function getAstronauts(): Promise<Astronaut[]> {
  const rows = await load<BackendAstronaut[]>('/api/astronauts')
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    mission_start: r.mission_start ?? FALLBACK_MISSION_START,
  }))
}

export interface MeasurementFilter {
  astronautId?: string
  indicator?: IndicatorId
  /** Limites inclusivos, ISO 8601. */
  from?: string
  to?: string
}

/** Uma medição pode existir nos dois lados ao mesmo tempo: o navegador grava no localStorage
 * na hora (saveMeasurements) e manda pro backend em paralelo, de melhor esforço. Depois que o
 * POST é confirmado, a mesma medição também passa a vir da API — sem isso ela apareceria em
 * dobro no gráfico. Chave: astronauta+indicador+horário (o valor é o mesmo nos dois lados). */
function dedupeMeasurements(items: Measurement[]): Measurement[] {
  const porChave = new Map<string, Measurement>()
  for (const m of items) porChave.set(`${m.astronaut_id}|${m.indicator}|${m.timestamp}`, m)
  return [...porChave.values()]
}

/** Medições (API + registradas neste navegador) em ordem cronológica. */
export async function getMeasurements(filter: MeasurementFilter = {}): Promise<Measurement[]> {
  const path = filter.astronautId
    ? `/api/measurements?astronaut_id=${encodeURIComponent(filter.astronautId)}`
    : '/api/measurements'
  const all = dedupeMeasurements([...(await load<Measurement[]>(path)), ...localMeasurements()])
  const from = filter.from ? Date.parse(filter.from) : -Infinity
  const to = filter.to ? Date.parse(filter.to) : Infinity
  return all
    .filter((m) => {
      if (filter.astronautId && m.astronaut_id !== filter.astronautId) return false
      if (filter.indicator && m.indicator !== filter.indicator) return false
      const t = Date.parse(m.timestamp)
      return t >= from && t <= to
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/** Baseline pré-voo. O knowledge-base só guarda a média; `std` vem aproximado pelo backend
 * (5% da média) — não é um desvio-padrão medido. Ver GET /api/baselines em backend/api.py. */
export async function getBaselines(astronautId?: string): Promise<Baseline[]> {
  const path = astronautId ? `/api/baselines?astronaut_id=${encodeURIComponent(astronautId)}` : '/api/baselines'
  return load<Baseline[]>(path)
}

// --- Motor de regras (fonte de verdade do nível) ------------------------------

const enc = encodeURIComponent

/** Dia, fase, latência, modo de operação, casos abertos e alertas recentes. */
export const getStatus = (astronautId: string) => load<MissionStatus>(`/api/astronauts/${enc(astronautId)}/status`)

/** Nível de cada indicador segundo as diretivas disparadas (backend/api.py, niveis_por_indicador). */
export const getIndicatorLevels = (astronautId: string) =>
  load<IndicatorLevels>(`/api/astronauts/${enc(astronautId)}/indicator-levels`)

/** Limiares absolutos das diretivas por indicador (linhas tracejadas do gráfico de detalhe). */
export const getIndicatorThresholds = () => load<IndicatorThresholds>('/api/indicator-thresholds')

export const getDirective = (directiveId: string) => load<Directive>(`/api/directives/${enc(directiveId)}`)

export const getCase = (caseId: string) => load<CaseDetail>(`/api/cases/${enc(caseId)}`)

/** Dose de carreira já acumulada e taxa de dose, direto da telemetria (sem somar no navegador). */
export const getRadiationSeries = (astronautId: string, window = '30d') =>
  load<TelemetryResponse>(
    `/api/astronauts/${enc(astronautId)}/telemetry?metrics=radiation.cumulative_career_msv,radiation.dose_rate_msv_h&window=${window}`,
  )

// Rotas que não mudam durante a sessão ficam em cache; o resto é relido a cada atualização.
const STATIC_PREFIXES = ['/api/directives', '/api/indicator-thresholds']

/** Descarta os dados vivos do cache para a próxima leitura ir ao backend (atualização periódica). */
export function refreshLive(): void {
  for (const key of cache.keys()) if (!STATIC_PREFIXES.some((p) => key.startsWith(p))) cache.delete(key)
}

// Os textos ficam em knowledge/*.json, fora do código; o Vite os empacota
// como chunks carregados sob demanda, então continuam disponíveis offline.
const knowledge = import.meta.glob<IndicatorInfo>('../knowledge/*.json', { import: 'default' })

export function getIndicatorInfo(indicator: IndicatorId): Promise<IndicatorInfo> {
  const loader = knowledge[`../knowledge/${indicator}.json`]
  if (!loader) return Promise.reject(new Error(`Sem texto explicativo para "${indicator}"`))
  return loader()
}

/** Regiões do mapa do corpo e os indicadores ligados a cada uma (knowledge/body.json). */
export function getBodyRegions(): Promise<BodyRegion[]> {
  const loader = knowledge['../knowledge/body.json'] as unknown as (() => Promise<BodyRegion[]>) | undefined
  if (!loader) return Promise.reject(new Error('Sem knowledge/body.json'))
  return loader()
}

/** Ambientes de missão disponíveis no seletor (knowledge/environments.json). */
export function getEnvironments(): Promise<Environment[]> {
  const loader = knowledge['../knowledge/environments.json'] as unknown as (() => Promise<Environment[]>) | undefined
  if (!loader) return Promise.reject(new Error('Sem knowledge/environments.json'))
  return loader()
}

/** Ambiente escolhido no seletor; a ISS é o padrão (é o cenário dos dados simulados). */
export async function getEnvironmentId(): Promise<EnvironmentId> {
  return readLocal<EnvironmentId>(ENVIRONMENT_KEY, 'iss', (v) => v === 'iss' || v === 'moon' || v === 'mars_transit')
}

export async function setEnvironmentId(id: EnvironmentId): Promise<void> {
  writeLocal(ENVIRONMENT_KEY, id)
  notify()
}

// --- Escrita -----------------------------------------------------------------

/** Remove do cache as respostas que ficaram desatualizadas depois de uma escrita confirmada. */
function invalidate(prefix: string): void {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
}

/** Registra medições novas (uma, ou duas no caso da pressão arterial ou da grade de Amsler).
 *
 * Grava no localStorage na hora (a tela mostra o resultado sem esperar rede — funciona offline)
 * e manda pro backend em paralelo, de melhor esforço: se der erro (backend fora do ar, sem
 * rede), a medição continua valendo neste navegador, só não vira telemetria "de verdade" nem
 * passa pelo motor de regras (POST /api/measurements em backend/api.py) até a próxima tentativa. */
export async function saveMeasurements(measurements: Measurement[]): Promise<void> {
  writeLocal(MEASUREMENTS_KEY, [...localMeasurements(), ...measurements])
  notify()
  void fetch(`${API_BASE}/api/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(measurements),
  })
    .then(() => {
      invalidate('/api/measurements')
      invalidate('/api/astronauts') // status_geral pode ter mudado (motor de regras rodou de novo)
    })
    .catch(() => {
      // offline ou backend fora do ar: já está salvo no localStorage, que é a fonte usada pela UI.
    })
}

/** Quantas medições foram registradas neste navegador. */
export async function countLocalMeasurements(): Promise<number> {
  return localMeasurements().length
}

/** Situação dada pelo usuário a cada alerta (chave = Alert.stateKey). */
export async function getAlertStatuses(): Promise<Record<string, AlertStatus>> {
  return readLocal<Record<string, AlertStatus>>(ALERT_STATUS_KEY, {}, isRecord)
}

export async function setAlertStatus(stateKey: string, status: AlertStatus): Promise<void> {
  writeLocal(ALERT_STATUS_KEY, { ...(await getAlertStatuses()), [stateKey]: status })
  notify()
}

/** Apaga o que foi registrado neste navegador e volta ao mock original. */
export async function clearLocalData(): Promise<void> {
  writeLocal(MEASUREMENTS_KEY, [])
  writeLocal(ALERT_STATUS_KEY, {})
  notify()
}
