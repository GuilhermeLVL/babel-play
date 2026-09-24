/**
 * O E-MAIL DO CONVITE AO RESPONSÁVEL (Fase 4 — ECA Digital art. 24 e LGPD art. 14).
 *
 * POR QUE NÃO O SMTP DO SUPABASE: a Admin API do Supabase só manda os e-mails dos modelos de LOGIN
 * (convite de cadastro, link mágico, recuperação). O convite de cadastro falha para quem já tem
 * conta, e nenhum dos modelos diz "a sua filha pediu para você vincular a conta dela" — o
 * responsável receberia um e-mail genérico de login sem entender o pedido.
 *
 * DOIS ENVIADORES, escolhidos pela configuração (`enviadorAtual`):
 *  - `criarEnviadorResend`: `POST https://api.resend.com/emails` com `RESEND_API_KEY` e
 *    `EMAIL_REMETENTE`. É o de produção.
 *  - `enviadorPorLog`: não envia nada — registra que o convite foi criado (sem o token nem o e-mail
 *    no log). É o de desenvolvimento e do self-host; com `CONVITE_LINK_NA_TELA` ligado o link volta
 *    na resposta para a tela mostrar. Em produção sem o Resend o boot avisa
 *    (`avisoDeConviteSemEmail`).
 *
 * O QUE O E-MAIL LEVA, e só isto (LGPD, dado de criança/adolescente): quem pediu, como a conta
 * informou; o que o responsável autoriza; o link; a validade; e como recusar. Não leva o e-mail do
 * responsável no corpo (ele é o destinatário), nem a idade exata, nem imagem, nem link além do
 * convite — e o rastreamento de abertura/clique fica DESLIGADO no domínio do Resend
 * (`docs/LANCAMENTO.md` §4), porque a API não o liga por mensagem.
 */
import { configDoResend, lerAppUrl, linkNaTelaLigado } from './config'
import { log } from './logger'
import { redigirErro } from './redacao'

/** Convites por conta em 24 h. O convite dispara e-mail para um endereço que o menor digita; sem
 *  teto, a rota viraria um canal de spam com o domínio do app como remetente. */
export const LIMITE_DE_CONVITES_POR_DIA = 5

export interface MensagemDeConvite {
  /** Id da linha do convite: vira a chave de idempotência do envio. */
  idDoConvite: string
  para: string
  link: string
  /** Como o menor aparece para o responsável: o nome (ou o e-mail) que a própria conta informou. */
  quemConvidou: string | null
  exigeConsentimentoEspecifico: boolean
  expiraEm: number
}

export interface ResultadoDoEnvio {
  enviado: boolean
  modo: 'log' | 'email'
}

export interface EnviadorDeConvite {
  /** Resolve quando o provedor aceitou; LANÇA `ErroDeEnvioDoConvite` quando não. */
  enviar(msg: MensagemDeConvite): Promise<ResultadoDoEnvio>
}

/**
 * A falha do envio, já sem dado pessoal na mensagem. `rejeitado` é 4xx (configuração ou endereço:
 * repetir não resolve); `indisponivel` é 5xx/rede; `timeout` é o prazo esgotado.
 */
export class ErroDeEnvioDoConvite extends Error {
  constructor(
    readonly tipo: 'rejeitado' | 'indisponivel' | 'timeout',
    mensagem: string,
    readonly status?: number,
  ) {
    super(redigirErro(mensagem))
    this.name = 'ErroDeEnvioDoConvite'
  }
}

export const enviadorPorLog: EnviadorDeConvite = {
  async enviar(msg) {
    log('info', {
      event: 'convite_responsavel_criado',
      error: msg.exigeConsentimentoEspecifico ? 'menor-12' : '12-15',
    })
    return { enviado: false, modo: 'log' }
  },
}

/* ─────────────── o texto ─────────────── */

const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const dataPtBr = (ms: number): string =>
  new Date(ms).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

/** O e-mail em pt-BR: assunto, texto simples e um HTML mínimo com o mesmo conteúdo. */
export function montarEmailDoConvite(msg: MensagemDeConvite): { assunto: string; texto: string; html: string } {
  const quem = msg.quemConvidou?.trim()
  const pedido = quem
    ? `${quem} (nome informado na conta) pediu para vincular a conta dele(a) no Babel Play à sua, como responsável.`
    : 'Uma pessoa com menos de 16 anos pediu para vincular a conta dela no Babel Play à sua, como responsável.'
  const autoriza = [
    'confirma que é o pai, a mãe ou o responsável legal;',
    'liga a conta dele(a) à sua: os estudos passam a ser guardados na nuvem, e você pode acompanhar e pagar pela conta;',
    ...(msg.exigeConsentimentoEspecifico
      ? [
          'dá o consentimento específico para o tratamento dos dados pessoais de uma criança com menos de 12 anos (LGPD, art. 14).',
        ]
      : []),
  ]
  const validade = `O convite vale por 7 dias, até ${dataPtBr(msg.expiraEm)}. Depois disso, é preciso pedir um novo.`
  const recusar =
    'Se você não reconhece este pedido ou não quer autorizar, ignore este e-mail: nada é vinculado sem o seu aceite, e o link expira sozinho.'
  const contexto =
    'O Babel Play é um app de estudo de idiomas. Pela lei (ECA Digital e LGPD), a conta de quem tem menos de 16 anos só guarda dados na nuvem depois que um responsável aceita o vínculo.'
  const comoAceitar = 'Para aceitar, abra o link abaixo e entre com a sua própria conta de adulto (ou crie uma):'
  const rodape = 'Babel Play — mensagem automática, não responda.'

  const texto = [
    'Olá,',
    '',
    pedido,
    '',
    contexto,
    '',
    'Ao aceitar, você:',
    ...autoriza.map((l) => `- ${l}`),
    '',
    comoAceitar,
    msg.link,
    '',
    validade,
    '',
    recusar,
    '',
    rodape,
  ].join('\n')

  const p = (s: string) => `<p>${escaparHtml(s)}</p>`
  const html = [
    '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;line-height:1.5;color:#1a1a1a">',
    p('Olá,'),
    p(pedido),
    p(contexto),
    `<p>${escaparHtml('Ao aceitar, você:')}</p>`,
    `<ul>${autoriza.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>`,
    p(comoAceitar),
    `<p><a href="${escaparHtml(msg.link)}">${escaparHtml('Abrir o convite')}</a></p>`,
    p(validade),
    p(recusar),
    `<p style="color:#666;font-size:12px">${escaparHtml(rodape)}</p>`,
    '</body></html>',
  ].join('')

  const assunto = msg.exigeConsentimentoEspecifico
    ? 'Pedido de autorização de responsável no Babel Play'
    : 'Pedido de vínculo com responsável no Babel Play'
  return { assunto, texto, html }
}

