import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { saveMeasurements } from '../api'
import { STATUS_BORDER, STATUS_META, StatusBadge, StatusIcon } from '../components/StatusBadge'
import type { Panel, PanelId } from '../lib/dashboard'
import { formatValue } from '../lib/format'
import { alertsHref, dashboardHref, detailHref, recordHref } from '../lib/route'
import { PLAUSIBLE, baselineWarning, parseNumber, validateBloodPressure, validateValue } from '../lib/validate'
import type { Astronaut, Baseline, IndicatorId, Measurement } from '../types'

interface Props {
  astronaut: Astronaut
  panels: Panel[]
  baselines: Baseline[]
  /** Indicador já escolhido pela rota. */
  panelId?: string
}

const MOODS = [
  { value: 1, face: '😞', label: 'Muito ruim' },
  { value: 2, face: '🙁', label: 'Ruim' },
  { value: 3, face: '😐', label: 'Neutro' },
  { value: 4, face: '🙂', label: 'Bom' },
  { value: 5, face: '😄', label: 'Muito bom' },
]

const INPUT =
  'w-full rounded-md border border-line bg-void px-3 py-2 font-mono text-lg tabular-nums text-ink placeholder:text-ink-dim/60'
const BUTTON = 'rounded-md border px-4 py-2 text-sm font-semibold transition-colors'
const PRIMARY = `${BUTTON} border-accent bg-accent text-void hover:bg-accent/85`
const SECONDARY = `${BUTTON} border-line bg-panel text-ink hover:border-ink-dim`

function NumberField({
  label,
  unit,
  hint,
  value,
  onChange,
}: {
  label: string
  unit: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="min-w-0 flex-1 basis-40">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={INPUT}
        />
        <span className="shrink-0 text-sm text-ink-dim">{unit}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-dim">
          {hint}
        </p>
      )}
    </div>
  )
}

