export function DisclaimerBanner() {
  return (
    <p
      role="note"
      className="flex items-center justify-center gap-2 border-b border-line bg-panel-hi px-4 py-2 text-center text-sm text-ink"
    >
      <span aria-hidden="true" className="font-mono text-accent">
        [i]
      </span>
      <span>
        <strong className="font-semibold">Protótipo educacional</strong> — não é dispositivo médico. Dados simulados.
      </span>
    </p>
  )
}
