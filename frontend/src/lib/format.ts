const DAY_MS = 86_400_000

/** Dia de missão de um timestamp: 1 = primeiro dia; <= 0 = pré-voo. */
export function missionDay(timestamp: string, missionStart: string): number {
  const start = Date.parse(`${missionStart}T00:00:00Z`)
  return Math.floor((Date.parse(timestamp) - start) / DAY_MS) + 1
}

/** "Pré-voo −3" ou "Dia 12". */
export function dayLabel(day: number): string {
  return day >= 1 ? `Dia ${day}` : `Pré-voo −${1 - day}`
}

export function formatValue(value: number, unit: string): string {
  const decimals = unit === 'mSv' ? 3 : Number.isInteger(value) ? 0 : 1
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
}

/** Unidade como aparece na tela (humor é uma nota de 1 a 5). */
export function unitLabel(unit: string): string {
  return unit === '1-5' ? 'de 5' : unit
}
