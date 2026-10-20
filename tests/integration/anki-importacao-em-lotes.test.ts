/**
 * IMPORTAÇÃO DO ANKI EM LOTES (Fase 3 da migração, Task 3) — `POST /api/anki/imports` (abrir),
 * `POST /api/anki/imports/:id/notas` (um lote de até 500 notas) e `POST /api/anki/imports/:id/fechar`.
 *
 * O navegador lê o `.apkg` e manda as notas em lotes; o servidor reaplica a limpeza, a identidade e a
 * régua de qualidade em cada nota (nunca confia no cliente) e grava o acervo. O envelope do `fechar` é
 * o MESMO da rota binária antiga (`POST /api/import/anki`, removida), para a tela não mudar de contrato.
 *
 * Por HTTP, no modo self-host (toda requisição é o dono local): o "outro usuário" do caso de 404 é
 * semeado direto pelo repositório.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let ankiRepo: any
let db: any
let sql: any
let limparBanco: any
let asUserId: (id: string) => any

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
  ;({ ankiRepo } = await s.load('../../server/db/repositories/anki'))
  ;({ db } = await s.load('../../server/db/db'))
  ;({ sql } = await s.load('drizzle-orm'))
  ;({ limparBanco } = await s.load('../../server/lib/limpezaDiaria'))
  ;({ asUserId } = await s.load('../../server/lib/authContext'))
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

const DONO = () => asUserId(process.env.LOCAL_OWNER_ID || 'local-owner')

type Nota = {
  guid?: string
  notetype?: string | null
  campos: string[]
  camposBrutos: Record<string, string>
  frente: string
  verso: string
  exemplo?: string
  tags: string[]
  midia?: { sons: string[]; imagens: string[] }
  lacunas?: Array<{ ordinal: number; resposta: string; dica?: string }>
}

function nota(frente: string, verso: string, extra: Partial<Nota> = {}): Nota {
  return {
    notetype: 'Basic',
    campos: ['Front', 'Back'],
    camposBrutos: { Front: frente, Back: verso },
    frente,
    verso,
    tags: [],
    ...extra,
  }
}

function abrir(
  arquivo: string,
  amostra: Array<{ frente: string; verso: string }>,
  extra: Record<string, unknown> = {},
) {
  return s.post('/api/anki/imports', {
    arquivo,
    bytes: 1234,
    formato: 'collection.anki21b',
    nomeNoArquivo: null,
    campos: ['Front', 'Back'],
    totalNoArquivo: amostra.length,
    truncado: false,
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
    amostra,
    ...extra,
  })
}

async function abrirOk(arquivo: string, notas: Nota[], extra: Record<string, unknown> = {}) {
  const r = await abrir(
    arquivo,
    notas.map((n) => ({ frente: n.frente, verso: n.verso })),
    extra,
  )
  expect(r.status).toBe(200)
  return (await r.json()) as { importId: string; deckId: string; idiomaOrigem: string | null; avisoIdioma?: string }
}

const enviar = (importId: string, notas: Nota[]) => s.post(`/api/anki/imports/${importId}/notas`, { notas })
const fechar = (importId: string) => s.post(`/api/anki/imports/${importId}/fechar`, {})

/** abrir → um lote por item de `lotes` → fechar; devolve o corpo do fechar. */
async function importar(arquivo: string, lotes: Nota[][]) {
  const { importId, deckId } = await abrirOk(arquivo, lotes.flat())
  for (const lote of lotes) expect((await enviar(importId, lote)).status).toBe(200)
  const r = await fechar(importId)
  expect(r.status).toBe(200)
  return { importId, deckId, corpo: await r.json() }
}

async function notasDoDeck(deckId: string) {
  return (await ankiRepo.listarNotas(DONO(), deckId, { limite: 500 })).itens as Array<{
    guid: string
    frente: string
    verso: string
    estado: string
    camposBrutos: string
    importId: string | null
  }>
}

