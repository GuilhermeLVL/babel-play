/**
 * ALERTA POR E-MAIL — um destino a mais para o logger, que no WORKER é o único (o diário em disco não existe lá e o
 * Sentry não está configurado). Ligado só com `ALERTA_EMAIL_DESTINO` + `RESEND_API_KEY` + `EMAIL_REMETENTE`.
 *
 * Como o Sentry (`server/lib/sentry.ts`), é um `SinkDeErro`: recebe a linha JÁ SANEADA (allowlist de campos e
 * `redigirErro` aplicados pelo `log()`), então o e-mail não tem como carregar transcrição, chave, prompt nem dado
 * pessoal. E, como lá, o envio é fogo-e-esquece por `emSegundoPlano`: telemetria nunca segura nem derruba a
 * requisição que ela observa, e no Worker o `waitUntil` mantém a promessa viva depois da resposta.
 *
 * RUÍDO CONTROLADO (um laço de erro não pode virar centenas de e-mails):
 *   - no máximo UM e-mail por evento por hora, por isolate, e o mesmo `Idempotency-Key` (evento + hora UTC) faz o
 *     Resend descartar a duplicata vinda de outro isolate;
 *   - teto de `maximoPorHora` e-mails no total (padrão 20) — acima disso o alerta é descartado em silêncio e o
 *     próximo ciclo de hora recomeça;
 *   - o que falha no próprio envio (`segundo_plano_falhou`, `alerta_email_falhou`) NUNCA vira alerta: sem isso, o
 *     Resend fora do ar geraria um erro, que geraria um e-mail, que falharia de novo.
 */
import { redigirErro } from '../../src/core/redacao'
import type { SinkDeErro } from './logger'
import { log } from './logger'
import { emSegundoPlano } from './runtime'

export interface OpcoesDoAlerta {
  chave: string
  /** `Frasy <nao-responda@frasy.com.br>` (o `EMAIL_REMETENTE`). */
  remetente: string
  destino: string
  ambiente?: string
  /** Teto de e-mails por hora (padrão 20). */
  maximoPorHora?: number
  buscar?: typeof fetch
  relogio?: () => number
}

const URL_DO_RESEND = 'https://api.resend.com/emails'
const HORA_MS = 3_600_000
/** Eventos do próprio caminho de envio: nunca alertam, para não fechar um laço. */
const NUNCA_ALERTAM: ReadonlySet<string> = new Set(['segundo_plano_falhou', 'alerta_email_falhou'])
/** Campos da linha que entram no corpo (enum, número ou id: texto livre só em `error`/`stack`, já redigidos). */
const CAMPOS = ['route', 'provider', 'status', 'requestId'] as const

/** O corpo do e-mail a partir da linha saneada. Exportado para o teste conferir que nada além dela entra. */
export function montarAlerta(
  linha: Record<string, unknown>,
  ambiente: string | undefined,
  agora: Date,
): { assunto: string; texto: string } {
  const evento = String(linha.event ?? 'erro')
  const nivel = linha.level === 'warn' ? 'aviso' : 'erro'
  const linhas = [
    `Ambiente: ${ambiente ?? '—'}`,
    `Evento: ${evento}`,
    `Nível: ${nivel}`,
    `Quando: ${agora.toISOString()}`,
  ]
  for (const c of CAMPOS) if (linha[c] !== undefined) linhas.push(`${c}: ${String(linha[c]).slice(0, 200)}`)
  if (typeof linha.error === 'string') linhas.push('', `Erro: ${redigirErro(linha.error).slice(0, 1500)}`)
  if (typeof linha.stack === 'string') linhas.push('', `Pilha:\n${redigirErro(linha.stack).slice(0, 1500)}`)
  linhas.push(
    '',
    'Para investigar: procure o requestId nos Workers Logs (Cloudflare → Workers → frasy → Logs) e siga docs/runbook.md.',
  )
  return { assunto: `[Frasy ${ambiente ?? ''}] ${nivel}: ${evento}`.replace('  ', ' '), texto: linhas.join('\n') }
}

export function sinkDeAlertaPorEmail(o: OpcoesDoAlerta): SinkDeErro {
  const relogio = o.relogio ?? (() => Date.now())
  const buscar = o.buscar ?? fetch
  const maximo = o.maximoPorHora ?? 20
  const ultimoPorEvento = new Map<string, number>()
  let janela = -1
  let enviados = 0

  return (linha) => {
    const evento = String(linha.event ?? 'erro')
    if (NUNCA_ALERTAM.has(evento)) return
    const agora = relogio()
    const hora = Math.floor(agora / HORA_MS)
    if (hora !== janela) {
      janela = hora
      enviados = 0
      ultimoPorEvento.clear()
    }
    if (ultimoPorEvento.has(evento) || enviados >= maximo) return
    ultimoPorEvento.set(evento, agora)
    enviados += 1

    const { assunto, texto } = montarAlerta(linha, o.ambiente, new Date(agora))
    emSegundoPlano(
      buscar(URL_DO_RESEND, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${o.chave}`,
          'Content-Type': 'application/json',
          /* Evento + hora UTC: o Resend descarta o mesmo alerta vindo de outro isolate na mesma hora. */
          'Idempotency-Key': `alerta-${evento}-${hora}`.slice(0, 250),
        },
        body: JSON.stringify({ from: o.remetente, to: [o.destino], subject: assunto, text: texto }),
        signal: AbortSignal.timeout(8_000),
      }).then(
        (r) => {
          if (!r.ok) log('warn', { event: 'alerta_email_falhou', provider: 'resend', status: r.status })
        },
        (err) =>
          log('warn', {
            event: 'alerta_email_falhou',
            provider: 'resend',
            error: String((err as Error)?.message ?? err).slice(0, 200),
          }),
      ),
    )
  }
}
