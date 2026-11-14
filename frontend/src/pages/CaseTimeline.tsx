import { getCase, getDirective } from '../api'
import { LevelTag } from '../components/painel/LevelTag'
import { useLive } from '../lib/useLive'
import type { CaseDetail, CaseTimelineEntry, Directive } from '../types'
import { BackLink } from './IndicatorDetail'

type Kind = 'alerta' | 'pergunta' | 'acao' | 'reavaliacao' | 'saida' | 'nota'

const KIND_LABEL: Record<Kind, string> = {
  alerta: 'Alerta',
  pergunta: 'Pergunta ao astronauta',
  acao: 'Ação',
  reavaliacao: 'Reavaliação',
  saida: 'Critério de saída',
  nota: 'Nota',
}

// Os tipos da linha do tempo vêm de motor.py e ferramentas_kb.py.
function kindOf(entry: CaseTimelineEntry): Kind {
  if (entry.type === 'alerta' || entry.type === 'mudanca_nivel') return 'alerta'
  if (entry.type === 'pergunta') return 'pergunta'
  if (entry.type === 'acao' || entry.type === 'mensagem_solo') return 'acao'
  if (entry.content.startsWith('Critérios de saída')) return 'saida'
  if (entry.content.startsWith('Reavaliado')) return 'reavaliacao'
  return 'nota'
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

interface Props {
  astronautId: string
  caseId: string
  tick: number
}

export function CaseTimeline({ astronautId, caseId, tick }: Props) {
  const { data: detail, error } = useLive<CaseDetail>(caseId, () => getCase(caseId), tick)
  const ids = detail?.directives ?? []
  const { data: directives } = useLive<Directive[]>(ids.join(',') || undefined, () => Promise.all(ids.map(getDirective)), tick)

  if (!detail) {
    return (
      <div className="space-y-4">
        <BackLink astronautId={astronautId} />
        <p className="text-sm text-ink-faint">{error ? `Não foi possível abrir o caso: ${error}` : 'Carregando caso…'}</p>
      </div>
    )
  }

  const entries = [...detail.timeline].reverse()
  const answers = detail.events.filter((e) => e.kind === 'pergunta')
  const title = directives?.map((d) => d.title).join(' + ') ?? detail.directives.join(' + ')

  return (
    <article aria-labelledby="case-title" className="space-y-8">
      <div>
        <BackLink astronautId={astronautId} />
      </div>
      <header className="space-y-2">
        <h1 id="case-title" className="text-base font-semibold">
          {title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          <LevelTag level={detail.level} className="text-sm" />
          <span>{detail.case_id}</span>
          <span>status: {detail.status.replace('_', ' ')}</span>
          <span className="tnum">aberto em {when(detail.opened_at)}</span>
          {detail.next_review_at && <span className="tnum">próxima reavaliação {when(detail.next_review_at)}</span>}
        </p>
      </header>

      <section aria-labelledby="exit-title" className="rounded-lg border border-line bg-panel p-4">
        <h2 id="exit-title" className="mb-2 text-base font-semibold">
          Critério de saída
        </h2>
        {detail.exit_criteria_status.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {detail.exit_criteria_status.map((c) => (
              <li key={c.description} className={c.met ? 'text-ink' : 'text-ink-dim'}>
                <span aria-hidden="true">{c.met ? '✓' : '○'}</span> {c.description}
                <span className="sr-only">{c.met ? ' (atendido)' : ' (não atendido)'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">Ainda não reavaliado.</p>
        )}
      </section>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-3 text-base font-semibold">
          Linha do tempo
        </h2>
        <ol className="border-l border-line">
          {entries.map((entry, i) => {
            const kind = kindOf(entry)
            const answer = kind === 'pergunta' ? answers.find((a) => a.created_at === entry.at && a.answered) : undefined
            return (
              <li key={`${entry.at}-${i}`} className="relative pb-6 pl-6 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 -left-[5px] h-2.5 w-2.5 rounded-full border border-line ${i === 0 ? 'bg-accent' : 'bg-panel'}`}
                />
                <p className="tnum text-xs text-ink-faint">
                  {when(entry.at)} · <span className="text-ink-dim">{KIND_LABEL[kind]}</span>
                </p>
                <p className="mt-1 text-sm text-ink">{entry.content}</p>
                {answer?.answer && <p className="mt-1 text-sm text-ink-dim">Resposta: {answer.answer}</p>}
              </li>
            )
          })}
        </ol>
      </section>
    </article>
  )
}
