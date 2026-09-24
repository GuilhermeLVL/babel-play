/**
 * SENTRY NO SERVIDOR — um destino a mais para o logger, ligado só com `SENTRY_DSN` (Fase 5).
 *
 * Não é um SDK: é um `SinkDeErro` (ver `registrarSinkDeErro` em `logger.ts`). O logger entrega a
 * este sink a linha JÁ SANEADA — allowlist de campos e `redigirErro` aplicados —, e o que vai ao
 * Sentry é montado só a partir dela (`src/core/sentry.ts` explica por que sem o SDK). Resultado:
 * sem e-mail, sem IP, sem texto de transcrição, sem prompt, por construção e não por filtro.
 *
 * Os erros do NAVEGADOR chegam aqui também: `POST /api/erros-do-cliente` vira um `log('error')`.
 */
import { randomUUID } from 'node:crypto'

import { redigirErro } from '../../src/core/redacao'
import { criarLimitador, interpretarDsn, montarEnvelope, urlDoEnvelope } from '../../src/core/sentry'
import type { SinkDeErro } from './logger'

export interface OpcoesDoSentry {
  dsn: string
  ambiente?: string
  release?: string
  /** Teto de eventos por minuto (padrão 30). */
  maximoPorMinuto?: number
  buscar?: typeof fetch
}

/** Campos da linha do logger que viram TAG (enum/número — nada de texto livre). */
const TAGS = ['event', 'route', 'provider', 'status'] as const

/** `null` quando o DSN é inválido — quem liga registra o aviso e segue sem Sentry. */
export function sinkDoSentry(o: OpcoesDoSentry): SinkDeErro | null {
  const dsn = interpretarDsn(o.dsn)
  if (!dsn) return null
  const url = urlDoEnvelope(dsn)
  const podeEnviar = criarLimitador(o.maximoPorMinuto ?? 30)
  const buscar = o.buscar ?? fetch

  return (linha) => {
    if (!podeEnviar()) return
    const evento = String(linha.event ?? 'erro')
    const erro = typeof linha.error === 'string' ? redigirErro(linha.error) : ''
    const tags: Record<string, string> = {}
    for (const t of TAGS) if (linha[t] !== undefined) tags[t] = String(linha[t]).slice(0, 200)
    const extra: Record<string, string> = {}
    if (typeof linha.requestId === 'string') extra.requestId = linha.requestId
    if (typeof linha.stack === 'string') extra.stack = redigirErro(linha.stack).slice(0, 4000)

    const agora = new Date()
    const corpo = montarEnvelope(
      {
        eventId: randomUUID().replace(/-/g, ''),
        timestamp: agora.getTime() / 1000,
        platform: 'node',
        /* `warn` só chega aqui para os avisos que alertam (`AVISOS_QUE_ALERTAM` no logger). */
        level: linha.level === 'warn' ? 'warning' : 'error',
        mensagem: `${evento}: ${erro}`.slice(0, 1000),
        ambiente: o.ambiente,
        release: o.release,
        tags,
        extra,
        fingerprint: [evento, String(linha.route ?? '')],
      },
      agora,
    )
    /* Fogo e esquece: telemetria nunca segura nem derruba o request que ela observa. */
    void buscar(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: corpo,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {})
  }
}
