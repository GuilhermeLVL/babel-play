/**
 * MENORES COM SEGURANÇA (Fase 4 do plano de lançamento — ECA Digital, Lei 15.211/2025, e LGPD
 * art. 14), exercitado pelo servidor DE VERDADE (`criarApp`) em modo público, com JWT.
 *
 * Contratos:
 * 1. A data de nascimento é declarada uma vez e fica no servidor; a faixa é derivada dela.
 * 2. Menor de 16 SEM vínculo aceito fica sem nuvem: as rotas de dados respondem 403
 *    `responsavel_pendente` (o cliente cai no modo local). A conta, a exclusão e o convite seguem.
 * 3. O convite ao responsável é um token de USO ÚNICO e com EXPIRAÇÃO; quem aceita é um ADULTO
 *    logado, que não pode ser a própria conta do menor.
 * 4. Menor de 12 exige o consentimento ESPECÍFICO do responsável, registrado (quem, quando, texto).
 * 5. Perfil protegido: menor não entra no ranking público.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const tokens: Record<string, string> = {}

const hoje = new Date()
/** `AAAA-MM-DD` de alguém com `anos` completos hoje (aniversário há ~40 dias). */
function nascidoHa(anos: number): string {
  const d = new Date(hoje.getTime() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}

async function tk(sub: string): Promise<string> {
  tokens[sub] ??= await s.token(sub)
  return tokens[sub]
}
async function declarar(sub: string, anos: number) {
  const r = await s.put('/api/me/idade', { nascimento: nascidoHa(anos) }, await tk(sub))
  expect(r.status, `declarar idade de ${sub}`).toBe(200)
  return r.json()
}
function tokenDoLink(link: string): string {
  return new URL(link, 'http://x').searchParams.get('token') ?? ''
}
async function convidar(sub: string, email = 'responsavel@exemplo.com'): Promise<string> {
  const r = await s.post('/api/me/responsavel/convite', { email }, await tk(sub))
  expect(r.status, `convite de ${sub}`).toBe(201)
  const corpo = await r.json()
  expect(corpo.linkDeTeste, 'no modo de teste o link aparece na resposta').toMatch(/token=/)
  return tokenDoLink(corpo.linkDeTeste)
}

beforeAll(async () => {
  process.env.CONVITE_LINK_NA_TELA = '1'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.CONVITE_LINK_NA_TELA
  await s.encerrar()
})

describe('data de nascimento', () => {
  it('sem data: o servidor diz que falta, e a faixa é desconhecida (protegida por padrão)', async () => {
    const r = await s.get('/api/me/idade', await tk('u-sem-data'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ nascimentoInformado: false, faixa: null, protegido: true })
  })

  it('declara uma vez; tentar trocar depois é recusado', async () => {
    expect(await declarar('u-adulto-1', 30)).toMatchObject({ faixa: 'adulto', protegido: false, restrita: false })
    const troca = await s.put('/api/me/idade', { nascimento: nascidoHa(10) }, await tk('u-adulto-1'))
    expect(troca.status).toBe(409)
    // Repetir a MESMA data é idempotente.
    const igual = await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, await tk('u-adulto-1'))
    expect(igual.status).toBe(200)
  })

  it('data inválida ou no futuro é recusada', async () => {
    for (const nascimento of [
      '2020-13-40',
      'ontem',
      new Date(Date.now() + 86_400_000 * 3).toISOString().slice(0, 10),
    ]) {
      const r = await s.put('/api/me/idade', { nascimento }, await tk('u-data-ruim'))
      expect(r.status, nascimento).toBe(400)
    }
  })

  it('as faixas: <12, 12–15, 16–17, 18+', async () => {
    expect((await declarar('u-f10', 10)).faixa).toBe('menor-12')
    expect((await declarar('u-f13', 13)).faixa).toBe('12-15')
    expect((await declarar('u-f17', 17)).faixa).toBe('16-17')
    expect((await declarar('u-f18', 18)).faixa).toBe('adulto')
  })
})

describe('menor de 16 sem vínculo fica sem nuvem', () => {
  it('as rotas de dados respondem 403 responsavel_pendente; conta e convite seguem', async () => {
    await declarar('u-teen', 14)
    const t = await tk('u-teen')
    const sessoes = await s.get('/api/sessions', t)
    expect(sessoes.status).toBe(403)
    expect((await sessoes.json()).code).toBe('responsavel_pendente')
    expect((await s.get('/api/vocab', t)).status).toBe(403)
    expect((await s.get('/api/me/idade', t)).status).toBe(200)
    expect((await s.get('/api/me/exportar', t)).status, 'direitos do titular nunca travam').toBe(200)
  })

  it('16–17 não precisa de vínculo para a nuvem (mas continua protegido)', async () => {
    const e = await declarar('u-17', 17)
    expect(e).toMatchObject({ restrita: false, protegido: true, exigeResponsavel: false })
    expect((await s.get('/api/sessions', await tk('u-17'))).status).toBe(200)
  })
})

