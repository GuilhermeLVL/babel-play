/**
 * O MAPEADOR (openspec `motor-anki-mapeador`, versão enxuta): confiança do palpite, priors em JSON, hash da estrutura no
 * cliente igual ao do servidor, e a leitura do `.apkg` com mapeamento escolhido pela pessoa.
 */
import { createRequire } from 'node:module'

import { zipSync } from 'fflate'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashDaEstrutura as hashDoServidor } from '../server/import/identidadeDaNota'
import {
  hashDaEstrutura,
  inferirMapeamento,
  mapeamentoServe,
  montarNota,
  type PapelNaImportacao,
  preverNotas,
  trocarPapel,
} from '../src/core/anki'
import { lerApkg } from '../src/lib/anki/lerApkg'
import {
  CHAVE_DOS_PERFIS,
  esquecerPerfil,
  lerPerfis,
  MAXIMO_DE_PERFIS,
  salvarPerfil,
} from '../src/lib/anki/perfisDeMapeamento'

const SEP = '\x1f'
const require = createRequire(import.meta.url)
let sqlite: Promise<SqlJsStatic> | undefined
const abrirSqlite = () => (sqlite ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }))

async function colecao(campos: string[], notas: string[][]): Promise<Blob> {
  const SQL = await abrirSqlite()
  const db = new SQL.Database()
  try {
    db.run(`
      CREATE TABLE notetypes (id integer primary key, name text not null);
      CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null);
      CREATE TABLE decks (id integer primary key, name text not null);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, flds text not null, tags text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null);
    `)
    db.run('INSERT INTO notetypes VALUES (?,?)', [1, 'Tipo'])
    for (const [ord, nome] of campos.entries()) db.run('INSERT INTO fields VALUES (?,?,?)', [1, ord, nome])
    db.run('INSERT INTO decks VALUES (?,?)', [1, 'Baralho'])
    for (const [i, n] of notas.entries()) {
      db.run('INSERT INTO notes VALUES (?,?,?,?,?)', [i + 1, `g-${i}`, 1, n.join(SEP), ''])
      db.run('INSERT INTO cards VALUES (?,?,?,0)', [i + 1, i + 1, 1])
    }
    return new Blob([zipSync({ 'collection.anki21': db.export() })])
  } finally {
    db.close()
  }
}

describe('hash da estrutura no cliente', () => {
  const listas: string[][] = [
    [],
    ['Front', 'Back'],
    ['Back', 'Front'],
    ['Word Audio', 'Word'],
    ['Word_Audio', 'Word'],
    ['WordAudio', 'Word'],
    ['Word-Audio', 'Word'],
    ['Palavra', 'Tradução', 'Pronúncia'],
    ['palavra', 'traducao', 'pronuncia'],
    ['№', 'IMG', 'Word', 'Meaning'],
    ['日本語', '意味'],
    ['Vocabulary-Kanji', 'Sentence-Kanji', 'Audio', 'Image'],
    ['a'],
    ['  Spaced   Out  ', 'x'],
    ['Z'.repeat(80), 'Y'.repeat(130)],
    ['😀 emoji', 'ñandú'],
    ['Expression', 'Meaning', 'Audio', 'Snapshot', 'Sequence Marker'],
    ['Front', 'Back', 'Extra', 'Source', 'Tags', 'Notes', 'More'],
    ['Campo 1', 'Campo 2'],
    ['A|B', 'C'],
  ]
  it('dá o MESMO resultado que o servidor em 20 listas (acento, separador, ordem, unicode)', () => {
    expect(listas).toHaveLength(20)
    for (const l of listas) expect(hashDaEstrutura(l), JSON.stringify(l)).toBe(hashDoServidor(l))
  })
  it('separadores diferentes dão o mesmo hash; ordem diferente não', () => {
    expect(hashDaEstrutura(['Word Audio'])).toBe(hashDaEstrutura(['Word_Audio']))
    expect(hashDaEstrutura(['Word Audio'])).toBe(hashDaEstrutura(['word-audio']))
    expect(hashDaEstrutura(['Front', 'Back'])).not.toBe(hashDaEstrutura(['Back', 'Front']))
  })
})

