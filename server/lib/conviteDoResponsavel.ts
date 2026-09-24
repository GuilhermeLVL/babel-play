/**
 * O E-MAIL DO CONVITE AO RESPONSÁVEL (Fase 4) — atrás de uma interface, porque o envio ainda não
 * existe.
 *
 * POR QUE NÃO O SMTP DO SUPABASE: a Admin API do Supabase só manda os e-mails dos modelos de LOGIN
 * (convite de cadastro, link mágico, recuperação). O convite de cadastro falha para quem já tem
 * conta, e nenhum dos modelos diz "a sua filha pediu para você vincular a conta dela" — o
 * responsável receberia um e-mail genérico de login sem entender o pedido. Não há jeito limpo.
 *
 * O QUE EXISTE HOJE: `enviadorPorLog`, que não envia nada — registra que o convite foi criado (sem
 * o token nem o e-mail no log) e, quando `CONVITE_LINK_NA_TELA=1` (desenvolvimento e testes), devolve
 * o link para a tela mostrar. Em produção, sem um enviador de verdade, a resposta diz `enviado:
 * false` e a tela explica que o envio ainda não está disponível.
 *
 * PENDENTE: implementar `EnviadorDeConvite` com o Resend (ou outro SMTP transacional) e trocá-lo
 * em `enviadorAtual()`. É só isso — rota, token e aceite já funcionam.
 */
import { lerAppUrl, linkNaTelaLigado } from './config'
import { log } from './logger'

export interface MensagemDeConvite {
  para: string
  link: string
  /** Como o menor aparece para o responsável (nome de exibição, se houver). */
  nomeDoMenor: string | null
  exigeConsentimentoEspecifico: boolean
}

export interface ResultadoDoEnvio {
  enviado: boolean
  modo: 'log' | 'email'
}

export interface EnviadorDeConvite {
  enviar(msg: MensagemDeConvite): Promise<ResultadoDoEnvio>
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

let atual: EnviadorDeConvite = enviadorPorLog

/** O enviador em uso. Trocar aqui quando o Resend/SMTP existir. */
export function enviadorAtual(): EnviadorDeConvite {
  return atual
}

/** Só para testes. */
export function _definirEnviador(e: EnviadorDeConvite): void {
  atual = e
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
