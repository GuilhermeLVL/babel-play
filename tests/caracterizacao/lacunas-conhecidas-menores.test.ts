/**
 * LACUNAS CONHECIDAS — duas brechas da proteção de menores achadas na auditoria, GRAVADAS COMO ESTÃO.
 *
 * Estes testes NÃO aprovam o comportamento: documentam o que o servidor faz HOJE, para que a
 * decisão do dono (fechar a brecha ou aceitá-la) vire uma troca consciente de teste, e não uma
 * mudança silenciosa. Cada lacuna tem dois testes:
 *  - `LACUNA CONHECIDA ...`: afirma o comportamento atual (passa liberado). Quando o dono fechar a
 *    brecha, ele FALHA; é o sinal para apagá-lo.
 *  - `DESEJADO ...` (`it.fails`): afirma o que a auditoria recomenda. Passa ENQUANTO a brecha existe
 *    (o `it.fails` espera a falha); quando a brecha fechar ele passa de verdade e o vitest reclama,
 *    o sinal para trocar `it.fails` por `it`.
 *
 * 1. Conta SEM data de nascimento declarada (achado ALTO): `estadoDeProtecao` a trata como
 *    `protegido`, mas `restrita` só vale para menor de 16 declarado; então as rotas de nuvem (que
 *    usam `exigirContaLiberada`) respondem normalmente. Desejado: 403 `idade_nao_informada`.
 * 2. `POST /api/responsavel/aceitar` por conta adulta cujo e-mail é DIFERENTE do digitado no convite:
 *    o servidor nunca compara o e-mail do convite com o de quem aceita (o token é a única prova de
 *    posse). Quem receber o link, mesmo de outro endereço, vira responsável.
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

describe('LACUNA 1: conta sem data de nascimento declarada na nuvem', () => {
  it('pré-condição: o servidor sabe que ela é protegida e que a idade falta', async () => {
    const e = await (await s.get('/api/me/idade', await tk('sem-data'))).json()
    expect(e).toMatchObject({ nascimentoInformado: false, faixa: null, protegido: true, restrita: false })
  })

  it('LACUNA CONHECIDA: sem data, as rotas de nuvem passam liberadas (200), não bloqueiam', async () => {
    const t = await tk('sem-data')
    for (const rota of ['/api/ai/glossario', '/api/sessions', '/api/vocab']) {
      const r = await s.get(rota, t)
      expect(r.status, `${rota} hoje libera quem não declarou a idade`).toBe(200)
    }
  })

  // Troque por `it` (e apague o teste acima) quando o dono decidir fechar a brecha.
  it.fails('DESEJADO: sem data, a rota de nuvem responde 403 idade_nao_informada', async () => {
    const r = await s.get('/api/ai/glossario', await tk('sem-data'))
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('idade_nao_informada')
  })
})

describe('LACUNA 2: /aceitar não confere o e-mail do convite', () => {
  async function convidar(menor: string, emailDigitado: string): Promise<string> {
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(13) }, await tk(menor))).status).toBe(200)
    const r = await s.post('/api/me/responsavel/convite', { email: emailDigitado }, await tk(menor))
    expect(r.status).toBe(201)
    return tokenDoLink((await r.json()).linkDeTeste)
  }

  it('LACUNA CONHECIDA: adulto com e-mail DIFERENTE do convite aceita e vira responsável (200)', async () => {
    const token = await convidar('menor-a', 'mae.de-verdade@exemplo.com')
    const estranho = await tk('adulto-estranho', { email: 'outra.pessoa@exemplo.com' })
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, estranho)).status).toBe(200)

    const r = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Outra Pessoa', declaroSerResponsavelLegal: true },
      estranho,
    )
    expect(r.status, 'hoje nenhum código compara o e-mail do convite com o de quem aceita').toBe(200)
    const estado = await (await s.get('/api/me/idade', await tk('menor-a'))).json()
    expect(estado.vinculo).toMatchObject({ estado: 'aceito' })
    // E o vínculo libera a nuvem do menor: a brecha tem efeito real.
    expect((await s.get('/api/sessions', await tk('menor-a'))).status).toBe(200)
  })

  // Troque por `it` (e apague o teste acima) quando o dono decidir conferir o e-mail.
  it.fails('DESEJADO: adulto com e-mail diferente do convite é recusado (403)', async () => {
    const token = await convidar('menor-b', 'mae.de-verdade@exemplo.com')
    const estranho = await tk('adulto-estranho-2', { email: 'outra.pessoa@exemplo.com' })
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, estranho)).status).toBe(200)
    const r = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Outra Pessoa', declaroSerResponsavelLegal: true },
      estranho,
    )
    expect(r.status).toBe(403)
  })
})
