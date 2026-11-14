// Teste de tempo de reação: o painel muda após um atraso aleatório e o astronauta
// responde o mais rápido possível. Clique antes do sinal é erro e a rodada se repete.
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { saveMeasurements } from '../api'
import { classify } from '../lib/classify'
import type { Panel } from '../lib/dashboard'
import { dashboardHref, detailHref } from '../lib/route'
import {
  REACTION_MIN_HUMAN_MS,
  REACTION_ROUNDS,
  isFalseStart,
  meanReaction,
  nextTimestamp,
  randomDelay,
} from '../lib/selfTests'
import { validateValue } from '../lib/validate'
import type { Astronaut, Baseline } from '../types'
import { TestResult } from './TestResult'

interface Props {
  astronaut: Astronaut
  /** Painel de tempo de reação do astronauta (histórico e textos). */
  panel: Panel
  baseline?: Baseline
}

type Phase = 'idle' | 'waiting' | 'go' | 'feedback' | 'done'

const BUTTON = 'rounded-md border px-4 py-2 text-sm font-semibold transition-colors'
const PRIMARY = `${BUTTON} border-accent bg-accent text-void hover:bg-accent/85`
const SECONDARY = `${BUTTON} border-line bg-panel text-ink hover:border-ink-dim`

export function ReactionTest({ astronaut, panel, baseline }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [times, setTimes] = useState<number[]>([])
  const [falseStarts, setFalseStarts] = useState(0)
  /** Mensagem da última tentativa. */
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>()
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const signalAt = useRef(0)
  const stage = useRef<HTMLButtonElement>(null)

  const clearTimer = () => window.clearTimeout(timer.current)
  useEffect(() => clearTimer, [])

  const startRound = () => {
    clearTimer()
    setPhase('waiting')
    timer.current = window.setTimeout(() => setPhase('go'), randomDelay())
  }

  // O cronômetro começa quando o sinal entra na tela.
  useEffect(() => {
    if (phase === 'go') signalAt.current = performance.now()
    // O painel só aceita foco depois de habilitado; assim o teclado funciona desde a 1ª rodada.
    if (phase === 'waiting') stage.current?.focus()
  }, [phase])

  const start = () => {
    setTimes([])
    setFalseStarts(0)
    setFeedback(undefined)
    setSaved(false)
    startRound()
    stage.current?.focus()
  }

  /** Toque, clique ou tecla no painel. */
  const respond = () => {
    if (phase === 'waiting' || phase === 'go') {
      const reaction = phase === 'go' ? performance.now() - signalAt.current : undefined
      clearTimer()
      if (isFalseStart(reaction)) {
        setFalseStarts((n) => n + 1)
        setFeedback({ text: 'Clique antecipado: conta como erro. A rodada será repetida.', error: true })
      } else {
        const ms = Math.round(reaction!)
        const next = [...times, ms]
        setTimes(next)
        setFeedback({ text: `Rodada ${next.length}: ${ms} ms`, error: false })
        if (next.length >= REACTION_ROUNDS) {
          setPhase('done')
          return
        }
      }
      setPhase('feedback')
      timer.current = window.setTimeout(startRound, 1200)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault()
      respond()
    }
  }

  const mean = meanReaction(times)
  const round = Math.min(times.length + 1, REACTION_ROUNDS)

  if (phase === 'done') {
    const info = panel.infos[0]
    const problem = validateValue('reaction_time', mean)
    const save = async () => {
      await saveMeasurements([
        {
          astronaut_id: astronaut.id,
          indicator: 'reaction_time',
          value: mean,
          unit: info.unit,
          timestamp: nextTimestamp(panel.history),
          source: 'cognitive_test',
        },
      ])
      setSaved(true)
    }
    return (
      <div className="space-y-4">
        <TestResult
          title="Tempo de reação"
          value={String(mean)}
          unit="ms (média de 5 rodadas)"
          classification={classify('reaction_time', mean, baseline)}
          info={info}
          astronautId={astronaut.id}
          saved={saved}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-dim">Rodadas</dt>
            <dd className="font-mono tabular-nums">{times.map((t) => `${t} ms`).join(' · ')}</dd>
            <dt className="text-ink-dim">Cliques antecipados</dt>
            <dd>
              <span className="font-mono tabular-nums">{falseStarts}</span>
              {falseStarts > 0 && ' (erros; não entram na média)'}
            </dd>
            <dt className="text-ink-dim">Sua linha de base</dt>
            <dd>
              {baseline ? (
                <>
                  <span className="font-mono tabular-nums">
                    {Math.round(baseline.mean)} ± {Math.round(baseline.std)} ms
                  </span>{' '}
                  (pré-voo)
                </>
              ) : (
                'sem linha de base'
              )}
            </dd>
          </dl>
        </TestResult>
        {problem && (
          <p role="alert" className="rounded-md border border-status-red bg-status-red/10 p-3 text-sm">
            {problem} Refaça o teste.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!saved && !problem && (
            <button type="button" className={PRIMARY} onClick={() => void save()}>
              Salvar resultado
            </button>
          )}
          <button type="button" className={saved ? PRIMARY : SECONDARY} onClick={start}>
            {saved ? 'Fazer de novo' : 'Refazer sem salvar'}
          </button>
          {saved && (
            <>
              <a href={detailHref(astronaut.id, 'reaction_time')} className={SECONDARY}>
                Ver o gráfico
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

  const running = phase !== 'idle'
  const stageText =
    phase === 'go' ? 'CLIQUE AGORA!' : phase === 'waiting' ? 'Aguarde o sinal…' : phase === 'feedback' ? 'Prepare-se…' : 'Pronto para começar'
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:font-mono marker:text-ink-dim">
        <li>Deixe o dedo (ou o mouse) sobre o painel abaixo, sem tocar.</li>
        <li>
          O painel fica escuro por um tempo aleatório, de 1 a 4 segundos. Quando ele acender e mostrar “CLIQUE
          AGORA!”, toque o mais rápido que puder.
        </li>
        <li>São {REACTION_ROUNDS} rodadas. Tocar antes do sinal conta como erro e a rodada se repete.</li>
        <li>Pelo teclado: com o painel em foco, use a barra de espaço ou Enter.</li>
      </ol>

      <button
        ref={stage}
        type="button"
        disabled={!running}
        onPointerDown={(event) => {
          event.preventDefault()
          stage.current?.focus()
          respond()
        }}
        onKeyDown={onKeyDown}
        data-phase={phase}
        aria-label={`Painel do teste. ${stageText}`}
        className={`flex h-56 w-full select-none flex-col items-center justify-center gap-2 rounded-lg border-4 text-center transition-none sm:h-64 ${
          phase === 'go'
            ? 'border-ink bg-accent text-void'
            : 'border-dashed border-line bg-void text-ink-dim disabled:opacity-70'
        }`}
      >
        <span aria-hidden="true" className="font-mono text-4xl leading-none">
          {phase === 'go' ? '●' : '○'}
        </span>
        <span className="text-2xl font-semibold">{stageText}</span>
        {running && (
          <span className="text-sm">
            Rodada {round} de {REACTION_ROUNDS}
          </span>
        )}
      </button>

      <p role="status" aria-live="assertive" className={`min-h-6 text-sm ${feedback?.error ? 'font-semibold text-ink' : 'text-ink-dim'}`}>
        {feedback?.error && (
          <span aria-hidden="true" className="mr-1.5 font-mono text-status-red">
            ✕
          </span>
        )}
        {feedback?.text}
        {phase === 'go' && <span className="sr-only">Clique agora!</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!running ? (
          <button type="button" className={PRIMARY} onClick={start}>
            Começar o teste
          </button>
        ) : (
          <button
            type="button"
            className={SECONDARY}
            onClick={() => {
              clearTimer()
              setPhase('idle')
              setFeedback(undefined)
            }}
          >
            Cancelar
          </button>
        )}
        {running && (
          <p className="text-sm text-ink-dim">
            Válidas: <span className="font-mono tabular-nums text-ink">{times.length}</span> · Erros:{' '}
            <span className="font-mono tabular-nums text-ink">{falseStarts}</span>
          </p>
        )}
      </div>
      <p className="text-xs text-ink-dim">
        Respostas em menos de {REACTION_MIN_HUMAN_MS} ms também contam como antecipação. O tempo medido inclui o atraso
        da tela e do dispositivo, então compare sempre no mesmo aparelho.
      </p>
    </div>
  )
}
