// Tipos dos dados — espelham o contrato combinado com o backend (FastAPI + SQLite).

export const INDICATORS = [
  'bp_systolic',
  'bp_diastolic',
  'heart_rate',
  'temperature',
  'glucose',
  'spo2',
  'sleep',
  'mood',
  'exercise',
  'radiation',
  'reaction_time',
  // Grade de Amsler (teste de visão): total de áreas marcadas e quantas delas no centro.
  'amsler_marks',
  'amsler_central',
] as const

export type IndicatorId = (typeof INDICATORS)[number]

/** 'manual' = digitada pelo astronauta no formulário. */
export type MeasurementSource = 'wearable' | 'device' | 'self_report' | 'cognitive_test' | 'vision_test' | 'manual'

export interface Measurement {
  astronaut_id: string
  indicator: IndicatorId
  value: number
  unit: string
  /** ISO 8601, UTC */
  timestamp: string
  source: MeasurementSource
}

/** Linha de base pessoal, calculada sobre o pré-voo. */
export interface Baseline {
  astronaut_id: string
  indicator: IndicatorId
  mean: number
  std: number
}

export interface Astronaut {
  id: string
  name: string
  role: string
  /** Data (AAAA-MM-DD) do dia de missão 1; medições anteriores são pré-voo. */
  mission_start: string
}

/** verde = ok; amarelo = o astronauta age; vermelho = encaminhar ao médico de voo. */
export type Status = 'green' | 'yellow' | 'red'

/** Os 5 perigos do voo espacial segundo a NASA. */
export type HazardId = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment'

export interface Hazard {
  id: HazardId
  name: string
  /** Como este perigo se relaciona com o indicador. */
  relation: string
}

/** Texto explicativo de um indicador (knowledge/<indicador>.json). */
export interface IndicatorInfo {
  indicator: IndicatorId
  name: string
  short_name: string
  unit: string
  what: string
  why_in_space: string
  /** Quais dos 5 perigos do voo espacial (NASA) afetam este indicador, e como. */
  hazards: Hazard[]
  /** Passo a passo da medição. */
  how_to_measure: string[]
  explanations: Record<Status, string>
  actions: Record<Exclude<Status, 'green'>, string[]>
}

/** Situação de um alerta, dada pelo astronauta. */
export type AlertStatus = 'new' | 'seen' | 'resolved'

export type BodyRegionId = 'brain' | 'eyes' | 'heart' | 'lungs' | 'bones' | 'immune'

/** Região do mapa do corpo (knowledge/body.json). */
export interface BodyRegion {
  id: BodyRegionId
  name: string
  /** Função do órgão. */
  function: string
  in_space: string
  /** Ids dos painéis do dashboard ligados à região (ex.: "blood_pressure", "heart_rate"). */
  indicators: string[]
  /** Exames ligados à região que o protótipo ainda não registra. */
  untracked: { name: string; note: string }[]
}

export type EnvironmentId = 'iss' | 'moon' | 'mars_transit'

/** Ambiente da missão (knowledge/environments.json). */
export interface Environment {
  id: EnvironmentId
  name: string
  short_name: string
  /** Gravidade em relação à Terra (1 g). */
  gravity_g: number
  gravity_label: string
  /** Dose típica de radiação no ambiente, em mSv por dia. */
  radiation_msv_day: number
  radiation_note: string
  /** Atraso de comunicação com a Terra, em segundos, em cada sentido. */
  comm_delay_s: number
  comm_delay_label: string
  /** Por que a autoavaliação é necessária neste ambiente. */
  self_assessment: string
}

// --- Motor de regras do backend (fonte de verdade do nível) -----------------------------------

/** Níveis que o motor de regras emite (knowledge-base/protocols/alert-levels.md). */
export type BackendLevel = 'atencao' | 'alerta' | 'critico'

/** Nível mostrado no painel: os do backend + ausência de caso (normal) e leitura atrasada. */
export type Level = 'normal' | BackendLevel | 'sem-dado'

export type OperatingMode = 'assistido' | 'hibrido' | 'autonomo'

export interface OpenCase {
  case_id: string
  status: string
  level: BackendLevel
  directives: string[]
  summary: string
}

export interface RecentAlert {
  alert_id: string
  directive_id: string
  level: BackendLevel
  created_at: string
}

/** GET /api/astronauts/{id}/status */
export interface MissionStatus {
  astronaut_id: string
  mission_name: string
  mission_day: number | null
  mission_phase: string
  comm_latency_s: number | null
  operating_mode: OperatingMode
  casos_abertos: OpenCase[]
  alertas_recentes: RecentAlert[]
  indicadores: Partial<Record<IndicatorId, number | null>>
}

/** GET /api/astronauts/{id}/indicator-levels (só indicadores com diretiva disparada). */
export interface IndicatorLevel {
  level: BackendLevel
  directive_id: string
  reason: string
  privacy: 'normal' | 'restricted'
}

export type IndicatorLevels = Partial<Record<IndicatorId, IndicatorLevel>>

/** GET /api/indicator-thresholds: limiares absolutos das diretivas, já na escala do frontend. */
export interface DirectiveThreshold {
  directive_id: string
  level: BackendLevel
  op: '>' | '>=' | '<' | '<='
  value: number
  agg: string
  window: string | null
  description: string
}

export type IndicatorThresholds = Partial<Record<IndicatorId, DirectiveThreshold[]>>

/** GET /api/directives/{id} (só os campos que o painel usa). */
export interface Directive {
  id: string
  title: string
  summary?: string
  privacy?: 'normal' | 'restricted'
  actions?: Partial<Record<BackendLevel, string[]>>
  astronaut_message?: Partial<Record<BackendLevel, string>>
}

export interface CaseTimelineEntry {
  at: string
  type: string
  content: string
}

export interface CaseEvent {
  kind: string
  created_at: string
  recipient: string | null
  level_or_priority: string | null
  payload_json: string | null
  answered: number
  answer: string | null
}

export interface ExitCriterionStatus {
  description: string
  met: boolean
}

/** GET /api/cases/{id} */
export interface CaseDetail {
  case_id: string
  astronaut_id: string
  status: string
  level: BackendLevel
  directives: string[]
  opened_at: string
  closed_at: string | null
  summary: string
  next_review_at: string | null
  exit_criteria_status: ExitCriterionStatus[]
  timeline: CaseTimelineEntry[]
  events: CaseEvent[]
}

export interface TelemetryPoint {
  timestamp: string
  valor: number
}

/** GET /api/astronauts/{id}/telemetry */
export interface TelemetryResponse {
  astronaut_id: string
  window: string
  series: Record<string, TelemetryPoint[]>
}
