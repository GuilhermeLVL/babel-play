/**
 * Logger estruturado do servidor (M-01, versão mínima — sem dependência; Sentry é Camada 2).
 *
 * Emite UMA linha JSON por evento, com uma ALLOWLIST de campos: qualquer campo fora da lista é
 * DESCARTADO. Isso garante, por construção, que transcrição, chave de API ou texto de prompt do
 * usuário NUNCA vão para o log — mesmo que um caller passe por engano (LGPD + S-01). Dá base para os
 * SLIs da Fase 4 (latência/provedor/rota/fallback) e substitui os `console.*` soltos nos caminhos
 * de rede/adapter que hoje engolem a exceção em silêncio (parte dos 171 `catch` do M-01).
 */
export interface LogFields {
  event: string
  route?: string
  provider?: string
  status?: number
  latencyMs?: number
  fallbackLevel?: number
  /** Mensagem CURTA do erro — nunca o objeto/stack, nunca dados do usuário. */
  error?: string
  requestId?: string
  /* Z3 — instrumentação da distribuição de dificuldade. Números agregados, sem nada do usuário:
     é o que torna o drift de faixa observável em produção em vez de virar reclamação. */
  maiorFaixaPct?: number
  tipoDeCorte?: string
  total?: number
}

const ALLOWED = new Set([
  'ts', 'level', 'event', 'route', 'provider', 'status', 'latencyMs', 'fallbackLevel', 'error', 'requestId',
  'maiorFaixaPct', 'tipoDeCorte', 'total',
])

/**
 * DESTINO EXTERNO, PLUGÁVEL — achado F5-04 da auditoria.
 *
 * O logger sempre esteve certo: JSON por linha, com allowlist, para stdout. O problema medido é
 * que **ninguém lê o stdout** — zero Sentry, zero OpenTelemetry, e um erro em produção só aparece
 * quando um usuário reclama (D3 de deploy-readiness.md).
 *
 * Escolher o fornecedor é decisão de infraestrutura e não é minha. O que dá para fazer sem essa
 * decisão é o encaixe: quem for adotado registra um sink aqui e passa a receber TODO evento de
 * erro, já filtrado pela allowlist. Sem isso, adotar Sentry depois significaria varrer o servidor
 * inteiro de novo.
 *
 * O sink recebe o objeto JÁ SANEADO, nunca os campos crus — a garantia de que transcrição, chave
 * e prompt não vazam vale para o destino externo exatamente como vale para o stdout. Um sink que
 * lança é engolido de propósito: telemetria quebrada não pode derrubar o request que ela observa.
 */
export type SinkDeErro = (evento: Record<string, unknown>) => void

const sinks: SinkDeErro[] = []

/** Registra um destino externo para eventos `error`. Devolve como desregistrar. */
export function registrarSinkDeErro(sink: SinkDeErro): () => void {
  sinks.push(sink)
  return () => {
    const i = sinks.indexOf(sink)
    if (i >= 0) sinks.splice(i, 1)
  }
}

export function log(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  const out: Record<string, unknown> = { ts: Date.now(), level }
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED.has(k) && v !== undefined) out[k] = v
  }
  const line = JSON.stringify(out)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  if (level === 'error' && sinks.length) {
    for (const sink of sinks) {
      try { sink(out) } catch { /* telemetria quebrada não derruba o request que ela observa */ }
    }
  }
}
