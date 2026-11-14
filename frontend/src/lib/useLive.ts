import { useEffect, useState } from 'react'

interface LiveState<T> {
  key: string
  data?: T
  error?: string
}

// Carrega de novo a cada `tick` sem piscar: mantém o dado anterior até chegar o novo.
export function useLive<T>(key: string | undefined, load: () => Promise<T>, tick: number): Omit<LiveState<T>, 'key'> {
  const [state, setState] = useState<LiveState<T>>({ key: '' })
  useEffect(() => {
    if (!key) return
    let stale = false
    load()
      .then((data) => !stale && setState({ key, data }))
      .catch((e: Error) =>
        !stale && setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error: e.message })),
      )
    return () => {
      stale = true
    }
    // `load` muda a cada render: quem decide recarregar é a chave e o tick
  }, [key, tick])
  return state.key === key ? { data: state.data, error: state.error } : {}
}
