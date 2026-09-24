/**
 * O E-MAIL DO CONVITE AO RESPONSÁVEL, pelo Resend (`POST https://api.resend.com/emails`).
 *
 * Sem este envio, em produção nenhum menor de 16 anos consegue liberar a conta: o link do convite
 * não aparece na tela (`CONVITE_LINK_NA_TELA` desligado) e o responsável nunca o recebe.
 *
 * Contratos:
 * 1. Sucesso: UMA chamada, com `Authorization: Bearer`, `Idempotency-Key` do convite, remetente
 *    de `EMAIL_REMETENTE`, o destinatário e um e-mail em pt-BR (texto + HTML mínimo) que diz quem
 *    pediu, o que se autoriza, o link, a validade de 7 dias e como recusar — sem rastreamento.
 * 2. 4xx: recusa definitiva, sem retentativa.
 * 3. 5xx e timeout: no máximo DUAS tentativas (a chave de idempotência torna a segunda segura).
 * 4. O erro que sobe nunca carrega o e-mail em claro, nem quando o Resend o ecoa no corpo.
 * 5. Sem `RESEND_API_KEY` + `EMAIL_REMETENTE`, o enviador é o de log (dev/self-host); em produção
 *    com `AUTH_REQUIRED=1`, o boot avisa.
 */
import { describe, expect, it, vi } from 'vitest'

import { avisoDeConviteSemEmail, configDoResend, VARIAVEIS } from '../../server/lib/config'
import {
  criarEnviadorResend,
  enviadorAtual,
  ErroDeEnvioDoConvite,
  type MensagemDeConvite,
  montarEmailDoConvite,
} from '../../server/lib/conviteDoResponsavel'

const MSG: MensagemDeConvite = {
  idDoConvite: 'conv-123',
  para: 'mae.da.ana@exemplo.com',
  link: 'https://babelplay.com.br/responsavel?token=abc',
  quemConvidou: 'Ana',
  exigeConsentimentoEspecifico: false,
  expiraEm: Date.UTC(2026, 9, 1, 15, 0, 0),
}
const OPCOES = { chave: 're_teste_123', remetente: 'Babel Play <nao-responda@babelplay.com.br>', esperaMs: 0 }

const ok = () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })

describe('montarEmailDoConvite', () => {
  it('pt-BR: quem pediu, o que se autoriza, o link, a validade e como recusar', () => {
    const e = montarEmailDoConvite(MSG)
    expect(e.assunto).toMatch(/Babel Play/)
    for (const trecho of ['Ana', MSG.link, '7 dias', '01/10/2026', 'ignore', 'responsável legal']) {
      expect(e.texto, trecho).toContain(trecho)
    }
    expect(e.html).toContain(`href="${MSG.link}"`)
    expect(e.html).toContain('7 dias')
  })

  it('menor de 12: o texto pede o consentimento específico (LGPD art. 14)', () => {
    const e = montarEmailDoConvite({ ...MSG, exigeConsentimentoEspecifico: true })
    expect(e.texto).toMatch(/consentimento/i)
    expect(e.texto).toMatch(/12 anos/)
  })

  it('sem nome: texto genérico, sem inventar quem é', () => {
    const e = montarEmailDoConvite({ ...MSG, quemConvidou: null })
    expect(e.texto).not.toContain('null')
    expect(e.texto).toMatch(/Uma pessoa/)
  })

  it('o nome informado pelo menor não vira HTML', () => {
    const e = montarEmailDoConvite({ ...MSG, quemConvidou: '<img src=x onerror=alert(1)>' })
    expect(e.html).not.toContain('<img')
    expect(e.html).toContain('&lt;img')
  })

  it('sem rastreamento: nenhuma imagem, nenhum pixel, nenhum link além do convite', () => {
    const e = montarEmailDoConvite(MSG)
    expect(e.html).not.toMatch(/<img/i)
    expect(e.html.match(/href=/g)).toHaveLength(1)
  })

  it('não leva o e-mail do responsável no corpo (ele já é o destinatário)', () => {
    const e = montarEmailDoConvite(MSG)
    expect(e.texto).not.toContain(MSG.para)
    expect(e.html).not.toContain(MSG.para)
  })
})

