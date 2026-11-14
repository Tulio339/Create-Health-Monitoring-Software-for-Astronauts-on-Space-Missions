// Regras dos testes que rodam no próprio app (página Testes), separadas da tela.
import type { Reading } from './dashboard'

// --- Tempo de reação -----------------------------------------------------------

export const REACTION_ROUNDS = 5
/** Atraso aleatório antes do sinal, em ms. */
export const REACTION_MIN_DELAY_MS = 1000
export const REACTION_MAX_DELAY_MS = 4000
/** Respostas mais rápidas que isto são antecipação, não reação: ninguém reage tão rápido a um estímulo visual. */
export const REACTION_MIN_HUMAN_MS = 100

export function randomDelay(random: () => number = Math.random): number {
  return REACTION_MIN_DELAY_MS + random() * (REACTION_MAX_DELAY_MS - REACTION_MIN_DELAY_MS)
}

/** Clique antes do sinal, ou rápido demais para ser reação, é erro e a rodada se repete. */
export function isFalseStart(reactionMs: number | undefined): boolean {
  return reactionMs === undefined || reactionMs < REACTION_MIN_HUMAN_MS
}

/** Média das rodadas válidas, em ms inteiros. */
export function meanReaction(timesMs: number[]): number {
  if (timesMs.length === 0) return NaN
  return Math.round(timesMs.reduce((sum, t) => sum + t, 0) / timesMs.length)
}

// --- Grade de Amsler -------------------------------------------------------------

/** A grade tem AMSLER_SIZE × AMSLER_SIZE áreas marcáveis, numeradas por linha a partir de 0. */
export const AMSLER_SIZE = 10

export type Eye = 'right' | 'left'

/** As quatro áreas em volta do ponto de fixação são o centro da visão. */
export function isCentralArea(index: number): boolean {
  const row = Math.floor(index / AMSLER_SIZE)
  const col = index % AMSLER_SIZE
  const mid = AMSLER_SIZE / 2
  return (row === mid - 1 || row === mid) && (col === mid - 1 || col === mid)
}

export interface AmslerCounts {
  right: number
  left: number
  /** Soma dos dois olhos. */
  total: number
  /** Áreas marcadas no centro da visão, somando os dois olhos. */
  central: number
}

export function countAmsler(marks: Record<Eye, ReadonlySet<number>>): AmslerCounts {
  const central = (set: ReadonlySet<number>) => [...set].filter(isCentralArea).length
  return {
    right: marks.right.size,
    left: marks.left.size,
    total: marks.right.size + marks.left.size,
    central: central(marks.right) + central(marks.left),
  }
}

// --- Comum -----------------------------------------------------------------------

/** Horário de uma medição nova: agora, mas sempre depois da última leitura do painel. */
export function nextTimestamp(history: Reading[] = [], nowMs: number = Date.now()): string {
  const last = history.at(-1)
  return new Date(Math.max(nowMs, last ? Date.parse(last.timestamp) + 1000 : 0)).toISOString()
}
