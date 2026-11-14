// Navegação por hash: funciona offline e em hospedagem estática, sem biblioteca
// de rotas nem configuração de servidor.
//   #/ast-01                    dashboard do astronauta
//   #/ast-01/sleep              detalhe de um indicador
//   #/ast-01/registrar[/sleep]  registrar medição (indicador opcional já escolhido)
//   #/ast-01/corpo[/heart]      mapa do corpo (região opcional já aberta)
//   #/ast-01/testes[/reacao]    testes que rodam no app (reacao ou amsler)
//   #/ast-01/missao             tarefas do dia, progresso e metas da tripulação
//   #/alertas[/ast-01]          alertas (filtro por astronauta opcional)
import { useEffect, useState } from 'react'

export interface Route {
  page: 'dashboard' | 'detail' | 'record' | 'body' | 'tests' | 'mission' | 'alerts'
  astronautId?: string
  /** Indicador (detalhe, registrar), região do corpo (mapa) ou teste (testes). */
  panelId?: string
}

const RECORD = 'registrar'
const ALERTS = 'alertas'
const BODY = 'corpo'
const TESTS = 'testes'
const MISSION = 'missao'

export function parseRoute(hash: string): Route {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (first === ALERTS) return { page: 'alerts', astronautId: second }
  if (second === RECORD) return { page: 'record', astronautId: first, panelId: third }
  if (second === BODY) return { page: 'body', astronautId: first, panelId: third }
  if (second === TESTS) return { page: 'tests', astronautId: first, panelId: third }
  if (second === MISSION) return { page: 'mission', astronautId: first }
  if (second) return { page: 'detail', astronautId: first, panelId: second }
  return { page: 'dashboard', astronautId: first }
}

const enc = encodeURIComponent

export const dashboardHref = (astronautId: string) => `#/${enc(astronautId)}`

export const detailHref = (astronautId: string, panelId: string) => `#/${enc(astronautId)}/${enc(panelId)}`

export const recordHref = (astronautId: string, panelId?: string) =>
  `#/${enc(astronautId)}/${RECORD}${panelId ? `/${enc(panelId)}` : ''}`

/** Mapa do corpo; `regionId` abre o painel de uma região. */
export const bodyHref = (astronautId: string, regionId?: string) =>
  `#/${enc(astronautId)}/${BODY}${regionId ? `/${enc(regionId)}` : ''}`

export type TestId = 'reacao' | 'amsler'

export const testsHref = (astronautId: string, testId?: TestId) =>
  `#/${enc(astronautId)}/${TESTS}${testId ? `/${testId}` : ''}`

export const missionHref = (astronautId: string) => `#/${enc(astronautId)}/${MISSION}`

export const alertsHref = (astronautId?: string) => `#/${ALERTS}${astronautId ? `/${enc(astronautId)}` : ''}`

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
