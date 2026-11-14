// Única porta de acesso a dados do front.
// Hoje lê os arquivos estáticos de /public/mock e guarda o que o astronauta registra
// no localStorage do navegador (funciona offline). Quando o backend existir, basta
// trocar o corpo das funções deste arquivo — as telas não mudam.
import type {
  AlertStatus,
  Astronaut,
  Baseline,
  BodyRegion,
  Environment,
  EnvironmentId,
  IndicatorId,
  IndicatorInfo,
  Measurement,
} from './types'

const MOCK_BASE = `${import.meta.env.BASE_URL}mock`

const cache = new Map<string, Promise<unknown>>()

function load<T>(resource: 'astronauts' | 'measurements' | 'baselines'): Promise<T> {
  let pending = cache.get(resource)
  if (!pending) {
    pending = fetch(`${MOCK_BASE}/${resource}.json`).then((res) => {
      if (!res.ok) throw new Error(`Falha ao carregar ${resource} (HTTP ${res.status})`)
      return res.json()
    })
    pending.catch(() => cache.delete(resource)) // não guardar erro em cache
    cache.set(resource, pending)
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

export function getAstronauts(): Promise<Astronaut[]> {
  return load<Astronaut[]>('astronauts')
}

export interface MeasurementFilter {
  astronautId?: string
  indicator?: IndicatorId
  /** Limites inclusivos, ISO 8601. */
  from?: string
  to?: string
}

/** Medições (mock + registradas neste navegador) em ordem cronológica. */
export async function getMeasurements(filter: MeasurementFilter = {}): Promise<Measurement[]> {
  const all = [...(await load<Measurement[]>('measurements')), ...localMeasurements()]
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

export async function getBaselines(astronautId?: string): Promise<Baseline[]> {
  const all = await load<Baseline[]>('baselines')
  return astronautId ? all.filter((b) => b.astronaut_id === astronautId) : all
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

/** Registra medições novas (uma, ou duas no caso da pressão arterial). */
export async function saveMeasurements(measurements: Measurement[]): Promise<void> {
  writeLocal(MEASUREMENTS_KEY, [...localMeasurements(), ...measurements])
  notify()
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