describe('confiança do palpite', () => {
  it('Word/Meaning por igualdade: alta, sem conferência', () => {
    const m = inferirMapeamento(['Word', 'Meaning', 'Audio', 'Example'])
    expect(m.palpites.palavra).toMatchObject({ indice: 0, confianca: 'alta', origem: 'nome' })
    expect(m.palpites.significado).toMatchObject({ indice: 1, confianca: 'alta' })
    expect(m.palpites.frase).toMatchObject({ indice: 3, confianca: 'alta' })
    expect(m.precisaDeConferencia).toBe(false)
  })

  it('só "contém": média, e não bloqueia', () => {
    const m = inferirMapeamento(['Id', 'Target Term Text', 'Meaning Text', 'Notes'])
    expect(m.palpites.palavra).toMatchObject({ indice: 1, confianca: 'media', origem: 'contem' })
    expect(m.palpites.significado?.confianca).toBe('media')
    expect(m.precisaDeConferencia).toBe(false)
  })

  it('№/IMG sem nome reconhecível: posicional, baixa, pede conferência', () => {
    const m = inferirMapeamento(['№', 'IMG', 'Foo', 'Bar'])
    expect(m.palpites.palavra).toMatchObject({ indice: 0, confianca: 'baixa', origem: 'posicao' })
    // IMG é imagem pelo nome: o significado posicional pula para o campo seguinte.
    expect(m.palpites.significado).toMatchObject({ indice: 2, confianca: 'baixa' })
    expect(m.precisaDeConferencia).toBe(true)
  })

  it('dois campos sem nome: baixa, mas NÃO bloqueia (o caso mais comum continua sem parada)', () => {
    for (const nomes of [[], ['', ''], ['Foo', 'Bar']]) {
      const m = inferirMapeamento(nomes, { amostra: [['casa', 'house']] })
      expect(m.palpites.palavra?.confianca, nomes.join()).toBe('baixa')
      expect(m.precisaDeConferencia, nomes.join()).toBe(false)
    }
  })

  it('Word vence Front; Meaning vence Sound_Meaning; áudio e imagem saem da disputa', () => {
    const a = inferirMapeamento(['Front', 'Word', 'Back'])
    expect(a.palpites.palavra?.indice).toBe(1)
    const b = inferirMapeamento(['Word', 'Image', 'Sound', 'Sound_Meaning', 'Meaning'])
    expect(b.palpites.significado?.indice).toBe(4)
    expect(b.papeis).toEqual(['palavra', 'imagem', 'audio', 'audio', 'significado'])
    // Sem Meaning: Sound_Meaning CONTÉM "meaning", mas é áudio e não vira verso.
    const c = inferirMapeamento(['Word Audio', 'Word', 'Sound_Meaning', 'Definition'])
    expect(c.palpites.palavra?.indice).toBe(1)
    expect(c.palpites.significado?.indice).toBe(3)
  })

  it('o conteúdo da amostra marca imagem mesmo com nome estranho', () => {
    const amostra = [
      ['1', '<img src="a.jpg">', 'casa', 'house'],
      ['2', '<img src="b.jpg">', 'água', 'water'],
    ]
    const m = inferirMapeamento(['№', 'Pic', 'Foo', 'Bar'], { amostra })
    expect(m.papeis[1]).toBe('imagem')
  })

  it('Expression: palavra curta e sem espaço (vocabulário) x frase longa (mineração), sempre com confiança baixa', () => {
    const vocab = [
      ['casa', 'house', 'x'],
      ['água', 'water', 'x'],
      ['pão', 'bread', 'x'],
    ]
    const v = inferirMapeamento(['Expression', 'Meaning', 'Note'], { amostra: vocab })
    expect(v.papeis[0]).toBe('palavra')
    expect(v.palpites.palavra).toMatchObject({ indice: 0, confianca: 'baixa', origem: 'conteudo' })
    expect(v.precisaDeConferencia).toBe(true)

    const mineracao = [
      ['彼は毎朝早く起きて ジョギングをします', 'He gets up early every morning and jogs', '[sound:a.mp3]'],
      [
        'この本はとても面白いので みんなに勧めたい',
        'This book is so interesting I want to recommend it',
        '[sound:b.mp3]',
      ],
    ]
    const mi = inferirMapeamento(['Expression', 'Meaning', 'Audio'], { amostra: mineracao })
    expect(mi.papeis).toEqual(['frase', 'significado', 'audio'])
    expect(mi.palpites.palavra).toMatchObject({ indice: 0, confianca: 'baixa', origem: 'conteudo' })
    expect(mi.palpites.frase?.indice).toBe(0)
  })

  const ARQUETIPOS: Array<[string, string[], number, number]> = [
    [
      'Kaishi',
      ['Word', 'Word Reading', 'Word Meaning', 'Word Furigana', 'Sentence', 'Sentence Meaning', 'Word Audio'],
      0,
      2,
    ],
    [
      'Core 2k',
      ['Vocabulary-Kanji', 'Vocabulary-English', 'Sentence-Kanji', 'Sentence-English', 'Vocabulary-Audio'],
      0,
      -1,
    ],
    ['subs2srs', ['Sequence Marker', 'Expression', 'Meaning', 'Audio', 'Snapshot'], 1, 2],
    ['HSK', ['Simplified', 'Pinyin', 'Definition', 'Example'], 0, 2],
    ['Basic', ['Front', 'Back'], 0, 1],
    ['4000EW', ['Word', 'Image', 'Sound', 'Sound_Meaning', 'Sound_Example', 'Meaning', 'Example', 'IPA'], 0, 5],
  ]
  it.each(ARQUETIPOS)('arquétipo %s mapeia palavra e significado certos', (_nome, campos, palavra, significado) => {
    const m = inferirMapeamento(campos)
    expect(m.palpites.palavra?.indice).toBe(palavra)
    if (significado >= 0) expect(m.palpites.significado?.indice).toBe(significado)
  })
})

