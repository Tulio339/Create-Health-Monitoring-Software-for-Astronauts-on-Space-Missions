// Grade de Amsler: o astronauta olha para o ponto central, um olho de cada vez,
// e marca as áreas onde vê linhas tortas, borradas ou ausentes.
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { saveMeasurements } from '../api'
import { classifyAmsler } from '../lib/classify'
import type { Panel } from '../lib/dashboard'
import { dashboardHref, detailHref } from '../lib/route'
import { AMSLER_SIZE, countAmsler, isCentralArea, nextTimestamp } from '../lib/selfTests'
import type { Eye } from '../lib/selfTests'
import type { Astronaut, IndicatorInfo, Measurement } from '../types'
import { TestResult } from './TestResult'

interface Props {
  astronaut: Astronaut
  /** Textos da grade de Amsler (knowledge/amsler_marks.json). */
  info: IndicatorInfo
  /** Painel com o histórico, se já houver alguma medição. */
  panel?: Panel
}

type Step = 'instructions' | Eye | 'result'

const EYES: Record<Eye, { name: string; cover: string }> = {
  right: { name: 'Olho direito', cover: 'Cubra o olho ESQUERDO com a mão, sem apertar.' },
  left: { name: 'Olho esquerdo', cover: 'Cubra o olho DIREITO com a mão, sem apertar.' },
}

const BUTTON = 'rounded-md border px-4 py-2 text-sm font-semibold transition-colors'
const PRIMARY = `${BUTTON} border-accent bg-accent text-void hover:bg-accent/85`
const SECONDARY = `${BUTTON} border-line bg-panel text-ink hover:border-ink-dim`

const CELLS = Array.from({ length: AMSLER_SIZE * AMSLER_SIZE }, (_, i) => i)
// Linhas finas a cada 5% (grade de 20 × 20), desenhadas em CSS.
const GRID_LINES = {
  backgroundImage:
    'linear-gradient(to right, rgb(230 237 247 / 0.85) 1px, transparent 1px), linear-gradient(to bottom, rgb(230 237 247 / 0.85) 1px, transparent 1px)',
  backgroundSize: '5% 5%',
}

function AmslerGrid({ eye, marks, onToggle }: { eye: Eye; marks: ReadonlySet<number>; onToggle: (index: number) => void }) {
  const [focusIndex, setFocusIndex] = useState(0)
  const grid = useRef<HTMLDivElement>(null)

  // Setas movem o foco entre as áreas; Enter ou espaço marca (comportamento do botão).
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = Math.floor(index / AMSLER_SIZE)
    const col = index % AMSLER_SIZE
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const nextRow = Math.min(AMSLER_SIZE - 1, Math.max(0, row + move[0]))
    const nextCol = Math.min(AMSLER_SIZE - 1, Math.max(0, col + move[1]))
    const next = nextRow * AMSLER_SIZE + nextCol
    setFocusIndex(next)
    grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
  }

  return (
    <div
      ref={grid}
      role="group"
      aria-label={`Grade de Amsler, ${EYES[eye].name.toLowerCase()}. Use as setas para mover e Enter para marcar uma área.`}
      className="relative mx-auto aspect-square w-full max-w-[420px] border border-ink bg-void"
      style={GRID_LINES}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${AMSLER_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${AMSLER_SIZE}, minmax(0, 1fr))`,
        }}
      >
        {CELLS.map((index) => {
          const marked = marks.has(index)
          const row = Math.floor(index / AMSLER_SIZE) + 1
          const col = (index % AMSLER_SIZE) + 1
          return (
            <button
              key={index}
              type="button"
              data-cell={index}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-pressed={marked}
              aria-label={`Linha ${row}, coluna ${col}${isCentralArea(index) ? ', centro' : ''}${marked ? ', marcada' : ''}`}
              onClick={() => {
                setFocusIndex(index)
                onToggle(index)
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden outline-offset-[-3px] ${
                marked ? 'bg-status-yellow/55 hover:bg-status-yellow/70' : 'hover:bg-ink/15'
              }`}
            >
              {marked && (
                <span aria-hidden="true" className="font-mono text-lg font-bold leading-none text-void">
                  ✕
                </span>
              )}
            </button>
          )
        })}
      </div>
      {/* Ponto de fixação */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-void"
      />
    </div>
  )
}