describe('convite ao responsável', () => {
  it('um adulto aceita, o vínculo libera a nuvem, e o mesmo token não serve de novo', async () => {
    await declarar('u-teen-2', 13)
    const token = await convidar('u-teen-2')
    await declarar('u-mae', 42)
    const mae = await tk('u-mae')

    const ver = await s.get(`/api/responsavel/convite?token=${encodeURIComponent(token)}`, mae)
    expect(ver.status).toBe(200)
    expect(await ver.json()).toMatchObject({ faixa: '12-15', exigeConsentimentoEspecifico: false })

    const aceite = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Maria Souza', declaroSerResponsavelLegal: true },
      mae,
    )
    expect(aceite.status).toBe(200)
    expect((await s.get('/api/sessions', await tk('u-teen-2'))).status).toBe(200)
    const estado = await (await s.get('/api/me/idade', await tk('u-teen-2'))).json()
    expect(estado.vinculo).toMatchObject({ estado: 'aceito', responsavel: 'Maria Souza' })

    const deNovo = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Outra Pessoa', declaroSerResponsavelLegal: true },
      await tk('u-adulto-1'),
    )
    expect(deNovo.status, 'token de uso único').toBe(410)

    const lista = await (await s.get('/api/responsavel/vinculados', mae)).json()
    expect(lista.vinculados.map((v: { menorId: string }) => v.menorId)).toContain('u-teen-2')
  })

  it('token expirado não vale', async () => {
    await declarar('u-teen-3', 12)
    const token = await convidar('u-teen-3')
    const { db } = await s.load('../../server/db/db')
    const { vinculosDeResponsavel } = await s.load('../../server/db/schema')
    const { eq } = await s.load('drizzle-orm')
    await db
      .update(vinculosDeResponsavel)
      .set({ expiraEm: Date.now() - 1000 })
      .where(eq(vinculosDeResponsavel.userId, 'u-teen-3'))
    const r = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Pai', declaroSerResponsavelLegal: true },
      await tk('u-mae'),
    )
    expect(r.status).toBe(410)
    expect((await r.json()).code).toBe('convite_expirado')
  })

  it('token inventado não vale', async () => {
    const r = await s.post(
      '/api/responsavel/aceitar',
      { token: 'x'.repeat(43), nomeDoResponsavel: 'Pai', declaroSerResponsavelLegal: true },
      await tk('u-mae'),
    )
    expect(r.status).toBe(404)
  })

  it('quem aceita precisa ser adulto declarado e não pode ser a própria conta', async () => {
    await declarar('u-teen-4', 15)
    const token = await convidar('u-teen-4')
    const semData = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Alguém', declaroSerResponsavelLegal: true },
      await tk('u-sem-data-2'),
    )
    expect(semData.status).toBe(403)
    const menor = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Colega', declaroSerResponsavelLegal: true },
      await tk('u-17'),
    )
    expect(menor.status).toBe(403)
    const proprio = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Eu', declaroSerResponsavelLegal: true },
      await tk('u-teen-4'),
    )
    expect(proprio.status).toBe(403)
    // Nenhuma dessas tentativas gastou o token: o responsável de verdade ainda aceita.
    const ok = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Maria Souza', declaroSerResponsavelLegal: true },
      await tk('u-mae'),
    )
    expect(ok.status).toBe(200)
  })
})

describe('menor de 12: consentimento específico (LGPD art. 14 §1º)', () => {
  it('sem o consentimento específico o aceite é recusado e a conta segue sem nuvem', async () => {
    await declarar('u-crianca', 9)
    const token = await convidar('u-crianca')
    const ver = await (
      await s.get(`/api/responsavel/convite?token=${encodeURIComponent(token)}`, await tk('u-mae'))
    ).json()
    expect(ver.exigeConsentimentoEspecifico).toBe(true)
    expect(ver.textoDoConsentimento.length).toBeGreaterThan(80)

    const sem = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Maria Souza', declaroSerResponsavelLegal: true },
      await tk('u-mae'),
    )
    expect(sem.status).toBe(400)
    expect((await sem.json()).code).toBe('consentimento_obrigatorio')
    expect((await s.get('/api/sessions', await tk('u-crianca'))).status).toBe(403)

    const com = await s.post(
      '/api/responsavel/aceitar',
      {
        token,
        nomeDoResponsavel: 'Maria Souza',
        declaroSerResponsavelLegal: true,
        consentimentoEspecifico: true,
        versaoDoConsentimento: ver.versao,
      },
      await tk('u-mae'),
    )
    expect(com.status).toBe(200)
    expect((await s.get('/api/sessions', await tk('u-crianca'))).status).toBe(200)

    // O registro: quem, quando e o texto aceito.
    const { db } = await s.load('../../server/db/db')
    const { vinculosDeResponsavel } = await s.load('../../server/db/schema')
    const { eq } = await s.load('drizzle-orm')
    const [linha] = await db.select().from(vinculosDeResponsavel).where(eq(vinculosDeResponsavel.userId, 'u-crianca'))
    expect(linha).toMatchObject({ responsavelUserId: 'u-mae', nomeDoResponsavel: 'Maria Souza' })
    expect(linha.consentimentoEm).toBeGreaterThan(0)
    expect(linha.consentimentoTexto).toBe(ver.textoDoConsentimento)
    expect(linha.consentimentoVersao).toBe(ver.versao)
  })
})

describe('perfil protegido: sem ranking público', () => {
  const envio = { apelido: 'Jogador', pontos: 100, combo: 3 }
  it('menor não publica no ranking; adulto publica', async () => {
    const menor = await s.post('/api/rank/memory', envio, await tk('u-17'))
    expect(menor.status).toBe(403)
    expect((await menor.json()).code).toBe('perfil_protegido')
    const adulto = await s.post('/api/rank/memory', { ...envio, apelido: 'Adulto' }, await tk('u-adulto-1'))
    expect(adulto.status).toBe(200)
  })

  it('sem conta (idade desconhecida) também não publica', async () => {
    const r = await s.post('/api/rank/memory', { ...envio, apelido: 'Anon' })
    expect([401, 403]).toContain(r.status)
  })
})
