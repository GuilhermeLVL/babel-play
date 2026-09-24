/**
 * CARACTERIZAÇÃO — idade declarada (`GET/PUT /api/me/idade`) e convite ao responsável
 * (`POST /api/me/responsavel/convite`), por HTTP, no modo público (Fase 4 — ECA Digital art. 24 e
 * LGPD art. 14).
 *
 * Contratos gravados:
 * 1. Sem token, 401. Sem data declarada, a faixa é desconhecida e a conta conta como protegida.
 * 2. A data se declara UMA vez: repetir a mesma é idempotente, trocar é 409.
 * 3. Só quem precisa de vínculo (menor de 16) convida; adulto recebe 409. E-mail inválido é 400.
 * 4. O convite é um token de USO ÚNICO e com EXPIRAÇÃO de 7 dias; convidar de novo substitui o
 *    anterior. Fora de produção o link volta na resposta (`linkDeTeste`) — é o que permite testar.
 * 5. A resposta nunca devolve o e-mail em claro, só mascarado.
 * 6. No máximo 5 convites por conta em 24 h (429 `limite_de_convites`): o convite dispara e-mail
 *    para um endereço que o menor digita, e sem teto a rota vira canal de spam.
 * 7. Com o Resend configurado, o convite sai por e-mail; se o envio falha, 502
 *    `convite_nao_enviado` com mensagem clara, o convite novo é descartado (não conta no limite)
 *    e o anterior, que já tinha saído, continua valendo.
 *
 * O fluxo completo do aceite (adulto, consentimento de menor de 12, faixas) está em
 * `tests/integration/menores-e-responsavel.test.ts`; aqui fica o contrato das duas rotas.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, resposta, subirApp } from './_app'

const SETE_DIAS = 7 * 86_400_000

/** `AAAA-MM-DD` de alguém com `anos` completos hoje (aniversário há ~40 dias). */
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}
const tokenDoLink = (link: string): string => new URL(link, 'http://x').searchParams.get('token') ?? ''