/* ─────────────── o envio pelo Resend ─────────────── */

export interface OpcoesDoResend {
  chave: string
  remetente: string
  /** Prazo de CADA tentativa. */
  timeoutMs?: number
  /** Pausa antes da segunda tentativa. */
  esperaMs?: number
  fetch?: typeof fetch
}

const URL_DO_RESEND = 'https://api.resend.com/emails'
/** Duas, e nunca mais: a segunda cobre um soluço do provedor; a terceira só atrasaria a tela. */
const TENTATIVAS = 2

export function criarEnviadorResend(opcoes: OpcoesDoResend): EnviadorDeConvite {
  const timeoutMs = opcoes.timeoutMs ?? 8_000
  const esperaMs = opcoes.esperaMs ?? 500
  const chamar = opcoes.fetch ?? fetch

  return {
    async enviar(msg) {
      const email = montarEmailDoConvite(msg)
      const corpo = JSON.stringify({
        from: opcoes.remetente,
        to: [msg.para],
        subject: email.assunto,
        text: email.texto,
        html: email.html,
      })
      /* A MESMA chave nas duas tentativas: se a primeira chegou ao Resend e só a resposta se
         perdeu (timeout), a segunda não gera um segundo e-mail. */
      const headers = {
        Authorization: `Bearer ${opcoes.chave}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `convite-${msg.idDoConvite}`,
      }

      let ultimo: ErroDeEnvioDoConvite | null = null
      for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        if (tentativa > 1 && esperaMs > 0) await new Promise((r) => setTimeout(r, esperaMs))
        try {
          const r = await chamar(URL_DO_RESEND, {
            method: 'POST',
            headers,
            body: corpo,
            signal: AbortSignal.timeout(timeoutMs),
          })
          if (r.ok) return { enviado: true, modo: 'email' }
          const detalhe = (await r.text().catch(() => '')).slice(0, 200)
          const definitivo = r.status >= 400 && r.status < 500 && r.status !== 429
          ultimo = new ErroDeEnvioDoConvite(
            definitivo ? 'rejeitado' : 'indisponivel',
            `Resend respondeu HTTP ${r.status}: ${detalhe}`,
            r.status,
          )
          if (definitivo) break
        } catch (err) {
          const nome = (err as { name?: string } | null)?.name
          ultimo =
            nome === 'TimeoutError' || nome === 'AbortError'
              ? new ErroDeEnvioDoConvite('timeout', `Resend não respondeu em ${timeoutMs} ms`)
              : new ErroDeEnvioDoConvite(
                  'indisponivel',
                  `falha de rede ao chamar o Resend: ${String((err as Error)?.message ?? err)}`,
                )
        }
        // Nunca o destinatário: só o tipo, o status e o texto do provedor, já redigido.
        log('warn', {
          event: 'convite_email_falhou',
          provider: 'resend',
          status: ultimo.status,
          error: `tentativa ${tentativa}/${TENTATIVAS} (${ultimo.tipo}): ${ultimo.message}`,
        })
      }
      throw ultimo ?? new ErroDeEnvioDoConvite('indisponivel', 'envio não realizado')
    },
  }
}

/**
 * O enviador em uso: o Resend quando `RESEND_API_KEY` e `EMAIL_REMETENTE` existem; senão o de log.
 * Lido a cada convite (e não no import), como as chaves de emergência: configurar não exige
 * reiniciar, e o teste troca o ambiente entre casos.
 */
export function enviadorAtual(env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): EnviadorDeConvite {
  const resend = configDoResend(env)
  return resend ? criarEnviadorResend({ ...resend, fetch: fetchImpl }) : enviadorPorLog
}

/** O link que o responsável abre. Absoluto com `APP_URL`; relativo sem ele (serve só na tela). */
export function linkDoConvite(token: string): string {
  const caminho = `/responsavel?token=${encodeURIComponent(token)}`
  const base = lerAppUrl()
  return base ? `${base.replace(/\/+$/, '')}${caminho}` : caminho
}

/** O link pode aparecer na resposta (e na tela do menor)? Só em desenvolvimento e testes. */
export function mostrarLinkNaTela(): boolean {
  return linkNaTelaLigado()
}
