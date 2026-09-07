/**
 * O RANKING GLOBAL PASSA A EXISTIR DE VERDADE (edição leve encerrada, 07/09).
 *
 * Ele era uma Pages Function do Cloudflare contra um banco D1 separado, e essa era a única
 * funcionalidade que dependia da versão hospedada no Pages — que nunca foi publicada: o workflow
 * de deploy nasceu desarmado, sem os dois secrets, e nunca foi disparado. Ou seja, a tela de
 * "Recordes e ranking" mostrava, desde sempre, "o ranking global vive na versão publicada".
 *
 * Encerrar a edição leve sem trazer o ranking transformaria aquela frase numa mentira — ela
 * apontaria para uma versão que nunca vai existir. Este arquivo é a prova de que ela deixou de
 * ser necessária: o placar responde, ordena, deduplica por apelido e recusa o implausível.
 *
 * O cliente NÃO mudou uma linha: `src/lib/ranking.ts` chama os mesmos `/api/rank/<jogo>` de antes.
 * Era o servidor do outro lado que não existia.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let rankRouter: any
let rankRepo: any
let TETO_DE_PONTOS: number

function handler(metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = rankRouter.stack.find((l: any) => l.route?.path === '/:jogo' && l.route?.methods?.[metodo])
  if (!camada) throw new Error(`rota ${metodo} /:jogo não existe`)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const pedido = (jogo: string, corpo?: unknown, ip = '198.51.100.7') =>
  ({ params: { jogo }, query: {}, body: corpo ?? {}, ip, path: `/${jogo}`, requestId: 'r-rank' })

async function enviar(jogo: string, corpo: unknown, ip?: string) {
  const res = mockRes()
  await handler('post')(pedido(jogo, corpo, ip), res)
  return res
}
async function ler(jogo: string, ip?: string) {
  const res = mockRes()
  await handler('get')(pedido(jogo, undefined, ip), res)
  return res
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ rankRouter } = (await h.load('../../server/routes/rank')) as any)
  ;({ rankRepo, TETO_DE_PONTOS } = (await h.load('../../server/db/repositories/rank')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('o placar responde', () => {
  it('um envio entra e volta na leitura', async () => {
    /* Cada envio vem de uma origem diferente porque a trava de flood é por origem, e ela é o
       assunto de outro teste. Aqui o assunto é o placar. */
    expect((await enviar('blitz', { apelido: 'Ana', pontos: 900, combo: 12 }, '203.0.113.1')).statusCode).toBe(200)
    const res = await ler('blitz')
    expect(res.statusCode).toBe(200)
    expect(res.body.linhas).toEqual([{ apelido: 'Ana', pontos: 900, combo: 12, quando: expect.any(Number) }])
  })

  it('ordena por pontos, e o empate decide pelo mais ANTIGO — quem chegou primeiro', async () => {
    /* PELO REPOSITÓRIO, com carimbos explícitos, e não pela rota: `Date.now()` tem resolução de
       milissegundo e três envios seguidos caem no MESMO instante — o desempate por tempo ficaria
       indefinido e o teste, intermitente. Um teste que às vezes passa não prova ordenação. */
    const base = 1_700_000_000_000
    await rankRepo.registrar({ jogo: 'memory', apelido: 'Primeiro', pontos: 500, combo: 3, ipHash: 'a', agora: base })
    await rankRepo.registrar({ jogo: 'memory', apelido: 'Segundo', pontos: 500, combo: 9, ipHash: 'b', agora: base + 1_000 })
    await rankRepo.registrar({ jogo: 'memory', apelido: 'Melhor', pontos: 700, combo: 4, ipHash: 'c', agora: base + 2_000 })
    const res = await ler('memory')
    expect(res.body.linhas.map((l: any) => l.apelido)).toEqual(['Melhor', 'Primeiro', 'Segundo'])
  })

  it('uma linha por apelido: o placar é de RECORDES, não de tentativas', async () => {
    await enviar('termo', { apelido: 'Bia', pontos: 300, combo: 2 }, '203.0.113.5')
    await enviar('termo', { apelido: 'Bia', pontos: 800, combo: 7 }, '203.0.113.6')
    const res = await ler('termo')
    expect(res.body.linhas).toHaveLength(1)
    expect(res.body.linhas[0]).toMatchObject({ apelido: 'Bia', pontos: 800, combo: 7 })
  })

  it('jogar pior não apaga o recorde — a resposta é `manteve`, e não um erro', async () => {
    await enviar('scramble', { apelido: 'Caio', pontos: 900, combo: 10 }, '203.0.113.7')
    const pior = await enviar('scramble', { apelido: 'Caio', pontos: 100, combo: 1 }, '203.0.113.8')
    expect(pior.statusCode).toBe(200)
    expect(pior.body).toMatchObject({ ok: true, manteve: true })
    expect((await ler('scramble')).body.linhas[0].pontos).toBe(900)
  })

  it('jogo que não existe é 404, e a lista de jogos vem do core', async () => {
    /* A versão Cloudflare tinha um `Set` com os nove nomes escrito à mão, que envelheceria em
       silêncio: um jogo novo levaria 404 sem ninguém entender por quê. */
    expect((await ler('jogo-inventado')).statusCode).toBe(404)
    expect((await enviar('jogo-inventado', { apelido: 'X', pontos: 1, combo: 0 })).statusCode).toBe(404)
  })
})

