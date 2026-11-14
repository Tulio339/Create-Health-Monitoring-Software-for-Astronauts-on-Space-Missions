// De onde veio a leitura: sensor da nave/wearable, digitada pelo astronauta ou teste do app.
import type { MeasurementSource } from '../types'

export type Origin = 'sensor' | 'manual' | 'teste'

const ORIGIN: Record<MeasurementSource, Origin> = {
  wearable: 'sensor',
  device: 'sensor',
  manual: 'manual',
  self_report: 'manual',
  cognitive_test: 'teste',
  vision_test: 'teste',
}

export const originOf = (source: MeasurementSource): Origin => ORIGIN[source] ?? 'sensor'