describe('mapeamento escolhido e perfil', () => {
  it('manual vence tudo e ganha confiança alta; perfil vem como média', () => {
    const papeis: PapelNaImportacao[] = ['nenhum', 'nenhum', 'palavra', 'significado']
    const manual = inferirMapeamento(['№', 'IMG', 'Foo', 'Bar'], { manual: papeis })
    expect(manual.palpites.palavra).toMatchObject({ indice: 2, confianca: 'alta', origem: 'manual' })
    expect(manual.precisaDeConferencia).toBe(false)
    const perfil = inferirMapeamento(['№', 'IMG', 'Foo', 'Bar'], { perfil: papeis })
    expect(perfil.palpites.significado).toMatchObject({ indice: 3, confianca: 'media', origem: 'perfil' })
  })

  it('mapeamento de outro tamanho ou sem par palavra/significado não serve', () => {
    expect(mapeamentoServe(['palavra', 'significado'], 3)).toBe(false)
    expect(mapeamentoServe(['palavra', 'nenhum', 'nenhum'], 3)).toBe(false)
    expect(mapeamentoServe(['frase', 'significado'], 2)).toBe(true)
  })

  it('trocar o papel de um campo tira o mesmo papel de quem o tinha, e nenhum campo some', () => {
    const antes: PapelNaImportacao[] = ['palavra', 'significado', 'frase']
    const depois = trocarPapel(antes, 2, 'palavra')
    expect(depois).toEqual(['nenhum', 'significado', 'palavra'])
    expect(depois).toHaveLength(antes.length)
    expect(trocarPapel(antes, 0, 'audio')).toEqual(['audio', 'significado', 'frase'])
  })

  it('a prévia segue os papéis; sem palavra, a frase faz de frente', () => {
    expect(preverNotas([['1', 'casa', 'house']], ['nenhum', 'palavra', 'significado'])).toEqual([
      { frente: 'casa', verso: 'house', exemplo: '' },
    ])
    expect(preverNotas([['Ele corre', 'He runs']], ['frase', 'significado'])).toEqual([
      { frente: 'Ele corre', verso: 'He runs', exemplo: '' },
    ])
  })

  it('montarNota com mapeamento manual gera a nota do 4000EW que o palpite descartava', () => {
    const entrada = {
      guid: 'g',
      flds: ['12', '<img src="a.jpg">', 'abandon', 'deixar'].join(SEP),
      tags: '',
      nomesDosCampos: ['№', 'IMG', 'Foo', 'Bar'],
    }
    expect(montarNota(entrada)).toBeNull()
    const nota = montarNota({ ...entrada, mapeamento: ['nenhum', 'imagem', 'palavra', 'significado'] })
    expect(nota).toMatchObject({ frente: 'abandon', verso: 'deixar' })
    expect(nota?.midia?.imagens).toEqual(['a.jpg'])
  })
})