describe('as guardas de um placar público', () => {
  it('apelido curto demais é recusado', async () => {
    const res = await enviar('wordsearch', { apelido: 'ab', pontos: 100, combo: 1 }, '203.0.113.9')
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('apelido_invalido')
  })

  it('pontuação acima do teto não entra — o teto existe para a trapaça não quebrar a tabela', async () => {
    const res = await enviar('blitz', { apelido: 'Trapaceiro', pontos: 10_000_000, combo: 5 }, '203.0.113.10')
    expect(res.statusCode).toBe(400)
    expect(res.body.detalhes).toMatchObject({ teto: TETO_DE_PONTOS })
    /* E o placar continua legível: sem o teto, esta linha esconderia todas as outras para sempre. */
    expect((await ler('blitz')).body.linhas.every((l: any) => l.pontos <= TETO_DE_PONTOS)).toBe(true)
  })

  it('dois envios da mesma origem em menos de um minuto: o segundo é 429', async () => {
    const mesmoIp = '198.51.100.42'
    expect((await enviar('karaoke', { apelido: 'Duda', pontos: 200, combo: 1 }, mesmoIp)).statusCode).toBe(200)
    const segundo = await enviar('karaoke', { apelido: 'Duda2', pontos: 300, combo: 1 }, mesmoIp)
    expect(segundo.statusCode).toBe(429)
    expect(segundo.body.code).toBe('envio_muito_frequente')
  })

  it('o endereço NÃO é guardado — só um hash dele', async () => {
    /* A versão D1 gravava o IP em claro. Um identificador de rede, guardado sem prazo e sem
       caminho de exclusão, é dado pessoal dentro de uma tabela que se apresenta como anônima. */
    const { db } = (await h.load('../../server/db/db')) as any
    const schema = (await h.load('../../server/db/schema')) as any

    /* Primeiro a TABELA: não existe coluna para guardar endereço. É a garantia mais forte, porque
       não depende de nenhuma linha em particular. */
    expect(Object.keys(schema.rank)).not.toContain('ip')

    /* Depois uma linha escrita PELA ROTA (as deste arquivo que passam pelo repositório usam hash
       de fixture): o que ficou gravado é hexadecimal de 32 caracteres, não um endereço. */
    await enviar('conectores', { apelido: 'Enzo', pontos: 400, combo: 2 }, '198.51.100.99')
    const gravadas = await db.select().from(schema.rank)
    const daRota = gravadas.filter((l: any) => l.jogo === 'conectores')
    expect(daRota).toHaveLength(1)
    expect(String(daRota[0].ipHash)).toMatch(/^[0-9a-f]{32}$/)
    expect(String(daRota[0].ipHash)).not.toContain('198.51.100')
  })

  it('o hash é estável para a mesma origem e diferente para outra', async () => {
    const { hashDaOrigem } = (await h.load('../../server/db/repositories/rank')) as any
    expect(hashDaOrigem('203.0.113.1', 'k')).toBe(hashDaOrigem('203.0.113.1', 'k'))
    expect(hashDaOrigem('203.0.113.1', 'k')).not.toBe(hashDaOrigem('203.0.113.2', 'k'))
    /* Chaves diferentes dão hashes diferentes: dois servidores não compartilham a trava, o que é
       o certo — a janela é por instância, como era por Function. */
    expect(hashDaOrigem('203.0.113.1', 'k')).not.toBe(hashDaOrigem('203.0.113.1', 'outra'))
  })
})

describe('o repositório', () => {
  it('o topo respeita o limite pedido', async () => {
    for (let i = 0; i < 5; i++) {
      await rankRepo.registrar({ jogo: 'ditado', apelido: `Jogador${i}`, pontos: 100 + i, combo: 1, ipHash: `h${i}`, agora: Date.now() + i })
    }
    expect(await rankRepo.topo('ditado', 3)).toHaveLength(3)
    expect((await rankRepo.topo('ditado', 3))[0].apelido).toBe('Jogador4')
  })
})