export function AmslerTest({ astronaut, info, panel }: Props) {
  const [step, setStep] = useState<Step>('instructions')
  const [marks, setMarks] = useState<Record<Eye, Set<number>>>({ right: new Set(), left: new Set() })
  const [saved, setSaved] = useState(false)

  const restart = () => {
    setMarks({ right: new Set(), left: new Set() })
    setSaved(false)
    setStep('instructions')
  }
  const toggle = (eye: Eye, index: number) =>
    setMarks((current) => {
      const next = new Set(current[eye])
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { ...current, [eye]: next }
    })

  if (step === 'instructions') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">Antes de começar</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-mono marker:text-ink-dim">
            {info.how_to_measure.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-ink-dim">
          O teste tem duas etapas, uma para cada olho. Se todas as linhas parecerem retas e completas, não marque nada.
        </p>
        <button type="button" className={PRIMARY} onClick={() => setStep('right')}>
          Começar pelo olho direito
        </button>
      </div>
    )
  }

  if (step === 'right' || step === 'left') {
    const eye = step
    const count = marks[eye].size
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-accent">
            Etapa {eye === 'right' ? 1 : 2} de 2 · {EYES[eye].name}
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:font-mono marker:text-ink-dim">
            <li className="font-semibold">{EYES[eye].cover}</li>
            <li>Segure a tela a cerca de 30 cm e olhe fixamente para o ponto central.</li>
            <li>Sem mover o olhar, toque nas áreas onde as linhas parecem tortas, borradas ou ausentes.</li>
          </ol>
        </div>

        <AmslerGrid key={eye} eye={eye} marks={marks[eye]} onToggle={(index) => toggle(eye, index)} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p role="status" className="text-sm">
            <span className="font-mono font-semibold tabular-nums">{count}</span>{' '}
            {count === 1 ? 'área marcada' : 'áreas marcadas'} no {EYES[eye].name.toLowerCase()}
          </p>
          {count > 0 && (
            <button
              type="button"
              className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-ink-dim"
              onClick={() => setMarks((current) => ({ ...current, [eye]: new Set() }))}
            >
              Limpar marcações
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} onClick={() => setStep(eye === 'right' ? 'left' : 'result')}>
            {eye === 'right' ? 'Próximo: olho esquerdo' : 'Ver resultado'}
          </button>
          <button type="button" className={SECONDARY} onClick={() => setStep(eye === 'right' ? 'instructions' : 'right')}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const counts = countAmsler(marks)
  const save = async () => {
    const timestamp = nextTimestamp(panel?.history)
    const make = (indicator: 'amsler_marks' | 'amsler_central', value: number): Measurement => ({
      astronaut_id: astronaut.id,
      indicator,
      value,
      unit: info.unit,
      timestamp,
      source: 'vision_test',
    })
    await saveMeasurements([make('amsler_marks', counts.total), make('amsler_central', counts.central)])
    setSaved(true)
  }
  return (
    <div className="space-y-4">
      <TestResult
        title="Grade de Amsler"
        value={String(counts.total)}
        unit={counts.total === 1 ? 'área marcada' : 'áreas marcadas'}
        classification={classifyAmsler(counts.total, counts.central)}
        info={info}
        astronautId={astronaut.id}
        saved={saved}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-dim">Olho direito</dt>
          <dd className="font-mono tabular-nums">{counts.right}</dd>
          <dt className="text-ink-dim">Olho esquerdo</dt>
          <dd className="font-mono tabular-nums">{counts.left}</dd>
          <dt className="text-ink-dim">No centro da visão</dt>
          <dd className="font-mono tabular-nums">{counts.central}</dd>
        </dl>
      </TestResult>
      <div className="flex flex-wrap gap-2">
        {!saved && (
          <button type="button" className={PRIMARY} onClick={() => void save()}>
            Salvar resultado
          </button>
        )}
        {!saved && (
          <button type="button" className={SECONDARY} onClick={() => setStep('left')}>
            Voltar e corrigir
          </button>
        )}
        <button type="button" className={saved ? PRIMARY : SECONDARY} onClick={restart}>
          {saved ? 'Fazer de novo' : 'Recomeçar sem salvar'}
        </button>
        {saved && (
          <>
            <a href={detailHref(astronaut.id, 'amsler')} className={SECONDARY}>
              Ver o histórico
            </a>
            <a href={dashboardHref(astronaut.id)} className={SECONDARY}>
              Voltar ao dashboard
            </a>
          </>
        )}
      </div>
    </div>
  )
}
