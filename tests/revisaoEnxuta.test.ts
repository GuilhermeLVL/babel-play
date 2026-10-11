// @vitest-environment jsdom
/**
 * A REVISÃO ENXUTA E AS PRÁTICAS — as contas portadas do protótipo `cartoes-enxuto-src`
 * (`src/lib/revisao/enxuta.ts`), o contrato de quem abre a folha das práticas (`pratica.ts`), a cena do
 * cartão (`cena.ts`) e as gravações guardadas no aparelho (`vozGuardada.ts`).
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  ocorrencias: [] as unknown[],
  falas: [] as unknown[],
  lerOcorrencias: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  lerSessao: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))
vi.mock('../src/data/api', () => {
  api.lerOcorrencias = vi.fn(async () => api.ocorrencias)
  api.lerSessao = vi.fn(async () => ({ session: { title: 'Reunião de produto' }, utterances: api.falas }))
  return { fetchOcorrencias: api.lerOcorrencias, fetchSessionTranscript: api.lerSessao }
})

import { acharFala, cenaJuntada, esquecerCenas, juntarCena, lerOrigemDoCartao } from '../src/lib/revisao/cena'
import {
  acharNaFrase,
  alvoNaFrase,
  barrasDaCena,
  conferirDitadoDaFrase,
  conferirLacuna,
  diferencaLetraALetra,
  duracaoDaOriginal,
  embaralharComSemente,
  ERROS_ATE_O_AVISO,
  hashDoTexto,
  itensDaPratica,
  palavraDificil,
  pedacosDaFrase,
  pedeDizer,
  perto,
  picosDaFrase,
  reamostrar,
  relogio,
  tempoDaFala,
} from '../src/lib/revisao/enxuta'
import { lerRecorteDaPratica, lerRecorteDoJogar, PRATICA_CONTA_COMO_REVISAO } from '../src/lib/revisao/pratica'
import { gravarVozNaRevisao, lerOpcoesDaRevisao, lerVozNaRevisao } from '../src/lib/revisao/preferencias'
import { criarVozesGuardadas, MAXIMO_POR_CARTAO, rotuloDaGravacao } from '../src/lib/revisao/vozGuardada'
import type { Recording, VocabCard } from '../src/types'

describe('a palavra dentro da frase (ctAchar, ctFrase)', () => {
  it('acha a palavra com flexão e a palavra composta', () => {
    const frase = "That's a big deal. Customers were complaining about it."
    expect(alvoNaFrase(frase, 'complain')).toBe('complaining')
    expect(alvoNaFrase('Can you walk me through the changes?', 'walk through')).toBe('walk me through')
    expect(acharNaFrase('Nothing here.', 'complain')).toEqual([])
    // não casa no meio de outra palavra
    expect(acharNaFrase('The warship left.', 'ship')).toEqual([])
  })

  it('marca a palavra ou abre a lacuna, sem perder o resto da frase', () => {
    const frase = 'We ship it today.'
    expect(pedacosDaFrase(frase, 'ship', 'marca')).toEqual([
      { texto: 'We ', tipo: 'texto' },
      { texto: 'ship', tipo: 'marca' },
      { texto: ' it today.', tipo: 'texto' },
    ])
    const vao = pedacosDaFrase(frase, 'ship', 'vao')
    expect(vao.map((p) => p.tipo)).toEqual(['texto', 'vao', 'texto'])
    expect(vao.map((p) => p.texto).join('')).toBe(frase)
    expect(pedacosDaFrase('Sem a palavra.', 'ship', 'vao')).toEqual([{ texto: 'Sem a palavra.', tipo: 'texto' }])
  })

  it('a diferença letra a letra aponta o que falta e o que sobra', () => {
    expect(diferencaLetraALetra('thorogh', 'thorough').some((l) => l.tipo === 'falta')).toBe(true)
    expect(diferencaLetraALetra('cats', 'cat').at(-1)).toEqual({ letra: 's', tipo: 'sobra' })
    expect(diferencaLetraALetra('Cat', 'cat').every((l) => l.tipo === 'igual')).toBe(true)
  })
})

describe('dizer antes de virar e palavra difícil', () => {
  it('o convite aparece em um de cada três cartões, pelo id (cxHash % 3)', () => {
    const e = { ligado: true, semDizerNestaRodada: false, formatoLembrar: true }
    const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`)
    const com = ids.filter((id) => pedeDizer(id, e))
    expect(com.length).toBeGreaterThan(70)
    expect(com.length).toBeLessThan(130)
    expect(com.every((id) => hashDoTexto(id) % 3 === 0)).toBe(true)
    // estável: o mesmo cartão convida sempre
    expect(pedeDizer(com[0], e)).toBe(true)
    expect(pedeDizer(com[0], { ...e, ligado: false })).toBe(false)
    expect(pedeDizer(com[0], { ...e, semDizerNestaRodada: true })).toBe(false)
    expect(pedeDizer(com[0], { ...e, formatoLembrar: false })).toBe(false)
  })

  it('a palavra é difícil a partir de 8 erros', () => {
    expect(ERROS_ATE_O_AVISO).toBe(8)
    expect(palavraDificil(7)).toBe(false)
    expect(palavraDificil(8)).toBe(true)
    expect(palavraDificil(undefined)).toBe(false)
  })

  it('as preferências da voz: dizer ligado e guardar DESLIGADO de fábrica', () => {
    localStorage.clear()
    expect(lerVozNaRevisao()).toEqual({ dizer: true, guardarVoz: false })
    gravarVozNaRevisao({ dizer: false, guardarVoz: true })
    expect(lerVozNaRevisao()).toEqual({ dizer: false, guardarVoz: true })
    expect(lerOpcoesDaRevisao().botoes).toBe(4)
    localStorage.setItem('revisao.botoesDeNota', '2')
    expect(lerOpcoesDaRevisao().botoes).toBe(2)
  })
})

describe('as ondas', () => {
  it('a onda desenhada de uma frase é estável e fica entre 0,08 e 1', () => {
    const a = picosDaFrase('Customers were complaining about it.')
    expect(a).toHaveLength(44)
    expect(a).toEqual(picosDaFrase('Customers were complaining about it.'))
    expect(a.every((p) => p >= 0.08 && p <= 1)).toBe(true)
    expect(picosDaFrase('Outra frase.')).not.toEqual(a)
  })

  it('reamostrar leva os picos do microfone a 44 barras, normalizadas pelo maior', () => {
    expect(reamostrar([])).toEqual(Array(44).fill(0.08))
    const r = reamostrar(Array.from({ length: 200 }, (_, i) => (i === 100 ? 0.9 : 0.1)))
    expect(r).toHaveLength(44)
    expect(Math.max(...r)).toBe(1)
    // silêncio não vira uma onda cheia: o piso do normalizador é 0,25
    expect(Math.max(...reamostrar([0.06, 0.06, 0.06]))).toBeCloseTo(0.24)
  })

  it('a varredura da original dura de 1,3 s a 3,6 s, e a cena tem 30 barras dentro do quadro', () => {
    expect(duracaoDaOriginal('Hi.')).toBe(1300)
    expect(duracaoDaOriginal('x'.repeat(40))).toBe(2480)
    expect(duracaoDaOriginal('x'.repeat(200))).toBe(3600)
    const barras = barrasDaCena('Customers were complaining about it.')
    expect(barras).toHaveLength(30)
    expect(barras.every(([x, y, h]) => x >= 24 && x <= 296 && y > 0 && y + h < 180)).toBe(true)
  })
})

describe('as práticas', () => {
  it('a digitação tolera um deslize, e dois em palavra longa', () => {
    expect(perto('ship', 'ship')).toBe(2)
    expect(perto('shio', 'ship')).toBe(1)
    expect(perto('cat', 'cot')).toBe(0)
    expect(perto('complainning', 'complaining')).toBe(1)
    expect(perto('walk', 'ship')).toBe(0)
  })

  it('o ditado: certo, quase (com a palavra do cartão) e errado', () => {
    const frase = 'A short nap can restore your attention.'
    const certo = conferirDitadoDaFrase('a short nap can restore your attention', frase, 'nap')
    expect(certo.veredito).toBe('certo')
    expect(certo.lembrou).toBe(true)
    expect(certo.marcas.every((m) => m === 'ok')).toBe(true)
    const deslize = conferirDitadoDaFrase('a short nap can restore your atention', frase, 'nap')
    expect(deslize.veredito).toBe('certo')
    expect(deslize.quase).toBe(true)
    const parcial = conferirDitadoDaFrase('a short nap can', frase, 'nap')
    expect(parcial.veredito).toBe('parcial')
    expect(parcial.pegouAPalavra).toBe(true)
    expect(parcial.lembrou).toBe(true)
    const semAPalavra = conferirDitadoDaFrase('a short can restore your', frase, 'nap')
    expect(semAPalavra.pegouAPalavra).toBe(false)
    expect(semAPalavra.lembrou).toBe(false)
    expect(conferirDitadoDaFrase('', frase, 'nap').veredito).toBe('errado')
    expect(certo.exibe).toHaveLength(certo.marcas.length)
  })

  it('completar aceita a palavra como está na frase ou como está no cartão', () => {
    const frase = 'Customers were complaining about it.'
    expect(conferirLacuna('complaining', frase, 'complain')).toBe(2)
    expect(conferirLacuna('complain', frase, 'complain')).toBe(2)
    expect(conferirLacuna('complainig', frase, 'complain')).toBe(1)
    expect(conferirLacuna('reclamar', frase, 'complain')).toBe(0)
    expect(conferirLacuna('', frase, 'complain')).toBe(0)
  })

  it('cada prática roda SÓ sobre o recorte recebido', () => {
    const recorte = [
      { id: 'a', palavra: 'complain', frase: "That's a big deal. Customers were complaining about it." },
      { id: 'b', palavra: 'nap', frase: 'A short nap can restore your attention for hours.' },
      { id: 'c', palavra: 'ship', frase: 'We ship it today.' },
      { id: 'd', palavra: 'today', frase: 'We ship it today.' },
      { id: 'e', palavra: 'towel', frase: '' },
    ]
    const falar = itensDaPratica('falar', recorte)
    // as mais curtas primeiro, a mesma fala uma vez só, e nada sem frase
    expect(falar.map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(itensDaPratica('ditado', recorte).map((c) => c.id)).toEqual(['c'])
    // Completar: só onde a lacuna não é o começo da frase
    expect(itensDaPratica('completar', recorte).map((c) => c.id)).toEqual(['a', 'b', 'd'])
    expect(itensDaPratica('jogo', recorte)).toHaveLength(4)
    expect(itensDaPratica('falar', [])).toEqual([])
    // nunca sai um cartão de fora do recorte
    const ids = new Set(recorte.map((c) => c.id))
    for (const tipo of ['falar', 'ditado', 'completar', 'jogo'] as const)
      expect(itensDaPratica(tipo, recorte).every((c) => ids.has(c.id))).toBe(true)
  })

  it('o embaralhamento com semente é estável', () => {
    const l = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(embaralharComSemente(l, 'x')).toEqual(embaralharComSemente(l, 'x'))
    expect(embaralharComSemente(l, 'x').slice().sort()).toEqual(l)
    expect(l).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('o selo diz a verdade: recordar conta como revisão, o jogo não mexe na agenda', () => {
    expect(PRATICA_CONTA_COMO_REVISAO).toEqual({ falar: true, ditado: true, completar: true, jogo: false })
  })

  it('o recorte que chega pela navegação só passa bem formado', () => {
    expect(lerRecorteDaPratica(undefined)).toBeUndefined()
    expect(lerRecorteDaPratica({ ids: ['a'] })).toBeUndefined()
    expect(lerRecorteDaPratica({ rotulo: 'As 2 que escaparam', origem: 'escaparam', ids: ['a', 3, ''] })).toEqual({
      origem: 'escaparam',
      rotulo: 'As 2 que escaparam',
      ids: ['a'],
      sessionId: undefined,
    })
    expect(lerRecorteDaPratica({ rotulo: 'Reunião', origem: 'x', sessionId: 's1' })).toMatchObject({
      origem: 'hoje',
      sessionId: 's1',
    })
    expect(lerRecorteDoJogar({ palavras: [] })).toBeNull()
    expect(lerRecorteDoJogar({ palavras: ['cat', 'dog'], semAgenda: true, rotulo: 'x' })).toEqual({
      palavras: ['cat', 'dog'],
      semAgenda: true,
      rotulo: 'x',
    })
    // sem a marca explícita, a rodada NÃO fica fora da agenda
    expect(lerRecorteDoJogar({ palavras: ['cat'] })?.semAgenda).toBe(false)
  })

  it('os relógios', () => {
    expect(relogio(0)).toBe('0:00')
    expect(relogio(348)).toBe('5:48')
    expect(tempoDaFala(38_000)).toBe('00:38')
    expect(tempoDaFala(3_725_000)).toBe('1:02:05')
    expect(tempoDaFala(null)).toBe('')
  })
})

describe('a cena do cartão', () => {
  const cartao = (extra: Partial<VocabCard> = {}) =>
    ({
      id: 'c1',
      word: 'complain',
      translation: 'reclamar',
      sentence: "That's a big deal. Customers were complaining about it.",
      ...extra,
    }) as VocabCard
  const sessao = (extra: Partial<Recording> = {}) =>
    ({ id: 's1', title: 'Reunião de produto', audioUrl: '/api/sessions/s1/audio', ...extra }) as Recording
  const fala = {
    id: 'u1',
    speakerName: 'Ana',
    sourceText: "That's a big deal. Customers were complaining about it.",
    translatedText: 'Isso é importante. Os clientes estavam reclamando disso.',
    tStartMs: 38_000,
    tEndMs: 42_000,
  }

  beforeEach(() => {
    esquecerCenas()
    localStorage.clear()
    api.lerOcorrencias.mockClear()
    api.lerSessao.mockClear()
    api.falas = [fala]
    api.ocorrencias = [
      { originKind: 'sessao', originRef: 's1', sentence: fala.sourceText, utteranceId: null, occurredAt: 1 },
    ]
  })

  it('acha a fala pelo texto (o servidor não guarda o id da fala), ignorando pontuação e caixa', () => {
    expect(acharFala([fala] as never, { utteranceId: null, sentence: "THAT'S a big deal, customers were complaining about it" })).toBe(fala)
    expect(acharFala([fala] as never, { utteranceId: 'u1', sentence: 'outra coisa' })).toBe(fala)
    expect(acharFala([fala] as never, { utteranceId: null, sentence: 'Customers were complaining about it.' })).toBe(fala)
    expect(acharFala([fala] as never, { utteranceId: null, sentence: 'Nothing like it.' })).toBeUndefined()
  })

  it('cartão de captura: a frase, quem falou, o tempo e a voz original', async () => {
    const o = await lerOrigemDoCartao(cartao({ sourceSessionId: 's1' }), [sessao()])
    expect(o.cena).toEqual({
      sessionId: 's1',
      titulo: 'Reunião de produto',
      quem: 'Ana',
      frase: fala.sourceText,
      traducao: fala.translatedText,
      inicioMs: 38_000,
      fimMs: 42_000,
      temAudio: true,
    })
    expect(o.achada).toBeNull()
  })

  it('sessão sem áudio: a cena existe, mas a voz é a do aparelho', async () => {
    const o = await lerOrigemDoCartao(cartao({ sourceSessionId: 's1' }), [sessao({ audioUrl: undefined })])
    expect(o.cena?.temAudio).toBe(false)
    expect(o.cena?.quem).toBe('Ana')
  })

  it('a leitura é guardada: vinte cartões da mesma sessão leem a transcrição uma vez', async () => {
    for (let i = 0; i < 20; i++) await lerOrigemDoCartao(cartao({ id: `c${i}`, sourceSessionId: 's1' }), [sessao()])
    expect(api.lerOcorrencias).toHaveBeenCalledTimes(20)
    expect(api.lerSessao).toHaveBeenCalledTimes(1)
    await lerOrigemDoCartao(cartao({ id: 'c0', sourceSessionId: 's1' }), [sessao()])
    expect(api.lerOcorrencias).toHaveBeenCalledTimes(20)
  })

  it('cartão trazido (Anki, colado) cuja palavra a pessoa capturou: nada de cena, só o convite', async () => {
    const o = await lerOrigemDoCartao(cartao({ sentence: 'Never complain about the weather.' }), [sessao()])
    expect(o.cena).toBeNull()
    expect(o.achada?.titulo).toBe('Reunião de produto')
    expect(o.outrasFrases).toEqual([{ frase: fala.sourceText, titulo: 'Reunião de produto' }])
  })

  it('cartão trazido sem captura nenhuma: verso simples, sem convite', async () => {
    api.ocorrencias = [{ originKind: 'anki', originRef: 'd1', sentence: 'x', utteranceId: null, occurredAt: 1 }]
    const o = await lerOrigemDoCartao(cartao({ sentence: 'x' }), [sessao()])
    expect(o).toEqual({ cena: null, achada: null, outrasFrases: [] })
    expect(api.lerSessao).not.toHaveBeenCalled()
  })

  it('sem rede, o cartão fica com o verso simples', async () => {
    api.lerOcorrencias.mockRejectedValueOnce(new Error('sem rede'))
    expect(await lerOrigemDoCartao(cartao(), [])).toEqual({ cena: null, achada: null, outrasFrases: [] })
  })

  it('"Juntar a cena" fica guardado neste aparelho', () => {
    expect(cenaJuntada('c1')).toBe(false)
    juntarCena('c1')
    juntarCena('c1')
    expect(cenaJuntada('c1')).toBe(true)
    expect(JSON.parse(localStorage.getItem('revisao.cenasJuntadas') as string)).toEqual(['c1'])
  })
})

describe('minha voz guardada no aparelho', () => {
  const som = (bytes = 64, marca = 1) => new Blob([new Uint8Array(bytes).fill(marca)], { type: 'audio/webm' })
  const DIA = 86_400_000
  let agora = new Date(2026, 9, 10, 12).getTime()
  const novas = () => criarVozesGuardadas({ fabrica: new IDBFactory(), agora: () => agora })

  beforeEach(() => {
    agora = new Date(2026, 9, 10, 12).getTime()
  })

  it('guarda por cartão, com a onda, a duração e o áudio; lista da mais antiga à mais nova', async () => {
    const v = novas()
    expect(await v.listar('c1')).toEqual([])
    expect(await v.guardar('c1', { picos: [0.1, 0.9], dur: 2600, audio: som(64, 7) })).toBe(true)
    agora += DIA
    await v.guardar('c1', { picos: [0.5], dur: 1900, audio: som() })
    await v.guardar('c2', { picos: [0.3], dur: 1000, audio: som() })
    const l = await v.listar('c1')
    expect(l.map((g) => g.dur)).toEqual([2600, 1900])
    expect(l[0].picos).toEqual([0.1, 0.9])
    expect(l[0].audio.type).toBe('audio/webm')
    expect(new Uint8Array(await l[0].audio.arrayBuffer())[0]).toBe(7)
    expect(await v.listar('c2')).toHaveLength(1)
  })

  it('gravar de novo no mesmo dia troca a de hoje', async () => {
    const v = novas()
    await v.guardar('c1', { picos: [0.1], dur: 1000, audio: som() })
    agora += 3_600_000
    await v.guardar('c1', { picos: [0.2], dur: 2000, audio: som() })
    expect((await v.listar('c1')).map((g) => g.dur)).toEqual([2000])
  })

  it('apagar tira todas as do cartão e só as dele', async () => {
    const v = novas()
    await v.guardar('c1', { picos: [0.1], dur: 1000, audio: som() })
    await v.guardar('c2', { picos: [0.1], dur: 1000, audio: som() })
    await v.apagar('c1')
    expect(await v.listar('c1')).toEqual([])
    expect(await v.listar('c2')).toHaveLength(1)
    await v.limpar()
    expect(await v.listar('c2')).toEqual([])
  })

  it('no máximo doze por cartão: a mais antiga sai', async () => {
    const v = novas()
    for (let i = 0; i < MAXIMO_POR_CARTAO + 3; i++) {
      await v.guardar('c1', { picos: [0.1], dur: 1000 + i, audio: som() })
      agora += DIA
    }
    const l = await v.listar('c1')
    expect(l).toHaveLength(MAXIMO_POR_CARTAO)
    expect(l[0].dur).toBe(1003)
  })

  it('não guarda gravação vazia nem grande demais, e sem IndexedDB diz que não guardou', async () => {
    const v = novas()
    expect(await v.guardar('c1', { picos: [], dur: 0, audio: new Blob([]) })).toBe(false)
    expect(await v.guardar('c1', { picos: [], dur: 0, audio: som(3 * 1024 * 1024) })).toBe(false)
    const sem = criarVozesGuardadas({ fabrica: null })
    expect(await sem.guardar('c1', { picos: [0.1], dur: 1000, audio: som() })).toBe(false)
    expect(await sem.listar('c1')).toEqual([])
  })

  it('o rótulo da linha do tempo vem da data de verdade', () => {
    const hoje = new Date(2026, 9, 10, 12).getTime()
    const marco = new Date(2026, 2, 5).getTime()
    const marco2 = new Date(2026, 2, 20).getTime()
    expect(rotuloDaGravacao(hoje, [hoje], hoje)).toBe('hoje')
    expect(rotuloDaGravacao(marco, [marco, hoje], hoje, 'pt-BR')).toBe('março')
    expect(rotuloDaGravacao(marco, [marco, marco2, hoje], hoje, 'pt-BR')).toBe('5 de março')
    expect(rotuloDaGravacao(new Date(2025, 2, 5).getTime(), [hoje], hoje, 'pt-BR')).toBe('março de 2025')
  })
})