export function RecordMeasurement({ astronaut, panels, baselines, panelId }: Props) {
  // A grade de Amsler só é registrada pelo teste (página Testes), não por digitação.
  const options = panels.filter((p) => p.id !== 'amsler')
  const selected = options.find((p) => p.id === panelId) ?? options[0]
  const baselineOf = (id: IndicatorId) => baselines.find((b) => b.indicator === id)

  const [text, setText] = useState('')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [mood, setMood] = useState<number>()
  const [sleep, setSleep] = useState(7)
  const [error, setError] = useState<string>()
  /** Avisos de linha de base aguardando confirmação, com as medições prontas para salvar. */
  const [pending, setPending] = useState<{ warnings: string[]; measurements: Measurement[] }>()
  /** Horário da medição salva; o resultado aparece quando ela chega ao painel. */
  const [savedAt, setSavedAt] = useState<string>()

  // Trocar de indicador ou de astronauta recomeça o formulário.
  useEffect(() => {
    setText('')
    setSystolic('')
    setDiastolic('')
    setMood(undefined)
    setError(undefined)
    setPending(undefined)
    setSavedAt(undefined)
  }, [selected?.id, astronaut.id])

  // Mexer no valor limpa o erro e desfaz o pedido de confirmação pendente.
  useEffect(() => {
    setError(undefined)
    setPending(undefined)
  }, [text, systolic, diastolic, mood, sleep])

  if (!selected) return <p className="text-ink-dim">Sem indicadores para registrar.</p>

  const hint = (id: IndicatorId) => {
    const b = baselineOf(id)
    return b && id !== 'radiation' ? `Sua média: ${formatValue(Number(b.mean.toFixed(1)), PLAUSIBLE[id].unit)} ${PLAUSIBLE[id].unit}` : undefined
  }

  const save = async (measurements: Measurement[]) => {
    setPending(undefined)
    setError(undefined)
    await saveMeasurements(measurements)
    setSavedAt(measurements[0].timestamp)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setPending(undefined)

    // O horário é o de agora, sempre depois da última leitura do painel.
    const last = selected.history.at(-1)
    const timestamp = new Date(Math.max(Date.now(), last ? Date.parse(last.timestamp) + 1000 : 0)).toISOString()
    const make = (indicator: IndicatorId, value: number): Measurement => ({
      astronaut_id: astronaut.id,
      indicator,
      value,
      unit: selected.charts.find((c) => c.info.indicator === indicator)?.info.unit ?? PLAUSIBLE[indicator].unit,
      timestamp,
      source: 'manual',
    })

    let measurements: Measurement[]
    let problem: string | undefined
    if (selected.id === 'amsler') return
    if (selected.id === 'blood_pressure') {
      const sys = parseNumber(systolic)
      const dia = parseNumber(diastolic)
      problem = validateBloodPressure(sys, dia)
      measurements = [make('bp_systolic', sys), make('bp_diastolic', dia)]
    } else {
      const value = selected.id === 'mood' ? (mood ?? NaN) : selected.id === 'sleep' ? sleep : parseNumber(text)
      problem =
        selected.id === 'mood' && mood === undefined ? 'Humor: escolha um dos rostinhos.' : validateValue(selected.id, value)
      measurements = [make(selected.id, value)]
    }
    if (problem) {
      setError(problem)
      return
    }
    setError(undefined)

    const warnings = measurements
      .map((m) => baselineWarning(m.indicator, m.value, baselineOf(m.indicator)))
      .filter((w): w is string => w !== undefined)
    if (warnings.length > 0) {
      setPending({ warnings, measurements })
      return
    }
    void save(measurements)
  }

  // --- Resultado ---------------------------------------------------------------
  if (savedAt) {
    const reading = selected.history.find((r) => r.timestamp === savedAt)
    if (!reading) return <p className="text-ink-dim">Salvando…</p>
    const { status, reason } = reading.classification
    const info = selected.infos[0]
    return (
      <section aria-labelledby="result-title" className="mx-auto max-w-2xl space-y-4">
        <div role="status" className={`rounded-lg border border-l-4 border-line bg-panel p-4 sm:p-5 ${STATUS_BORDER[status]}`}>
          <p className="text-sm text-ink-dim">Medição salva · {astronaut.name}</p>
          <h1 id="result-title" className="text-2xl font-semibold">
            {selected.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-semibold tabular-nums">{reading.display}</span>
            <span className="text-sm text-ink-dim">{selected.unit}</span>
          </p>
          <div className="mt-3">
            <StatusBadge status={status} />
            <p className="mt-2 font-medium first-letter:uppercase">{reason}.</p>
            <p className="text-sm text-ink-dim">{info.explanations[status]}</p>
          </div>
        </div>

        {status === 'red' && (
          <div role="alert" className="flex items-start gap-3 rounded-lg border-2 border-status-red bg-status-red/10 p-4">
            <StatusIcon status="red" className="mt-0.5 h-7 w-7" />
            <div className="text-sm leading-relaxed">
              <p className="text-lg font-semibold">Encaminhar ao médico de voo</p>
              <p>
                Um relatório para a Terra foi gerado e está na fila de envio.{' '}
                <a href={alertsHref(astronaut.id)} className="font-semibold underline underline-offset-2">
                  Acompanhar em Alertas
                </a>
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">Ação recomendada</h2>
          {status === 'green' ? (
            <p className="text-sm">{STATUS_META.green.action} Continue medindo no horário de costume.</p>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {info.actions[status].map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
              {status === 'yellow' && (
                <p className="mt-3 text-sm text-ink-dim">
                  Este resultado aparece em{' '}
                  <a href={alertsHref(astronaut.id)} className="underline underline-offset-2 hover:text-ink">
                    Alertas
                  </a>
                  .
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} onClick={() => setSavedAt(undefined)}>
            Registrar outra medição
          </button>
          <a href={detailHref(astronaut.id, selected.id)} className={SECONDARY}>
            Ver o gráfico
          </a>
          <a href={dashboardHref(astronaut.id)} className={SECONDARY}>
            Voltar ao dashboard
          </a>
        </div>
      </section>
    )
  }

  // --- Formulário ----------------------------------------------------------------
  const single =
    selected.id !== 'blood_pressure' && selected.id !== 'amsler' && selected.id !== 'mood' && selected.id !== 'sleep'
      ? selected.id
      : undefined
  return (
    <section aria-labelledby="record-title" className="mx-auto max-w-2xl">
      <h1 id="record-title" className="text-2xl font-semibold">
        Registrar medição
      </h1>
      <p className="mb-4 text-sm text-ink-dim">
        {astronaut.name} · {astronaut.role}
      </p>

      <form onSubmit={submit} noValidate className="space-y-5 rounded-lg border border-line bg-panel p-4 sm:p-5">
        <div>
          <label htmlFor="indicator" className="mb-1 block text-sm font-medium">
            Indicador
          </label>
          <select
            id="indicator"
            value={selected.id}
            onChange={(e) => {
              window.location.hash = recordHref(astronaut.id, e.target.value as PanelId)
            }}
            className="w-full rounded-md border border-line bg-void px-3 py-2 text-ink"
          >
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {selected.id === 'blood_pressure' && (
          <div className="flex flex-wrap gap-4">
            <NumberField label="Sistólica (número maior)" unit="mmHg" hint={hint('bp_systolic')} value={systolic} onChange={setSystolic} />
            <NumberField label="Diastólica (número menor)" unit="mmHg" hint={hint('bp_diastolic')} value={diastolic} onChange={setDiastolic} />
          </div>
        )}

        {selected.id === 'mood' && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Como foi o seu humor hoje? (1 a 5)</legend>
            <div className="grid grid-cols-5 gap-2">
              {MOODS.map((m) => (
                <label
                  key={m.value}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-line bg-void px-1 py-3 text-center transition-colors hover:border-ink-dim has-[:checked]:border-accent has-[:checked]:bg-panel-hi has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="mood"
                    value={m.value}
                    checked={mood === m.value}
                    onChange={() => setMood(m.value)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="text-3xl leading-none">
                    {m.face}
                  </span>
                  <span className="font-mono text-sm font-semibold">{m.value}</span>
                  <span className="text-xs leading-tight text-ink-dim">{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {selected.id === 'sleep' && (
          <div>
            <label htmlFor="sleep" className="mb-1 block text-sm font-medium">
              Horas dormidas no último período de sono
            </label>
            <p className="flex items-baseline gap-2">
              <output htmlFor="sleep" className="font-mono text-4xl font-semibold tabular-nums">
                {sleep.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </output>
              <span className="text-sm text-ink-dim">h</span>
            </p>
            <input
              id="sleep"
              type="range"
              min={0}
              max={14}
              step={0.1}
              value={sleep}
              onChange={(e) => setSleep(Number(e.target.value))}
              aria-describedby="sleep-hint"
              className="mt-2 w-full accent-accent"
            />
            <div aria-hidden="true" className="flex justify-between font-mono text-xs text-ink-dim">
              <span>0</span>
              <span>7</span>
              <span>14 h</span>
            </div>
            <p id="sleep-hint" className="mt-1 text-xs text-ink-dim">
              {hint('sleep')} · Arraste ou use as setas do teclado.
            </p>
          </div>
        )}

        {single && (
          <div className="flex">
            <NumberField
              label={single === 'radiation' ? 'Dose de hoje lida no dosímetro' : `${selected.title} — valor medido`}
              unit={PLAUSIBLE[single].unit}
              hint={single === 'radiation' ? 'O painel soma esta dose à dose acumulada.' : hint(single)}
              value={text}
              onChange={setText}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-status-red bg-status-red/10 p-3 text-sm">
            <StatusIcon status="red" className="mt-0.5 h-4 w-4" />
            <span>
              <strong className="font-semibold">Valor não aceito.</strong> {error}
            </span>
          </p>
        )}

        {pending ? (
          <div role="alertdialog" aria-labelledby="confirm-title" className="rounded-md border border-status-yellow bg-status-yellow/10 p-3 text-sm">
            <p id="confirm-title" className="flex items-start gap-2 font-semibold">
              <StatusIcon status="yellow" className="mt-0.5 h-4 w-4" />
              Valor muito fora da sua linha de base. Está correto?
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-9">
              {pending.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 pl-6">
              <button type="button" className={PRIMARY} onClick={() => void save(pending.measurements)}>
                Sim, salvar assim
              </button>
              <button type="button" className={SECONDARY} onClick={() => setPending(undefined)}>
                Corrigir o valor
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY}>
              Salvar medição
            </button>
            <a href={dashboardHref(astronaut.id)} className={SECONDARY}>
              Cancelar
            </a>
          </div>
        )}
      </form>
      <p className="mt-3 text-xs text-ink-dim">
        A medição fica guardada neste navegador e é registrada com o horário de agora.
      </p>
    </section>
  )
}