describe('protocolo em lotes', () => {
  it('abrir → 2 lotes → fechar grava o acervo e devolve o resumo no envelope antigo (notas, novas, iguais, ativadas)', async () => {
    const lote1 = [nota('ledger', 'livro-razão', { guid: 'g-ledger' }), nota('churn', 'evasão', { guid: 'g-churn' })]
    const lote2 = [nota('orbit', 'órbita', { guid: 'g-orbit' })]
    const { importId, deckId } = await abrirOk('acervo.apkg', [...lote1, ...lote2])

    const r1 = await enviar(importId, lote1)
    expect(r1.status).toBe(200)
    expect(await r1.json()).toEqual({ novas: 2, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} })
    expect((await enviar(importId, lote2)).status).toBe(200)

    const f = await fechar(importId)
    expect(f.status).toBe(200)
    const corpo = await f.json()
    expect(corpo.importId).toBe(importId)
    expect(corpo.deckId).toBe(deckId)
    expect(corpo.resumo).toMatchObject({ notas: 3, novas: 3, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} })
    expect(corpo.resumo.ativadas).toBeGreaterThan(0)
    expect(corpo.erroDeAtivacao).toBeUndefined()

    const imp = await ankiRepo.lerImport(DONO(), importId)
    expect(imp.estado).toBe('concluido')
    expect(imp.notasLidas).toBe(3)
    expect(imp.notasNovas).toBe(3)
    expect((await notasDoDeck(deckId)).map((n) => n.frente).sort()).toEqual(['churn', 'ledger', 'orbit'])

    // O deck leva o nome do arquivo sem extensão quando não há baralho declarado.
    const deck = (await ankiRepo.listarBaralhos(DONO())).find((d: any) => d.id === deckId)
    expect(deck.nome).toBe('acervo')
    expect(deck.idiomaOrigem).toBe('en')
    expect(deck.idiomaAlvo).toBe('pt')
  })

  it('reenviar o mesmo arquivo: segundo import reporta "iguais" e não duplica (dedupe por guid)', async () => {
    const notas = [nota('house', 'casa', { guid: 'g-house' }), nota('water', 'água', { guid: 'g-water' })]
    const primeiro = await importar('reenvio.apkg', [notas])
    const segundo = await importar('reenvio.apkg', [notas])
    expect(segundo.deckId).toBe(primeiro.deckId)
    expect(segundo.importId).not.toBe(primeiro.importId)
    expect(segundo.corpo.resumo).toMatchObject({ notas: 2, novas: 0, atualizadas: 0, iguais: 2 })
    const gravadas = await notasDoDeck(primeiro.deckId)
    expect(gravadas).toHaveLength(2)
    // As iguais também são carimbadas com o import novo (é o que o `fechar` usa para achar as ausentes).
    expect(gravadas.every((n) => n.importId === segundo.importId)).toBe(true)
    expect(gravadas.every((n) => n.estado !== 'ausente_no_arquivo')).toBe(true)
  })

  it('fechar marca ausente_no_arquivo as notas que não vieram neste import', async () => {
    const a = nota('apple', 'maçã', { guid: 'g-apple' })
    const b = nota('bread', 'pão', { guid: 'g-bread' })
    const c = nota('cheese', 'queijo', { guid: 'g-cheese' })
    const { deckId } = await importar('ausentes.apkg', [[a, b, c]])
    // Segundo import sem `bread`, em dois lotes: a nota do lote 1 não pode ser marcada ausente.
    await importar('ausentes.apkg', [[a], [c]])
    const porFrente = Object.fromEntries((await notasDoDeck(deckId)).map((n) => [n.frente, n.estado]))
    expect(porFrente.bread).toBe('ausente_no_arquivo')
    expect(porFrente.apple).not.toBe('ausente_no_arquivo')
    expect(porFrente.cheese).not.toBe('ausente_no_arquivo')
  })

  it('nota sem guid recebe guid derivado do conteúdo, estável entre dois imports', async () => {
    const semGuid = [nota('river', 'rio')]
    const primeiro = await importar('sem-guid.txt', [semGuid])
    const [n1] = await notasDoDeck(primeiro.deckId)
    expect(n1.guid).toMatch(/^[0-9a-f]{32}$/)
    const segundo = await importar('sem-guid.txt', [semGuid])
    expect(segundo.corpo.resumo).toMatchObject({ novas: 0, iguais: 1 })
    const notas = await notasDoDeck(primeiro.deckId)
    expect(notas).toHaveLength(1)
    expect(notas[0].guid).toBe(n1.guid)
  })

  it('frente com <script> chega limpa ao banco e camposBrutos preserva o HTML (servidor reaplica limparCampo)', async () => {
    const bruta = nota('<script>alert(1)</script><b>ponte</b>', '<i>bridge</i> [sound:x.mp3]', {
      guid: 'g-hostil',
      camposBrutos: { Front: '<script>alert(1)</script><b>ponte</b>', Back: '<i>bridge</i> [sound:x.mp3]' },
      midia: { sons: ['x.mp3'], imagens: [] },
      tags: ['vocab', 'nivel1'],
    })
    const { deckId } = await importar('hostil.apkg', [[bruta]])
    const [n] = await notasDoDeck(deckId)
    expect(n.frente).toBe('alert(1)ponte')
    expect(n.verso).toBe('bridge')
    const brutos = JSON.parse(n.camposBrutos)
    expect(brutos.campos.Front).toBe('<script>alert(1)</script><b>ponte</b>')
    expect(brutos.midia).toEqual({ sons: ['x.mp3'], imagens: [] })
    const linha = (await ankiRepo.listarNotas(DONO(), deckId, {})).itens[0]
    expect(linha.tags).toBe('vocab nivel1')
    expect(linha.estruturaHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('frente que fica vazia depois de limpar → 400 nota_invalida com indice', async () => {
    const { importId } = await abrirOk('vazia.apkg', [nota('ok', 'certo')])
    const r = await enviar(importId, [
      nota('ok', 'certo', { guid: 'g-ok' }),
      nota('<img src=x>', 'imagem', { guid: 'g-img' }),
    ])
    expect(r.status).toBe(400)
    const corpo = await r.json()
    expect(corpo.code).toBe('nota_invalida')
    expect(corpo.detalhes).toEqual({ indice: 1 })
    // O lote inteiro é recusado: nada dele foi gravado.
    const imp = await ankiRepo.lerImport(DONO(), importId)
    expect(imp.notasLidas).toBe(0)
  })

  it('lote 101 que passaria de 50.000 notas → 400 teto_de_notas', async () => {
    const { importId } = await abrirOk('teto.apkg', [nota('um', 'one')])
    // 100 lotes de 500 já entraram (contadores do ledger, sem gravar 50 mil notas no teste).
    await ankiRepo.atualizarImport(importId, { notasLidas: 49_999 })
    expect((await enviar(importId, [nota('um', 'one', { guid: 'g-teto-1' })])).status).toBe(200)
    const r = await enviar(importId, [nota('dois', 'two', { guid: 'g-teto-2' })])
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe('teto_de_notas')
  })

  it('lote depois de fechar → 409 import_fechado', async () => {
    const { importId } = await importar('fechado.apkg', [[nota('sun', 'sol', { guid: 'g-sun' })]])
    const r = await enviar(importId, [nota('moon', 'lua', { guid: 'g-moon' })])
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('import_fechado')
    const f = await fechar(importId)
    expect(f.status).toBe(409)
    expect((await f.json()).code).toBe('import_fechado')
  })

  it('import de outro usuário → 404 em notas e fechar', async () => {
    const OUTRO = asUserId('anki-lotes-outro')
    const deck = await ankiRepo.criarOuAcharDeck(OUTRO, { nome: 'alheio', arquivoOrigem: 'alheio.apkg' })
    const imp = await ankiRepo.criarImport(OUTRO, { deckId: deck.id, arquivo: 'alheio.apkg', bytes: 1 })
    await ankiRepo.atualizarImport(imp.id, { estado: 'gravando' })
    expect((await enviar(imp.id, [nota('x', 'y', { guid: 'g-x' })])).status).toBe(404)
    expect((await fechar(imp.id)).status).toBe(404)
    expect((await enviar('00000000-0000-0000-0000-000000000000', [nota('x', 'y')])).status).toBe(404)
    // E nada mudou no import alheio.
    expect((await ankiRepo.lerImport(OUTRO, imp.id)).estado).toBe('gravando')
  })

  it('campos excedentes (campo7) no camposBrutos são aceitos', async () => {
    const camposBrutos: Record<string, string> = {}
    for (let i = 1; i <= 7; i++) camposBrutos[`campo${i}`] = `valor ${i}`
    const n = nota('kite', 'pipa', { guid: 'g-kite', campos: Object.keys(camposBrutos), camposBrutos })
    const { deckId } = await importar('excedentes.apkg', [[n]])
    const [gravada] = await notasDoDeck(deckId)
    expect(JSON.parse(gravada.camposBrutos).campos.campo7).toBe('valor 7')
  })

  it('import abandonado há 25 h vira falhou na limpeza diária; o mesmo arquivo reimporta depois', async () => {
    const notas = [nota('tree', 'árvore', { guid: 'g-tree' })]
    const velho = await abrirOk('abandonado.apkg', notas)
    expect((await enviar(velho.importId, notas)).status).toBe(200)
    const recente = await abrirOk('recente.apkg', notas)
    const h25 = Date.now() - 25 * 3_600_000
    await db.execute(sql`UPDATE anki_imports SET created_at = ${h25} WHERE id = ${velho.importId}`)

    const relatorio = await limparBanco()
    expect(relatorio.importsAbandonados).toBeGreaterThanOrEqual(1)
    const imp = await ankiRepo.lerImport(DONO(), velho.importId)
    expect(imp.estado).toBe('falhou')
    expect(imp.erro).toBe('abandonado: o navegador não concluiu o envio')
    // O de 1 minuto atrás continua aberto.
    expect((await ankiRepo.lerImport(DONO(), recente.importId)).estado).toBe('gravando')
    // E o lote atrasado do abandonado é recusado.
    expect((await enviar(velho.importId, notas)).status).toBe(409)

    const outra = await importar('abandonado.apkg', [notas])
    expect(outra.deckId).toBe(velho.deckId)
    expect(outra.corpo.resumo).toMatchObject({ notas: 1, iguais: 1, novas: 0 })
  })

  it('teto atômico: 3 lotes de 500 em paralelo contra 49.000 lidas → exatamente 2 aceitos e 1 teto_de_notas', async () => {
    const { importId, deckId } = await abrirOk('teto-paralelo.apkg', [nota('a', 'b')])
    await ankiRepo.atualizarImport(importId, { notasLidas: 49_000 })
    const lote = (k: number) =>
      Array.from({ length: 500 }, (_, i) => nota(`palavra${k}x${i}`, `tradução${k}x${i}`, { guid: `g-par-${k}-${i}` }))
    const respostas = await Promise.all([0, 1, 2].map((k) => enviar(importId, lote(k))))
    const status = respostas.map((r) => r.status).sort()
    expect(status).toEqual([200, 200, 400])
    const recusado = respostas.find((r) => r.status === 400)!
    expect((await recusado.json()).code).toBe('teto_de_notas')

    // Os dois contadores no banco: o reservado (notas_lidas) e o gravado (notas_novas e o acervo).
    const imp = await ankiRepo.lerImport(DONO(), importId)
    expect(imp.notasLidas).toBe(50_000)
    expect(imp.notasNovas).toBe(1_000)
    expect((await ankiRepo.listarNotas(DONO(), deckId, { limite: 1 })).total).toBe(1_000)
  })

  it('abrir um import novo no mesmo baralho fecha o anterior: lote no antigo → 409; o novo fecha normalmente', async () => {
    const notas = [nota('cloud', 'nuvem', { guid: 'g-cloud' })]
    const a = await abrirOk('substituido.apkg', notas)
    const b = await abrirOk('substituido.apkg', notas)
    expect(b.deckId).toBe(a.deckId)
    const tarde = await enviar(a.importId, notas)
    expect(tarde.status).toBe(409)
    expect((await tarde.json()).code).toBe('import_fechado')
    const antigo = await ankiRepo.lerImport(DONO(), a.importId)
    expect(antigo.estado).toBe('falhou')
    expect(antigo.erro).toBe('substituído por um import mais novo')
    expect((await fechar(a.importId)).status).toBe(409)

    expect((await enviar(b.importId, notas)).status).toBe(200)
    const f = await fechar(b.importId)
    expect(f.status).toBe(200)
    expect((await f.json()).resumo).toMatchObject({ notas: 1, novas: 1 })
  })

  it('fechar sem nenhum lote → 400 import_vazio e nada vira ausente', async () => {
    const notas = [nota('stone', 'pedra', { guid: 'g-stone' })]
    const { deckId } = await importar('vazio-no-fechar.apkg', [notas])
    const { importId } = await abrirOk('vazio-no-fechar.apkg', notas)
    const r = await fechar(importId)
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe('import_vazio')
    expect((await notasDoDeck(deckId)).map((n) => n.estado)).not.toContain('ausente_no_arquivo')
    expect((await ankiRepo.lerImport(DONO(), importId)).estado).toBe('gravando')
  })
})

/** Porte dos 5 casos S11 de `tests/integration/anki-rotas.test.ts` para o `abrir`. */
describe('S11: idioma de origem conferido contra a escrita da amostra', () => {
  async function idiomaDoDeck(deckId: string) {
    return (await ankiRepo.listarBaralhos(DONO())).find((d: any) => d.id === deckId)?.idiomaOrigem
  }
  const amostra = (frentes: string[]) => frentes.map((frente) => ({ frente, verso: 'tradução' }))

  it('S11: amostra CJK pura com idiomaOrigem "en" → idiomaOrigem null + avisoIdioma; com kana → "ja"', async () => {
    const cjk = await abrir('cjk.apkg', amostra(['猫', '犬', '水']))
    expect(cjk.status).toBe(200)
    const c = await cjk.json()
    expect(c.idiomaOrigem).toBeNull()
    expect(String(c.avisoIdioma)).toMatch(/en/)
    expect(await idiomaDoDeck(c.deckId)).toBeNull()

    const kana = await (await abrir('japones.apkg', amostra(['こんにちは', 'ありがとう', '猫']))).json()
    expect(kana.idiomaOrigem).toBe('ja')
    expect(kana.avisoIdioma).toBeTruthy()
    expect(await idiomaDoDeck(kana.deckId)).toBe('ja')
  })

  it('japonês típico (kanji dominante, kana minoritário) → "ja"', async () => {
    const r = await (await abrir('core-tipico.apkg', amostra(['食料品', '勉強会', '図書館', '食べる']))).json()
    expect(r.avisoIdioma).toContain('japonês')
    expect(await idiomaDoDeck(r.deckId)).toBe('ja')
  })

  it('latino com "en" → carimba normal, sem aviso', async () => {
    const r = await (await abrir('ingles.apkg', amostra(['ledger', 'churn']))).json()
    expect(r.idiomaOrigem).toBe('en')
    expect(r.avisoIdioma).toBeUndefined()
    expect(await idiomaDoDeck(r.deckId)).toBe('en')
  })

  it('hangul com "en" → corrige para "ko" e avisa', async () => {
    const r = await (await abrir('coreano.apkg', amostra(['안녕하세요', '감사합니다']))).json()
    expect(r.avisoIdioma).toBeTruthy()
    expect(await idiomaDoDeck(r.deckId)).toBe('ko')
  })

  it('verso que repete a frente (dicionário monolíngue) → idiomaAlvo = idiomaOrigem', async () => {
    const defs = ['apple', 'house', 'water', 'river', 'bread'].map((frente) => ({
      frente,
      verso: `${frente}: a common English word`,
    }))
    const r = await (await abrir('monolingue.apkg', defs)).json()
    const deck = (await ankiRepo.listarBaralhos(DONO())).find((d: any) => d.id === r.deckId)
    expect(deck.idiomaAlvo).toBe('en')
  })
})