describe('criarEnviadorResend', () => {
  it('sucesso: uma chamada, com a chave, a idempotência, o remetente e o destinatário', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => ok())
    const r = await criarEnviadorResend({ ...OPCOES, fetch: f as unknown as typeof fetch }).enviar(MSG)
    expect(r).toEqual({ enviado: true, modo: 'email' })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_teste_123')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Idempotency-Key']).toBe('convite-conv-123')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const corpo = JSON.parse(String(init?.body))
    expect(corpo).toMatchObject({ from: OPCOES.remetente, to: [MSG.para] })
    expect(typeof corpo.subject).toBe('string')
    expect(corpo.text).toContain(MSG.link)
    expect(corpo.html).toContain(MSG.link)
    // Nada além do necessário: sem tags, cabeçalhos extras, cópias ou anexos.
    expect(Object.keys(corpo).sort()).toEqual(['from', 'html', 'subject', 'text', 'to'])
  })

  it('4xx: recusa definitiva, sem retentativa, e o erro não carrega o e-mail', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: 'validation_error', message: `Invalid \`to\`: ${MSG.para}` }), {
          status: 422,
        }),
    )
    const erro = await criarEnviadorResend({ ...OPCOES, fetch: f as unknown as typeof fetch })
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeEnvioDoConvite)
    expect((erro as ErroDeEnvioDoConvite).tipo).toBe('rejeitado')
    expect((erro as ErroDeEnvioDoConvite).status).toBe(422)
    expect(String((erro as Error).message)).not.toContain(MSG.para)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('5xx: tenta no máximo duas vezes e desiste', async () => {
    const f = vi.fn(async () => new Response('{"message":"internal"}', { status: 500 }))
    const erro = await criarEnviadorResend({ ...OPCOES, fetch: f as unknown as typeof fetch })
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((erro as ErroDeEnvioDoConvite).tipo).toBe('indisponivel')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('5xx e depois 200: a segunda tentativa entrega, com a MESMA chave de idempotência', async () => {
    const f = vi
      .fn(async (_url: string, _init?: RequestInit) => ok())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    const r = await criarEnviadorResend({ ...OPCOES, fetch: f as unknown as typeof fetch }).enviar(MSG)
    expect(r.enviado).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
    const chaves = f.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key'])
    expect(new Set(chaves).size).toBe(1)
  })

  it('timeout: aborta cada tentativa no prazo, no máximo duas, e sobe como timeout', async () => {
    const f = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => {
          init?.signal?.addEventListener('abort', () => rejeitar(init.signal!.reason))
        }),
    )
    const inicio = Date.now()
    const erro = await criarEnviadorResend({ ...OPCOES, timeoutMs: 30, fetch: f as unknown as typeof fetch })
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((erro as ErroDeEnvioDoConvite).tipo).toBe('timeout')
    expect(f).toHaveBeenCalledTimes(2)
    expect(Date.now() - inicio).toBeLessThan(2_000)
  })

  it('falha de rede: também no máximo duas tentativas', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const erro = await criarEnviadorResend({ ...OPCOES, fetch: f as unknown as typeof fetch })
      .enviar(MSG)
      .catch((e: unknown) => e)
    expect((erro as ErroDeEnvioDoConvite).tipo).toBe('indisponivel')
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('qual enviador está em uso', () => {
  it('sem RESEND_API_KEY ou sem EMAIL_REMETENTE: o de log, que não envia nada', async () => {
    const f = vi.fn(async () => ok())
    for (const env of [{}, { RESEND_API_KEY: 're_x' }, { EMAIL_REMETENTE: 'Babel <a@b.com>' }]) {
      const r = await enviadorAtual(env, f as unknown as typeof fetch).enviar(MSG)
      expect(r, JSON.stringify(env)).toEqual({ enviado: false, modo: 'log' })
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('com as duas: o do Resend', async () => {
    const f = vi.fn(async () => ok())
    const env = { RESEND_API_KEY: ' re_x ', EMAIL_REMETENTE: 'Babel Play <nao-responda@babelplay.com.br>' }
    const r = await enviadorAtual(env, f as unknown as typeof fetch).enviar(MSG)
    expect(r).toEqual({ enviado: true, modo: 'email' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(configDoResend(env)).toEqual({ chave: 're_x', remetente: env.EMAIL_REMETENTE })
  })
})

describe('configuração', () => {
  it('as duas variáveis estão no inventário', () => {
    const nomes = VARIAVEIS.map((v) => v.nome)
    expect(nomes).toContain('RESEND_API_KEY')
    expect(nomes).toContain('EMAIL_REMETENTE')
  })

  it('produção com AUTH_REQUIRED=1 e sem Resend: o boot avisa (não aborta)', () => {
    const prod = { NODE_ENV: 'production' }
    expect(avisoDeConviteSemEmail(prod, true)).toMatch(/convite/i)
    expect(
      avisoDeConviteSemEmail({ ...prod, RESEND_API_KEY: 're_x', EMAIL_REMETENTE: 'Babel <a@b.com>' }, true),
    ).toBeNull()
    expect(avisoDeConviteSemEmail(prod, false), 'self-host não tem menor com conta').toBeNull()
    expect(avisoDeConviteSemEmail({ NODE_ENV: 'development' }, true), 'dev usa o link na tela').toBeNull()
  })
})