describe('leitura do .apkg com o Mapeador', () => {
  const CAMPOS = ['№', 'IMG', 'Foo', 'Bar']
  const notas = Array.from({ length: 30 }, (_, i) => [
    String(i + 1),
    `<img src="${i}.jpg">`,
    `palavra${i}`,
    `sentido${i}`,
  ])
  const PAPEIS: PapelNaImportacao[] = ['nenhum', 'imagem', 'palavra', 'significado']

  it('sem mapeamento: leitura de sempre, sem `estruturas` (flag desligada = comportamento de hoje)', async () => {
    const r = await lerApkg(await colecao(CAMPOS, notas), { abrirSqlite })
    expect(r.estruturas).toBeUndefined()
  })

  it('com mapeamento: a estrutura pede conferência, traz a amostra e conta as notas do tipo', async () => {
    const r = await lerApkg(await colecao(CAMPOS, notas), { abrirSqlite, mapeamento: {} })
    expect(r.estruturas).toHaveLength(1)
    const e = r.estruturas![0]
    expect(e.hash).toBe(hashDaEstrutura(CAMPOS))
    expect(e.precisaDeConferencia).toBe(true)
    expect(e.notas).toBe(30)
    expect(e.amostra).toHaveLength(3)
    expect(e.amostra[0]).toEqual(['1', '', 'palavra0', 'sentido0'])
    // Posicional, mas a amostra mostra que № é número e IMG é imagem: o palpite pula os dois. Continua baixo: pede conferência.
    expect(r.notas[0]).toMatchObject({ frente: 'palavra0', verso: 'sentido0' })
  })

  it('com o mapeamento manual do hash, as 30 notas existem', async () => {
    const r = await lerApkg(await colecao(CAMPOS, notas), {
      abrirSqlite,
      mapeamento: { manuais: { [hashDaEstrutura(CAMPOS)]: PAPEIS } },
    })
    expect(r.notas).toHaveLength(30)
    expect(r.notas[0]).toMatchObject({ frente: 'palavra0', verso: 'sentido0' })
    expect(r.estruturas![0].precisaDeConferencia).toBe(false)
  })

  it('o perfil de OUTRA ordem de campos não se aplica (o hash é diferente)', async () => {
    const r = await lerApkg(await colecao(['IMG', '№', 'Foo', 'Bar'], notas), {
      abrirSqlite,
      mapeamento: { perfis: { [hashDaEstrutura(CAMPOS)]: PAPEIS } },
    })
    expect(r.estruturas![0].palpites.palavra?.origem).toBe('posicao')
  })

  it('o perfil da MESMA estrutura vale, com confiança média, e não pede conferência', async () => {
    const r = await lerApkg(await colecao(CAMPOS, notas), {
      abrirSqlite,
      mapeamento: { perfis: { [hashDaEstrutura(CAMPOS)]: PAPEIS } },
    })
    expect(r.estruturas![0].palpites.palavra).toMatchObject({ confianca: 'media', origem: 'perfil' })
    expect(r.estruturas![0].precisaDeConferencia).toBe(false)
    expect(r.notas).toHaveLength(30)
  })

  it('baralho de dois campos sem nome: sem parada e as notas de sempre', async () => {
    const dois = [
      ['casa', 'house'],
      ['água', 'water'],
    ]
    const r = await lerApkg(await colecao([], dois), { abrirSqlite, mapeamento: {} })
    expect(r.estruturas![0].precisaDeConferencia).toBe(false)
    expect(r.notas.map((n) => n.frente)).toEqual(['casa', 'água'])
  })
})

describe('perfis só no aparelho', () => {
  const hash = hashDaEstrutura(['A', 'B', 'C'])
  beforeEach(() => {
    const dados = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
      clear: () => dados.clear(),
    })
  })

  it('salva, lê e esquece; guarda só hash e papéis, nenhum conteúdo', () => {
    salvarPerfil(hash, ['palavra', 'significado', 'nenhum'])
    expect(lerPerfis()).toEqual({ [hash]: ['palavra', 'significado', 'nenhum'] })
    expect(localStorage.getItem(CHAVE_DOS_PERFIS)).not.toMatch(/casa|house/)
    esquecerPerfil(hash)
    expect(lerPerfis()).toEqual({})
  })

  it('lixo no armazenamento é ignorado', () => {
    localStorage.setItem(CHAVE_DOS_PERFIS, '{nao e json')
    expect(lerPerfis()).toEqual({})
    localStorage.setItem(CHAVE_DOS_PERFIS, JSON.stringify({ [hash]: { papeis: ['palavra', 'hacker'], em: 1 }, x: 1 }))
    expect(lerPerfis()).toEqual({})
  })

  it('mantém só os mais recentes', () => {
    for (let i = 0; i < MAXIMO_DE_PERFIS + 5; i++)
      salvarPerfil(hashDaEstrutura([`campo${i}`, 'b']), ['palavra', 'significado'], i)
    expect(Object.keys(lerPerfis())).toHaveLength(MAXIMO_DE_PERFIS)
    expect(lerPerfis()[hashDaEstrutura(['campo0', 'b'])]).toBeUndefined()
  })
})
