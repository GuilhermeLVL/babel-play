/**
 * AS DUAS BRECHAS DA PROTEÇÃO DE MENORES achadas na auditoria de 17/10/2026, AGORA FECHADAS:
 *
 * 1. Conta SEM data de nascimento: as rotas de nuvem respondem 403 `idade_nao_informada` (antes passavam liberadas).
 * 2. `POST /api/responsavel/aceitar`: só aceita a conta cujo e-mail é o do convite (403 `convite_de_outro_email`);
 *    antes quem recebesse o link, de qualquer endereço, virava responsável.
 *
 * Servidor de verdade (`criarApp`) em modo público, com JWT, como `idade-e-convite.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
const tokens: Record<string, string> = {}
const tk = async (sub: string, claims?: Record<string, unknown>) => (tokens[sub] ??= await s.token(sub, claims))

/** `AAAA-MM-DD` de alguém com `anos` completos hoje (aniversário há ~40 dias). */
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}
const tokenDoLink = (link: string): string => new URL(link, 'http://x').searchParams.get('token') ?? ''

beforeAll(async () => {
  process.env.CONVITE_LINK_NA_TELA = '1'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.CONVITE_LINK_NA_TELA
  await s.encerrar()
})

describe('conta sem data de nascimento declarada na nuvem', () => {
  it('pré-condição: o servidor sabe que ela é protegida e que a idade falta', async () => {
    const e = await (await s.get('/api/me/idade', await tk('sem-data'))).json()
    expect(e).toMatchObject({ nascimentoInformado: false, faixa: null, protegido: true })
  })

  it('as rotas de nuvem respondem 403 idade_nao_informada', async () => {
    const t = await tk('sem-data')
    for (const rota of ['/api/ai/glossario', '/api/sessions', '/api/vocab']) {
      const r = await s.get(rota, t)
      expect(r.status, rota).toBe(403)
      expect((await r.json()).code, rota).toBe('idade_nao_informada')
    }
  })

  it('a conta, a idade e o convite continuam abertos: o direito do titular nunca trava', async () => {
    const t = await tk('sem-data')
    expect((await s.get('/api/me/idade', t)).status).toBe(200)
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, t)).status).toBe(200)
    expect((await s.get('/api/sessions', t)).status).toBe(200)
  })
})

describe('/aceitar confere o e-mail do convite', () => {
  async function convidar(menor: string, emailDigitado: string): Promise<string> {
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(13) }, await tk(menor))).status).toBe(200)
    const r = await s.post('/api/me/responsavel/convite', { email: emailDigitado }, await tk(menor))
    expect(r.status).toBe(201)
    return tokenDoLink((await r.json()).linkDeTeste)
  }
  const aceite = (token: string) => ({ token, nomeDoResponsavel: 'Responsável', declaroSerResponsavelLegal: true })

  it('adulto com e-mail DIFERENTE do convite é recusado (403) e o convite não é gasto', async () => {
    const token = await convidar('menor-a', 'mae.de-verdade@exemplo.com')
    const estranho = await tk('adulto-estranho', { email: 'outra.pessoa@exemplo.com' })
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, estranho)).status).toBe(200)
    const r = await s.post('/api/responsavel/aceitar', aceite(token), estranho)
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('convite_de_outro_email')
    expect((await (await s.get('/api/me/idade', await tk('menor-a'))).json()).vinculo.estado).toBe('convidado')

    // A mãe de verdade ainda consegue aceitar com o mesmo link (caixa do e-mail não importa).
    const mae = await tk('mae-de-verdade', { email: 'Mae.De-Verdade@Exemplo.com' })
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(35) }, mae)).status).toBe(200)
    expect((await s.post('/api/responsavel/aceitar', aceite(token), mae)).status).toBe(200)
  })

  it('token sem e-mail não aceita', async () => {
    const token = await convidar('menor-b', 'resp@exemplo.com')
    const semEmail = await tk('adulto-sem-email')
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, semEmail)).status).toBe(200)
    expect((await s.post('/api/responsavel/aceitar', aceite(token), semEmail)).status).toBe(403)
  })
})
