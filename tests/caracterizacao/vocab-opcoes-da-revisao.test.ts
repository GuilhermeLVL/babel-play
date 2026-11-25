/**
 * CARACTERIZAÇÃO — as opções da revisão na conta e o limite diário, por HTTP (openspec `cartoes`, 2.1 e 2.2; tabela
 * `opcoes_da_revisao`, migração PG 0035 provisória):
 *
 * 1. sem token, 401; corpo vazio ou fora da faixa, 400;
 * 2. sem linha, o padrão (`naConta: false`); PUT é parcial e mescla; dois "aparelhos" da mesma conta veem o mesmo;
 * 3. o feito de hoje soma as notas de rodadas diferentes (novas e revisões separadas); conta nova começa em zero;
 * 4. a virada do dia (no fuso da conta) zera o contador;
 * 5. o limite é preferência da pessoa: o que resta nunca passa de zero, e não há teto por plano;
 * 6. LGPD: a exportação traz as opções e a exclusão da conta as apaga (só as da pessoa).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

interface Resposta {
  opcoes: {
    novas: number
    revisoes: number
    ordem: string
    tipo: string
    ouvir: boolean
    retencao: number
    botoes: number
  }
  naConta: boolean
  hoje: { novas: number; revisoes: number; restamNovas: number; restamRevisoes: number }
}

describe('opcoes da revisao na conta (modo publico)', () => {
  let s: AppDeTeste
  let ana: string
  let bia: string

  const ler = async (token: string): Promise<Resposta> => {
    const r = await s.get('/api/vocab/opcoes-da-revisao', token)
    expect(r.status).toBe(200)
    return (await r.json()) as Resposta
  }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('opcoes-ana')
    bia = await s.token('opcoes-bia')
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('sem token: 401 nas duas rotas', async () => {
    expect((await s.get('/api/vocab/opcoes-da-revisao')).status).toBe(401)
    expect((await s.put('/api/vocab/opcoes-da-revisao', { novas: 5 })).status).toBe(401)
  })

  it('validação: corpo vazio e valores fora da faixa são 400', async () => {
    const put = (b: unknown) => s.put('/api/vocab/opcoes-da-revisao', b, ana)
    expect((await put({})).status).toBe(400)
    expect((await put({ novas: -1 })).status).toBe(400)
    expect((await put({ novas: 201 })).status).toBe(400)
    expect((await put({ revisoes: 9 })).status).toBe(400)
    expect((await put({ retencao: 98 })).status).toBe(400)
    expect((await put({ botoes: 3 })).status).toBe(400)
    expect((await put({ ordem: 'aleatoria' })).status).toBe(400)
    expect((await put({ tipo: 'falar' })).status).toBe(400)
    expect((await put({ novas: 1.5 })).status).toBe(400)
  })

  it('sem linha vale o padrão e nada foi estudado hoje (conta nova não herda)', async () => {
    const r = await ler(bia)
    expect(r.naConta).toBe(false)
    expect(r.opcoes).toEqual({
      novas: 20,
      revisoes: 200,
      ordem: 'vencidas',
      tipo: 'lembrar',
      ouvir: true,
      retencao: 90,
      botoes: 4,
    })
    expect(r.hoje).toEqual({ novas: 0, revisoes: 0, restamNovas: 20, restamRevisoes: 200 })
  })

  it('PUT é parcial e mescla; outro aparelho da mesma conta vê o mesmo; outra conta não', async () => {
    const a = await s.put('/api/vocab/opcoes-da-revisao', { novas: 5, botoes: 2 }, ana)
    expect(a.status).toBe(200)
    expect(((await a.json()) as Resposta).opcoes).toMatchObject({ novas: 5, revisoes: 200, botoes: 2, retencao: 90 })
    await s.put('/api/vocab/opcoes-da-revisao', { revisoes: 50, ordem: 'misturar' }, ana)
    // "outro aparelho": nova leitura com o mesmo token, sem nenhum estado local.
    const outroAparelho = await ler(ana)
    expect(outroAparelho.naConta).toBe(true)
    expect(outroAparelho.opcoes).toMatchObject({ novas: 5, revisoes: 50, ordem: 'misturar', botoes: 2 })
    expect((await ler(bia)).opcoes.novas).toBe(20)
  })

  it('o feito de hoje soma rodadas diferentes: novas e revisões separadas', async () => {
    const add = await s.post(
      '/api/vocab/bulk-add',
      {
        cards: [
          { word: 'harvest', srcLang: 'en', back: 'colheita', sentence: 'The harvest was good.' },
          { word: 'orchard', srcLang: 'en', back: 'pomar', sentence: 'The orchard is full.' },
          { word: 'meadow', srcLang: 'en', back: 'prado', sentence: 'A meadow in spring.' },
        ],
      },
      ana,
    )
    expect(add.status).toBe(200)
    const cartoes = (await (await s.get('/api/vocab', ana)).json()) as Array<{ id: string; word: string }>
    const id = (w: string) => cartoes.find((c) => c.word === w)!.id
    // Rodada 1: duas novas.
    expect((await s.post(`/api/vocab/${id('harvest')}/review`, { grade: 3 }, ana)).status).toBe(200)
    expect((await s.post(`/api/vocab/${id('orchard')}/review`, { grade: 3 }, ana)).status).toBe(200)
    expect((await ler(ana)).hoje).toEqual({ novas: 2, revisoes: 0, restamNovas: 3, restamRevisoes: 50 })
    // Rodada 2: mais uma nova e uma segunda nota num cartão já visto (conta como revisão).
    expect((await s.post(`/api/vocab/${id('meadow')}/review`, { grade: 1 }, ana)).status).toBe(200)
    expect((await s.post(`/api/vocab/${id('harvest')}/review`, { grade: 3 }, ana)).status).toBe(200)
    expect((await ler(ana)).hoje).toEqual({ novas: 3, revisoes: 1, restamNovas: 2, restamRevisoes: 49 })
    // A outra conta continua em zero.
    expect((await ler(bia)).hoje.novas).toBe(0)
  })

  it('o que resta nunca é negativo: limite menor que o feito dá zero', async () => {
    await s.put('/api/vocab/opcoes-da-revisao', { novas: 1 }, ana)
    const r = await ler(ana)
    expect(r.hoje.novas).toBe(3)
    expect(r.hoje.restamNovas).toBe(0)
  })

  it('a virada do dia no fuso da conta zera o contador (repositório, relógio injetado)', async () => {
    const { opcoesDaRevisaoRepo } = await s.load('../../server/db/repositories/opcoesDaRevisao')
    const { OPCOES_DA_CONTA_PADRAO } = await s.load('../../src/core/learning/opcoesDaRevisao')
    const hoje = await opcoesDaRevisaoRepo.hoje('opcoes-ana', OPCOES_DA_CONTA_PADRAO, Date.now())
    expect(hoje.novas).toBe(3)
    const amanha = await opcoesDaRevisaoRepo.hoje('opcoes-ana', OPCOES_DA_CONTA_PADRAO, Date.now() + 36 * 3_600_000)
    expect(amanha).toEqual({ novas: 0, revisoes: 0, restamNovas: 20, restamRevisoes: 200 })
  })

  it('LGPD: a exportação traz as opções; a exclusão apaga só as da pessoa', async () => {
    await s.put('/api/vocab/opcoes-da-revisao', { novas: 7 }, bia)
    const exp = await (await s.get('/api/me/exportar', ana)).json()
    const linhas = exp.dados.opcoesDaRevisao as Array<{ userId?: string; user_id?: string }>
    expect(linhas).toHaveLength(1)
    expect((linhas[0].userId ?? linhas[0].user_id) === 'opcoes-ana').toBe(true)

    const apagar = await s.chamar('DELETE', '/api/me', { token: ana, body: { confirmar: true } })
    const relatorio = await apagar.json()
    expect(relatorio.linhasPorTabela.opcoesDaRevisao).toBe(1)
    const { clienteSql } = await s.load<typeof import('../harness/clienteSql')>('../harness/clienteSql')
    const c = clienteSql(await s.load('../../server/db/db'))
    const n = async (u: string) =>
      Number((await c.execute(`SELECT COUNT(*) AS n FROM opcoes_da_revisao WHERE user_id = '${u}'`)).rows[0].n)
    expect(await n('opcoes-ana')).toBe(0)
    expect(await n('opcoes-bia')).toBe(1)
  })
})
