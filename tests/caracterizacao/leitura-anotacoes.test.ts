/**
 * CARACTERIZAÇÃO — as anotações do leitor (`/api/leitura`, L2 de Livros & Leitura), por HTTP, no modo
 * público, com a montagem de produção.
 *
 *   - sem token é 401 (a rota é privada);
 *   - gravar em lote, ler por livro e de forma incremental (`desde`), lápide no DELETE;
 *   - a última escrita vence (uma versão velha não sobrescreve a nova), decidido no banco;
 *   - o servidor recusa citação acima de 500 caracteres, CFI malformado e lote grande demais;
 *   - IDOR: outra pessoa não lê, não apaga e não sobrescreve — o mesmo id vira linha DELA;
 *   - a exportação da conta traz as anotações, e a exclusão da conta apaga todas (LGPD art. 18;
 *     critério 8 da spec: "apagar a conta apaga os grifos").
 *   - aparelho A grava, aparelho B (outra leitura com o mesmo token) recebe pela sincronização.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
let ana: string
let bia: string

beforeAll(async () => {
  s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
  ana = await s.token('leitura-ana')
  bia = await s.token('leitura-bia')
  await s.get('/api/me', ana)
  await s.get('/api/me', bia)
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

const LIVRO = 'arq:0123456789abcdef'
const anotacao = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  livroId: LIVRO,
  tipo: 'grifo',
  alvo: {
    cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:14)',
    citacao: { exact: 'O gato dormia.', prefix: 'Era uma vez. ', suffix: ' Um dia' },
    capitulo: 'Capítulo 1',
  },
  cor: 'amarelo',
  nota: '',
  criadoEm: 1_000,
  atualizadoEm: 1_000,
  apagadoEm: null,
  ...extra,
})

const lote = (lista: unknown[], token: string) => s.post('/api/leitura/anotacoes/lote', { anotacoes: lista }, token)

describe('autenticação', () => {
  it('sem token → 401 nas três rotas', async () => {
    expect((await s.get('/api/leitura/anotacoes')).status).toBe(401)
    expect((await s.post('/api/leitura/anotacoes/lote', { anotacoes: [anotacao('anot-sem-token')] })).status).toBe(401)
    expect((await s.del('/api/leitura/anotacoes/anot-sem-token')).status).toBe(401)
  })
})

describe('POST /api/leitura/anotacoes/lote e GET /api/leitura/anotacoes', () => {
  it('grava e lê (aparelho A grava, aparelho B recebe pela sincronização)', async () => {
    const r = await lote([anotacao('anot-ana-0001'), anotacao('anot-ana-0002', { tipo: 'nota', nota: 'oi' })], ana)
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.gravadas).toHaveLength(2)
    expect(corpo.recusadas).toEqual([])
    // "Aparelho B": uma leitura nova, só com o token.
    const lidas = await (await s.get(`/api/leitura/anotacoes?livroId=${encodeURIComponent(LIVRO)}`, ana)).json()
    expect(lidas.anotacoes.map((a: { id: string }) => a.id).sort()).toEqual(['anot-ana-0001', 'anot-ana-0002'])
    expect(lidas.anotacoes.find((a: { id: string }) => a.id === 'anot-ana-0002')).toMatchObject({
      tipo: 'nota',
      nota: 'oi',
      cor: 'amarelo',
      alvo: { citacao: { exact: 'O gato dormia.' }, capitulo: 'Capítulo 1' },
    })
    expect(typeof lidas.agora).toBe('number')
  })

  it('a última escrita vence: versão velha não sobrescreve a nova', async () => {
    await lote([anotacao('anot-ana-0003', { nota: 'nova', atualizadoEm: 5_000 })], ana)
    const velha = await (await lote([anotacao('anot-ana-0003', { nota: 'velha', atualizadoEm: 2_000 })], ana)).json()
    expect(velha.gravadas[0].nota).toBe('nova')
    const mais = await (await lote([anotacao('anot-ana-0003', { nota: 'mais nova', atualizadoEm: 9_000 })], ana)).json()
    expect(mais.gravadas[0].nota).toBe('mais nova')
  })

  it('incremental: `desde` traz só o que mudou depois', async () => {
    await lote([anotacao('anot-ana-0004', { atualizadoEm: 50_000, criadoEm: 50_000 })], ana)
    const lidas = await (await s.get('/api/leitura/anotacoes?desde=40000', ana)).json()
    expect(lidas.anotacoes.map((a: { id: string }) => a.id)).toEqual(['anot-ana-0004'])
  })

  it('recusa citação acima de 500, CFI malformado, lote vazio e lote grande', async () => {
    const longa = anotacao('anot-ana-0099', {
      alvo: { cfi: '', citacao: { exact: 'x'.repeat(501), prefix: '', suffix: '' } },
    })
    const r1 = await lote([longa], ana)
    expect(r1.status).toBe(400)
    expect((await r1.json()).code).toBe('citacao_longa')
    const r2 = await lote([anotacao('anot-ana-0098', { alvo: { cfi: '/6/4', citacao: { exact: 'a' } } })], ana)
    expect((await r2.json()).code).toBe('cfi_invalido')
    expect((await lote([], ana)).status).toBe(400)
    const grande = Array.from({ length: 201 }, (_, i) => anotacao(`anot-grande-${String(i).padStart(4, '0')}`))
    expect((await lote(grande, ana)).status).toBe(413)
    expect((await s.get('/api/leitura/anotacoes?livroId=a%20b', ana)).status).toBe(400)
  })
})

describe('IDOR', () => {
  it('outra pessoa não lê, não apaga e não sobrescreve; o mesmo id vira linha dela', async () => {
    const daBia = await (await s.get('/api/leitura/anotacoes', bia)).json()
    expect(daBia.anotacoes).toEqual([])
    expect((await s.del('/api/leitura/anotacoes/anot-ana-0001', bia)).status).toBe(404)
    // Bia manda uma versão "mais nova" do id da Ana: grava para ELA, a da Ana fica intacta.
    const r = await (await lote([anotacao('anot-ana-0001', { nota: 'da bia', atualizadoEm: 99_999 })], bia)).json()
    expect(r.gravadas[0].nota).toBe('da bia')
    const daAna = await (await s.get('/api/leitura/anotacoes', ana)).json()
    expect(daAna.anotacoes.find((a: { id: string }) => a.id === 'anot-ana-0001').nota).toBe('')
    const bia2 = await (await s.get('/api/leitura/anotacoes', bia)).json()
    expect(bia2.anotacoes).toHaveLength(1)
  })
})

describe('DELETE /api/leitura/anotacoes/:id', () => {
  it('a própria → 200 e vira lápide (a sincronização a recebe); de novo → 404; inventada → 404', async () => {
    expect((await s.del('/api/leitura/anotacoes/anot-ana-0002', ana)).status).toBe(200)
    expect((await s.del('/api/leitura/anotacoes/anot-ana-0002', ana)).status).toBe(404)
    expect((await s.del('/api/leitura/anotacoes/nao-existe-nunca', ana)).status).toBe(404)
    const lidas = await (await s.get('/api/leitura/anotacoes', ana)).json()
    expect(lidas.anotacoes.find((a: { id: string }) => a.id === 'anot-ana-0002').apagadoEm).toBeGreaterThan(0)
  })
})

describe('LGPD: exportação e exclusão da conta', () => {
  it('a exportação traz as anotações; a exclusão apaga todas, e só as da pessoa', async () => {
    const exp = await (await s.get('/api/me/exportar', ana)).json()
    expect(exp.dados.anotacoesDeLeitura.length).toBeGreaterThanOrEqual(4)
    expect(
      exp.dados.anotacoesDeLeitura.every(
        (l: { user_id?: string; userId?: string }) => (l.userId ?? l.user_id) === 'leitura-ana',
      ),
    ).toBe(true)
    const apagar = await s.chamar('DELETE', '/api/me', { token: ana, body: { confirmar: true } })
    /* Sem Supabase no harness o vínculo de login não é desfeito e a rota responde 500 com o relatório — mas as
       LINHAS saem sempre (é o que se confere aqui; o vínculo é assunto de `auth-e-conta`). */
    const relatorio = await apagar.json()
    expect(relatorio.linhasPorTabela.anotacoesDeLeitura).toBeGreaterThanOrEqual(4)
    const { clienteSql } = await s.load<typeof import('../harness/clienteSql')>('../harness/clienteSql')
    const c = clienteSql(await s.load('../../server/db/db'))
    const n = async (u: string) =>
      Number((await c.execute(`SELECT COUNT(*) AS n FROM anotacoes_de_leitura WHERE user_id = '${u}'`)).rows[0].n)
    expect(await n('leitura-ana')).toBe(0)
    expect(await n('leitura-bia')).toBe(1)
  })
})
