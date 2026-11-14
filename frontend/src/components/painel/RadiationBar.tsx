import { fmt } from '../../lib/cell'
import { LEVEL_META, isActionLevel } from '../../lib/levels'
import { CAREER_LIMIT_MSV, RADIATION_MARKS, barPct, daysToLimit, pctOfLimit } from '../../lib/radiation'
import type { Level } from '../../types'
import { LevelTag } from './LevelTag'

interface Props {
  careerMsv?: number
  /** Taxa média de 24 h, mSv/h. */
  rateMsvH?: number
  level: Level
  href: string
}

// O único medidor do painel: dose de carreira contra 600 mSv, com as marcas da DIR-RAD-001.
export function RadiationBar({ careerMsv, rateMsvH, level, href }: Props) {
  const days = careerMsv === undefined ? undefined : daysToLimit(careerMsv, rateMsvH)
  const fill = isActionLevel(level) ? LEVEL_META[level].color : 'var(--color-accent)'
  return (
    <section aria-labelledby="rad-title" className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="rad-title" className="text-base font-semibold">
          <a href={href} className="hover:text-accent">
            Radiação · dose de carreira
          </a>
        </h2>
        <LevelTag level={level} />
      </div>
      {careerMsv === undefined ? (
        <p className="text-sm text-ink-faint">Sem leitura do dosímetro.</p>
      ) : (
        <>
          <p className="mb-2 flex items-baseline gap-1.5">
            <span className="tnum text-[28px] leading-none font-semibold">{fmt(careerMsv, 1)}</span>
            <span className="text-xs text-ink-dim">
              mSv · <span className="tnum">{fmt(pctOfLimit(careerMsv), 0)}%</span> do limite
            </span>
          </p>
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={CAREER_LIMIT_MSV}
            aria-valuenow={Math.round(careerMsv)}
            aria-label={`Dose de carreira ${fmt(careerMsv, 1)} de ${CAREER_LIMIT_MSV} mSv`}
            className="relative mt-3 h-2 rounded-full bg-line"
          >
            <div className="h-full rounded-full" style={{ width: `${barPct(careerMsv)}%`, background: fill }} />
            {RADIATION_MARKS.map((m) => (
              <span
                key={m.msv}
                aria-hidden="true"
                className="absolute -top-1 h-4 w-px"
                style={{ left: `${(m.msv / CAREER_LIMIT_MSV) * 100}%`, background: LEVEL_META[m.level].color }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="tnum relative mt-1 h-4 text-xs text-ink-faint">
            {RADIATION_MARKS.map((m) => (
              <span
                key={m.msv}
                className="absolute -translate-x-full pr-1"
                style={{ left: `${(m.msv / CAREER_LIMIT_MSV) * 100}%` }}
              >
                {m.msv}
              </span>
            ))}
          </div>
          <dl className="tnum mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-ink-faint">Taxa atual (24 h)</dt>
              <dd className="text-sm text-ink">{rateMsvH === undefined ? '—' : `${fmt(rateMsvH, 3)} mSv/h`}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Limite no ritmo atual</dt>
              <dd className="text-sm text-ink">
                {careerMsv >= CAREER_LIMIT_MSV ? 'atingido' : days === undefined ? '—' : `em ~${fmt(days, 0)} dias`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-faint">Fim da missão não informado: a projeção vai até o limite de carreira.</p>
        </>
      )}
    </section>
  )
}