describe('idade e convite ao responsavel (modo publico)', () => {
  let s: AppDeTeste
  const tokens: Record<string, string> = {}
  const tk = async (sub: string) => (tokens[sub] ??= await s.token(sub))

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
  })
  afterAll(async () => {
    await s.encerrar()
  })

  describe('GET /api/me/idade', () => {
    it('sem token: 401', async () => {
      expect((await s.get('/api/me/idade')).status).toBe(401)
    })

    it('sem data declarada: faixa desconhecida, protegida, com a forma conhecida', async () => {
      const r = await s.get('/api/me/idade', await tk('sem-data'))
      expect(r.status).toBe(200)
      expect(await r.clone().json()).toMatchObject({ nascimentoInformado: false, faixa: null, protegido: true })
      await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
        '__snapshots__/get.me.idade.sem-data.json',
      )
    })

    it('depois de declarar: a faixa vem do servidor, e a idade nao se troca (409)', async () => {
      expect((await s.put('/api/me/idade', { nascimento: nascidoHa(14) }, await tk('menor-14'))).status).toBe(200)
      const r = await s.get('/api/me/idade', await tk('menor-14'))
      expect(await r.clone().json()).toMatchObject({
        nascimentoInformado: true,
        faixa: '12-15',
        restrita: true,
        exigeResponsavel: true,
        vinculo: { estado: 'nenhum' },
      })
      await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
        '__snapshots__/get.me.idade.menor.json',
      )

      const troca = await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, await tk('menor-14'))
      expect(troca.status).toBe(409)
      expect((await troca.json()).code).toBe('nascimento_ja_informado')
      expect((await (await s.get('/api/me/idade', await tk('menor-14'))).json()).faixa).toBe('12-15')

      const igual = await s.put('/api/me/idade', { nascimento: nascidoHa(14) }, await tk('menor-14'))
      expect(igual.status, 'repetir a mesma data e idempotente').toBe(200)
    })
  })

  describe('POST /api/me/responsavel/convite', () => {
    beforeAll(async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(35) }, await tk('adulto'))
      await s.put('/api/me/idade', { nascimento: nascidoHa(42) }, await tk('mae'))
      await s.put('/api/me/idade', { nascimento: nascidoHa(13) }, await tk('menor-13'))
    })

    it('sem token: 401', async () => {
      expect((await s.post('/api/me/responsavel/convite', { email: 'resp@exemplo.com' })).status).toBe(401)
    })

    it('e-mail invalido: 400 email_invalido', async () => {
      for (const email of [undefined, '', 'nao-e-email', 'a'.repeat(200) + '@x.com']) {
        const r = await s.post('/api/me/responsavel/convite', { email }, await tk('menor-13'))
        expect(r.status, String(email)).toBe(400)
        expect((await r.json()).code).toBe('email_invalido')
      }
    })

    it('adulto nao precisa de vinculo: 409 vinculo_desnecessario', async () => {
      const r = await s.post('/api/me/responsavel/convite', { email: 'resp@exemplo.com' }, await tk('adulto'))
      expect(r.status).toBe(409)
      expect((await r.json()).code).toBe('vinculo_desnecessario')
    })

    it('menor convida: 201, e-mail mascarado, validade de 7 dias e o link de teste', async () => {
      const antes = Date.now()
      const r = await s.post('/api/me/responsavel/convite', { email: 'Mae.Silva@Exemplo.com' }, await tk('menor-13'))
      expect(r.status).toBe(201)
      const corpo = await r.clone().json()
      expect(JSON.stringify(corpo)).not.toContain('mae.silva@exemplo.com')
      expect(corpo.emailMascarado).toMatch(/\*/)
      expect(corpo.expiraEm).toBeGreaterThanOrEqual(antes + SETE_DIAS)
      expect(corpo.expiraEm).toBeLessThanOrEqual(Date.now() + SETE_DIAS)
      expect(corpo.linkDeTeste).toMatch(/\/responsavel\?token=/)
      await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
        '__snapshots__/post.me.responsavel.convite.json',
      )
      const estado = await (await s.get('/api/me/idade', await tk('menor-13'))).json()
      expect(estado.vinculo).toMatchObject({ estado: 'convidado' })
    })

    it('o token e de uso unico, e convidar de novo invalida o anterior', async () => {
      const primeiro = tokenDoLink(
        (await (await s.post('/api/me/responsavel/convite', { email: 'a@exemplo.com' }, await tk('menor-13'))).json())
          .linkDeTeste,
      )
      const segundo = tokenDoLink(
        (await (await s.post('/api/me/responsavel/convite', { email: 'b@exemplo.com' }, await tk('menor-13'))).json())
          .linkDeTeste,
      )
      const aceitar = (token: string) =>
        s.post(
          '/api/responsavel/aceitar',
          { token, nomeDoResponsavel: 'Maria', declaroSerResponsavelLegal: true },
          tokens.mae,
        )

      expect((await aceitar(primeiro)).status, 'substituido pelo mais novo').toBe(404)
      expect((await aceitar(segundo)).status).toBe(200)
      expect((await aceitar(segundo)).status, 'uso unico').toBe(410)

      const depois = await s.post('/api/me/responsavel/convite', { email: 'c@exemplo.com' }, await tk('menor-13'))
      expect(depois.status, 'conta ja vinculada nao convida de novo').toBe(409)
      expect((await depois.json()).code).toBe('ja_vinculada')
    })

    it('convite expirado nao vale (410 convite_expirado)', async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(12) }, await tk('menor-12'))
      const link = (
        await (await s.post('/api/me/responsavel/convite', { email: 'p@exemplo.com' }, await tk('menor-12'))).json()
      ).linkDeTeste
      const { db } = await s.load('../../server/db/db')
      const { vinculosDeResponsavel } = await s.load('../../server/db/schema')
      const { eq } = await s.load('drizzle-orm')
      await db
        .update(vinculosDeResponsavel)
        .set({ expiraEm: Date.now() - 1000 })
        .where(eq(vinculosDeResponsavel.userId, 'menor-12'))
      const r = await s.post(
        '/api/responsavel/aceitar',
        { token: tokenDoLink(link), nomeDoResponsavel: 'Pai', declaroSerResponsavelLegal: true },
        tokens.mae,
      )
      expect(r.status).toBe(410)
      expect((await r.json()).code).toBe('convite_expirado')
    })

    it('limite por conta: 5 convites em 24 h; o sexto e 429, e outra conta nao e afetada', async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(14) }, await tk('menor-insistente'))
      for (let n = 1; n <= 5; n++) {
        const r = await s.post(
          '/api/me/responsavel/convite',
          { email: `resp${n}@exemplo.com` },
          await tk('menor-insistente'),
        )
        expect(r.status, `convite ${n}`).toBe(201)
      }
      const sexto = await s.post(
        '/api/me/responsavel/convite',
        { email: 'r6@exemplo.com' },
        await tk('menor-insistente'),
      )
      expect(sexto.status).toBe(429)
      expect(sexto.headers.get('retry-after')).toBeTruthy()
      const corpo = await sexto.json()
      expect(corpo.code).toBe('limite_de_convites')
      expect(corpo.error).toMatch(/24 horas/)

      await s.put('/api/me/idade', { nascimento: nascidoHa(13) }, await tk('menor-vizinho'))
      expect(
        (await s.post('/api/me/responsavel/convite', { email: 'v@exemplo.com' }, await tk('menor-vizinho'))).status,
      ).toBe(201)
    })

    it('o limite olha as ultimas 24 h: convites mais antigos nao contam', async () => {
      const { db } = await s.load('../../server/db/db')
      const { vinculosDeResponsavel } = await s.load('../../server/db/schema')
      const { eq } = await s.load('drizzle-orm')
      await db
        .update(vinculosDeResponsavel)
        .set({ createdAt: Date.now() - 25 * 3_600_000 })
        .where(eq(vinculosDeResponsavel.userId, 'menor-insistente'))
      const r = await s.post('/api/me/responsavel/convite', { email: 'r7@exemplo.com' }, await tk('menor-insistente'))
      expect(r.status).toBe(201)
    })
  })

  describe('POST /api/me/responsavel/convite com o Resend configurado', () => {
    const real = globalThis.fetch
    let pedidosAoResend: Array<{ url: string; corpo: Record<string, unknown> }> = []

    function simularResend(status: number) {
      pedidosAoResend = []
      process.env.RESEND_API_KEY = 're_teste'
      process.env.EMAIL_REMETENTE = 'Babel Play <nao-responda@exemplo.com>'
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init) => {
        const url = String(entrada instanceof Request ? entrada.url : entrada)
        if (url.startsWith(s.base)) return real(entrada, init)
        pedidosAoResend.push({ url, corpo: JSON.parse(String(init?.body)) })
        return new Response(status < 300 ? '{"id":"e1"}' : '{"message":"falhou"}', { status })
      })
    }
    afterEach(() => {
      vi.restoreAllMocks()
      delete process.env.RESEND_API_KEY
      delete process.env.EMAIL_REMETENTE
    })

    it('sucesso: 201 enviado por e-mail, para o endereco informado', async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(15) }, await tk('menor-com-email'))
      simularResend(200)
      const r = await s.post('/api/me/responsavel/convite', { email: 'Pai@Exemplo.com' }, await tk('menor-com-email'))
      expect(r.status).toBe(201)
      expect(await r.json()).toMatchObject({ enviado: true, modo: 'email' })
      expect(pedidosAoResend).toHaveLength(1)
      expect(pedidosAoResend[0].url).toBe('https://api.resend.com/emails')
      expect(pedidosAoResend[0].corpo.to).toEqual(['pai@exemplo.com'])
    })

    it('o Resend falha: 502 com mensagem clara, e o convite anterior continua valendo', async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(14) }, await tk('menor-sem-sorte'))
      const anterior = tokenDoLink(
        (
          await (
            await s.post('/api/me/responsavel/convite', { email: 'antigo@exemplo.com' }, await tk('menor-sem-sorte'))
          ).json()
        ).linkDeTeste,
      )

      simularResend(500)
      const r = await s.post('/api/me/responsavel/convite', { email: 'novo@exemplo.com' }, await tk('menor-sem-sorte'))
      expect(r.status).toBe(502)
      const corpo = await r.json()
      expect(corpo.code).toBe('convite_nao_enviado')
      expect(corpo.error).toMatch(/tente de novo em alguns minutos/i)
      expect(JSON.stringify(corpo)).not.toContain('novo@exemplo.com')
      expect(corpo.linkDeTeste, 'convite que nao saiu nao tem link').toBeUndefined()
      vi.restoreAllMocks()

      const estado = await (await s.get('/api/me/idade', await tk('menor-sem-sorte'))).json()
      expect(estado.vinculo.emailMascarado).toMatch(/^an/)
      const aceite = await s.post(
        '/api/responsavel/aceitar',
        { token: anterior, nomeDoResponsavel: 'Maria', declaroSerResponsavelLegal: true },
        tokens.mae,
      )
      expect(aceite.status, 'a falha nao revogou o convite que ja tinha saido').toBe(200)
    })

    it('envio que falhou nao conta no limite diario', async () => {
      await s.put('/api/me/idade', { nascimento: nascidoHa(13) }, await tk('menor-resend-fora'))
      simularResend(503)
      for (let n = 0; n < 6; n++) {
        const r = await s.post('/api/me/responsavel/convite', { email: 'x@exemplo.com' }, await tk('menor-resend-fora'))
        expect(r.status).toBe(502)
      }
      simularResend(200)
      const r = await s.post('/api/me/responsavel/convite', { email: 'x@exemplo.com' }, await tk('menor-resend-fora'))
      expect(r.status).toBe(201)
    })
  })
})
