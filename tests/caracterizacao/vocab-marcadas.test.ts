/**
 * CARACTERIZAÇÃO — as palavras marcadas sem cartão ("Já sei" e "Ignorar"), por HTTP (openspec
 * `vocab-conhecidas-e-ignoradas`, tabela `palavras_marcadas`, migração PG 0027):
 *
 * 1. sem token, 401; entrada inválida (idioma, chave, estado, chave só de pontuação), 400;
 * 2. PUT é upsert: marcar de novo troca o estado, sem linha a mais; o servidor reduz idioma e chave;
 * 3. GET lista por idioma (ou todas); DELETE desmarca e é idempotente; `/marcadas` não cai em `/:id`;
 * 4. cada conta vê e desmarca só as dela;
 * 5. o teto por conta fecha marcação NOVA e deixa trocar a que existe;
 * 6. LGPD: a exportação traz as marcadas e a exclusão da conta as apaga (só as da pessoa).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

interface Marcada {
  lang: string
  chave: string
  estado: string
  atualizadoEm: number
}

describe('palavras marcadas (modo publico)', () => {
  let s: AppDeTeste
  let ana: string
  let bia: string

  const listar = async (token: string, lang?: string) => {
    const r = await s.get(`/api/vocab/marcadas${lang ? `?lang=${lang}` : ''}`, token)
    expect(r.status).toBe(200)
    return ((await r.json()) as { marcadas: Marcada[] }).marcadas
  }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('marcadas-ana')
    bia = await s.token('marcadas-bia')
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('sem token: 401 nas três rotas', async () => {
    expect((await s.get('/api/vocab/marcadas')).status).toBe(401)
    expect((await s.put('/api/vocab/marcadas', { lang: 'en', chave: 'hi', estado: 'conhecida' })).status).toBe(401)
    expect((await s.del('/api/vocab/marcadas?lang=en&chave=hi')).status).toBe(401)
  })

  it('validação: idioma, chave, estado e chave sem letras são 400', async () => {
    const put = (b: unknown) => s.put('/api/vocab/marcadas', b, ana)
    expect((await put({ lang: '1', chave: 'hi', estado: 'conhecida' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: '', estado: 'conhecida' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: 'x'.repeat(101), estado: 'conhecida' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: 'hi', estado: 'dominada' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: '!!!', estado: 'conhecida' })).status).toBe(400)
    expect((await s.get('/api/vocab/marcadas?lang=1', ana)).status).toBe(400)
    expect((await s.del('/api/vocab/marcadas?lang=en', ana)).status).toBe(400)
  })

  it('PUT é upsert e o servidor reduz idioma e chave', async () => {
    const r = await s.put('/api/vocab/marcadas', { lang: 'en-US', chave: 'Hello!', estado: 'conhecida' }, ana)
    expect(r.status).toBe(200)
    expect(((await r.json()) as { marcada: Marcada }).marcada).toMatchObject({
      lang: 'en',
      chave: 'hello',
      estado: 'conhecida',
    })
    await s.put('/api/vocab/marcadas', { lang: 'en', chave: 'hello', estado: 'ignorada' }, ana)
    await s.put('/api/vocab/marcadas', { lang: 'es', chave: 'Hola', estado: 'conhecida' }, ana)
    const en = await listar(ana, 'en')
    expect(en.map((m) => [m.chave, m.estado])).toEqual([['hello', 'ignorada']])
    expect((await listar(ana)).map((m) => `${m.lang}|${m.chave}`).sort()).toEqual(['en|hello', 'es|hola'])
  })

  it('cada conta vê e desmarca só as dela', async () => {
    expect(await listar(bia)).toEqual([])
    expect((await s.del('/api/vocab/marcadas?lang=en&chave=hello', bia)).status).toBe(204)
    expect((await listar(ana, 'en')).length).toBe(1)
  })

  it('DELETE desmarca, é idempotente e não cai na rota de apagar cartão', async () => {
    expect((await s.del('/api/vocab/marcadas?lang=en&chave=Hello', ana)).status).toBe(204)
    expect((await s.del('/api/vocab/marcadas?lang=en&chave=Hello', ana)).status).toBe(204)
    expect(await listar(ana, 'en')).toEqual([])
  })

  it('o teto fecha marcação nova e deixa trocar a que existe (repositório, teto pequeno)', async () => {
    const { palavrasMarcadasRepo } = await s.load('../../server/db/repositories/palavrasMarcadas')
    const u = 'marcadas-teto'
    expect((await palavrasMarcadasRepo.marcar(u, { lang: 'en', chave: 'um', estado: 'conhecida' }, 2)).ok).toBe(true)
    expect((await palavrasMarcadasRepo.marcar(u, { lang: 'en', chave: 'dois', estado: 'conhecida' }, 2)).ok).toBe(true)
    expect(await palavrasMarcadasRepo.marcar(u, { lang: 'en', chave: 'tres', estado: 'conhecida' }, 2)).toEqual({
      ok: false,
      motivo: 'cheio',
    })
    expect((await palavrasMarcadasRepo.marcar(u, { lang: 'en', chave: 'um', estado: 'ignorada' }, 2)).ok).toBe(true)
    expect((await palavrasMarcadasRepo.listar(u, 'en', 10)).length).toBe(2)
  })

  it('LGPD: a exportação traz as marcadas; a exclusão apaga só as da pessoa', async () => {
    await s.put('/api/vocab/marcadas', { lang: 'en', chave: 'world', estado: 'conhecida' }, ana)
    await s.put('/api/vocab/marcadas', { lang: 'en', chave: 'world', estado: 'conhecida' }, bia)
    const exp = await (await s.get('/api/me/exportar', ana)).json()
    const linhas = exp.dados.palavrasMarcadas as Array<{ userId?: string; user_id?: string; chave: string }>
    expect(linhas.map((l) => l.chave).sort()).toEqual(['hola', 'world'])
    expect(linhas.every((l) => (l.userId ?? l.user_id) === 'marcadas-ana')).toBe(true)

    const apagar = await s.chamar('DELETE', '/api/me', { token: ana, body: { confirmar: true } })
    /* Sem Supabase no harness o vínculo de login não é desfeito (500 com o relatório), mas as LINHAS saem sempre. */
    const relatorio = await apagar.json()
    expect(relatorio.linhasPorTabela.palavrasMarcadas).toBe(2)
    const { clienteSql } = await s.load<typeof import('../harness/clienteSql')>('../harness/clienteSql')
    const c = clienteSql(await s.load('../../server/db/db'))
    const n = async (u: string) =>
      Number((await c.execute(`SELECT COUNT(*) AS n FROM palavras_marcadas WHERE user_id = '${u}'`)).rows[0].n)
    expect(await n('marcadas-ana')).toBe(0)
    expect(await n('marcadas-bia')).toBe(1)
  })
})
