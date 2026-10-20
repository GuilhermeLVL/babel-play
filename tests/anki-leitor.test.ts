/**
 * O LEITOR DE `.apkg` DO NAVEGADOR (`src/lib/anki/lerApkg.ts`), rodado em Node com o mesmo `sql.js`.
 *
 * Os `.apkg` sintéticos são montados com `sql.js` (`db.export()`) + `fflate.zipSync`, sem passar pelo
 * leitor antes. A seção do baralho hostil veio de `tests/seguranca/anki-html-hostil.test.ts` (lá ficou só
 * a exportação): a cadeia, e onde cada elo escapa, está explicada no cabeçalho daquele arquivo.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import * as zlib from 'node:zlib'

import { zipSync } from 'fflate'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { describe, expect, it } from 'vitest'

import { lerTextoAnki, limparCampo } from '../src/core/anki'
import { lerApkg } from '../src/lib/anki/lerApkg'
import { lerBaralhoNoNavegador } from '../src/lib/anki/lerBaralho'
import { ExpansaoAcimaDoTeto } from '../src/lib/zip/zipComTeto'

const FIXTURES = join(__dirname, 'fixtures')
const SEP = '\x1f'
const require = createRequire(import.meta.url)

/** O `abrirSqlite` de Node: o mesmo `sql.js`, com o `.wasm` achado em `node_modules`. Memoizado. */
let sqlite: Promise<SqlJsStatic> | undefined
const abrirSqlite = () => (sqlite ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }))

const ler = (arquivo: Blob, teto?: number) => lerApkg(arquivo, { abrirSqlite, teto })
const fixture = async (nome: string) => new Blob([await readFile(join(FIXTURES, nome))])
const apkg = (entradas: Record<string, Uint8Array>) => new Blob([zipSync(entradas)])

/** Uma coleção no esquema novo (tabelas `notetypes`/`fields`/`decks`), com os campos e as notas dados. */
async function colecao(
  notas: string[][],
  opcoes: { campos?: string[]; nomeDoBaralho?: string; semGuid?: boolean } = {},
): Promise<Uint8Array> {
  const SQL = await abrirSqlite()
  const db = new SQL.Database()
  try {
    db.run(`
      CREATE TABLE notetypes (id integer primary key, name text not null);
      CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null);
      CREATE TABLE decks (id integer primary key, name text not null);
      CREATE TABLE notes (id integer primary key, ${opcoes.semGuid ? '' : 'guid text not null,'} mid integer not null, flds text not null, tags text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null);
    `)
    db.run('INSERT INTO notetypes VALUES (?,?)', [1, 'Basic'])
    for (const [ord, nome] of (opcoes.campos ?? ['Front', 'Back']).entries())
      db.run('INSERT INTO fields VALUES (?,?,?)', [1, ord, nome])
    db.run('INSERT INTO decks VALUES (?,?)', [1, opcoes.nomeDoBaralho ?? 'hostil'])
    for (const [i, campos] of notas.entries()) {
      const flds = campos.join(SEP)
      if (opcoes.semGuid) db.run('INSERT INTO notes VALUES (?,?,?,?)', [i + 1, 1, flds, ''])
      else db.run('INSERT INTO notes VALUES (?,?,?,?,?)', [i + 1, `g-${i}`, 1, flds, ''])
      db.run('INSERT INTO cards VALUES (?,?,?,0)', [i + 1, i + 1, 1])
    }
    return db.export()
  } finally {
    db.close()
  }
}

/** O `.apkg` moderno sem zstd (`collection.anki21`), o caminho mais curto até as consultas. */
const apkgCom = async (notas: Array<{ frente: string; verso: string }>, nomeDoBaralho?: string) =>
  apkg({
    'collection.anki21': await colecao(
      notas.map((n) => [n.frente, n.verso]),
      { nomeDoBaralho },
    ),
  })

describe('fixtures', () => {
  it('lê tests/fixtures/baralho-moderno.apkg (collection.anki21b, zstd) → 4 notas, formato "collection.anki21b"', async () => {
    const r = await ler(await fixture('baralho-moderno.apkg'))
    expect(r.formato).toBe('collection.anki21b')
    expect(r.notas.map((n) => n.frente)).toEqual(['house', 'water', 'bread', 'light'])
    expect(r.campos).toEqual(['Frente', 'Verso', 'Frase'])
    expect(r.notas.find((n) => n.frente === 'light')?.verso).toBe('luz claridade')
    expect(r.notas.map((n) => n.verso).join(' ')).not.toContain('Ã')
  })

  it('lê tests/fixtures/baralho-antigo.apkg (collection.anki2) → notas com campos nomeados de col.models', async () => {
    const r = await ler(await fixture('baralho-antigo.apkg'))
    expect(r.formato).toBe('collection.anki2')
    expect(r.campos).toEqual(['Front', 'Back', 'Example'])
    expect(r.notas[0]).toMatchObject({ frente: 'house', verso: 'casa', exemplo: 'I live in a big house.' })
    expect(Object.keys(r.notas[0].camposBrutos ?? {})).toEqual(['Front', 'Back', 'Example'])
    expect(r.notas[0].tags).toEqual(['tag1'])
    expect(r.descartadas).toBe(1)
    expect(r.notas.map((n) => n.verso)).toEqual(expect.arrayContaining(['água', 'pão']))
  })
})

describe('zstd e tetos', () => {
  const comZstd = typeof zlib.zstdCompressSync === 'function'

  it.skipIf(!comZstd)('frame zstd sem tamanho declarado é lido em streaming', async () => {
    const db = await colecao([['casa', 'house']])
    // Sem `contentSizeFlag` o frame não diz quanto vai sair — o caso dos `.anki21b` do Anki.
    const frame = new Uint8Array(zlib.zstdCompressSync(db, { params: { [zlib.constants.ZSTD_c_contentSizeFlag]: 0 } }))
    const descritor = frame[4]
    expect(descritor >> 6, 'o frame declara o tamanho; o teste não exercita o streaming').toBe(0)
    expect(descritor & 0x20, 'frame de segmento único declara o tamanho').toBe(0)

    const r = await ler(apkg({ 'collection.anki21b': frame, meta: new Uint8Array([1]) }))
    expect(r.formato).toBe('collection.anki21b')
    expect(r.notas).toMatchObject([{ frente: 'casa', verso: 'house', guid: 'g-0' }])
  })

  it.skipIf(!comZstd)('coleção que passa de TETO_DE_EXPANSAO depois do zstd é recusada', async () => {
    // 1 MB de zeros vira poucos bytes de zstd: passa folgado pelo teto do zip e só o 2º estágio o pega.
    const frame = new Uint8Array(zlib.zstdCompressSync(new Uint8Array(1024 * 1024)))
    const promessa = ler(apkg({ 'collection.anki21b': frame }), 512 * 1024)
    await expect(promessa).rejects.toBeInstanceOf(ExpansaoAcimaDoTeto)
    await expect(promessa).rejects.toThrow('collection.anki21b passou de 1 MB ao descompactar; arquivo recusado')
  })

  it('o teto também vale no estágio do zip', async () => {
    const promessa = ler(apkg({ 'collection.anki21': new Uint8Array(1024 * 1024) }), 512 * 1024)
    await expect(promessa).rejects.toBeInstanceOf(ExpansaoAcimaDoTeto)
  })
})

describe('estrutura da nota', () => {
  it('nota com mais partes em flds do que nomes → campoN em camposBrutos, nota mantida', async () => {
    const r = await ler(apkg({ 'collection.anki21': await colecao([['casa', 'house', 'extra', 'mais um']]) }))
    expect(r.notas).toHaveLength(1)
    expect(r.notas[0].camposBrutos).toEqual({ Front: 'casa', Back: 'house', campo2: 'extra', campo3: 'mais um' })
  })

  it('tabela notes sem a coluna guid → a nota sai com guid vazio em vez de o import morrer', async () => {
    const r = await ler(apkg({ 'collection.anki21': await colecao([['casa', 'house']], { semGuid: true }) }))
    expect(r.notas).toMatchObject([{ frente: 'casa', verso: 'house', guid: '' }])
  })

  it('nome de baralho com \\x1f vira hierarquia com ::, e entrada numérica no zip marca temMidia', async () => {
    const db = await colecao([['casa', 'house']], { nomeDoBaralho: `Idiomas${SEP}Inglês` })
    const r = await ler(apkg({ 'collection.anki21': db, '0': new Uint8Array([1, 2, 3]) }))
    expect(r.baralhos).toEqual(['Idiomas::Inglês'])
    expect(r.notas[0].baralho).toBe('Idiomas::Inglês')
    expect(r.temMidia).toBe(true)
  })
})

describe('arquivo inválido', () => {
  it('arquivo que não é zip → "não consegui abrir este .apkg"', async () => {
    await expect(ler(new Blob(['isto não é um zip']))).rejects.toThrow(
      'não consegui abrir este .apkg (não é um zip válido)',
    )
  })

  it('zip sem coleção → diz o que falta', async () => {
    await expect(ler(apkg({ 'outra.txt': new Uint8Array([1]) }))).rejects.toThrow(
      'não encontrei a coleção dentro do .apkg (collection.anki2/21/21b)',
    )
  })
})

describe('lerBaralhoNoNavegador', () => {
  it('lerTextoAnki continua acessível por lerBaralhoNoNavegador para .tsv', async () => {
    const r = await lerBaralhoNoNavegador(new File(['house\tcasa\nwater\tágua'], 'deck.tsv'))
    expect(r.notas.map((n) => [n.frente, n.verso])).toEqual([
      ['house', 'casa'],
      ['water', 'água'],
    ])
  })
})

/* ═══════════════ Baralho hostil (vindo de tests/seguranca/anki-html-hostil.test.ts) ═══════════════ */

/**
 * Cargas escritas como MARCAÇÃO. A lista não é "várias formas de escrever `<script>`": é uma por
 * técnica que um removedor de tags poderia deixar passar.
 */
const TAGS: Array<{ nome: string; bruto: string }> = [
  { nome: 'script direto', bruto: '<script>alert(1)</script>casa' },
  { nome: 'atributo de evento', bruto: '<img src=x onerror=alert(1)>casa' },
  { nome: 'svg com onload e sem espaço', bruto: '<svg/onload=alert(1)>casa' },
  { nome: 'href javascript:', bruto: '<a href="javascript:alert(1)">casa</a>' },
  // Quem remove tags com UMA passada gulosa deixa `<script>` REMONTADO pelo que sobra.
  { nome: 'tag remontada', bruto: '<scr<script>ipt>alert(1)</script>casa' },
  { nome: 'comentário condicional', bruto: '<!--[if IE]><script>alert(1)</script><![endif]-->casa' },
  { nome: 'atributo com aspas quebradas', bruto: '<img src="x" alt="a<b" onerror=alert(1)>casa' },
  { nome: 'iframe com src de dados', bruto: '<iframe src="data:text/html,<script>alert(1)</script>">casa' },
]

/**
 * Cargas escritas como ENTIDADE. Estas ATRAVESSAM `limparCampo` como marcação — ver o cabeçalho de
 * `tests/seguranca/anki-html-hostil.test.ts`. Quem as segura é a exportação e a tela, não o sanitizador.
 */
const ENTIDADES: Array<{ nome: string; bruto: string }> = [
  { nome: 'entidade nomeada', bruto: '&lt;script&gt;alert(1)&lt;/script&gt;casa' },
  { nome: 'entidade decimal', bruto: '&#60;script&#62;alert(1)&#60;/script&#62;casa' },
  { nome: 'entidade hexadecimal', bruto: '&#x3c;img src=x onerror=alert(1)&#x3e;casa' },
]

const CARGAS = [...TAGS, ...ENTIDADES]

/** Uma tag de verdade: `<` seguido de nome de elemento ou de barra. `a < b` não conta. */
const TAG_VIVA = /<\/?[a-z][a-z0-9]*[\s/>]/i

describe('limparCampo: o que ele garante', () => {
  for (const { nome, bruto } of TAGS) {
    it(`${nome}: nenhuma tag sobrevive`, () => {
      const limpo = limparCampo(bruto)
      expect(limpo, `sobrou tag em: ${limpo}`).not.toMatch(TAG_VIVA)
    })
  }

  it('o texto legítimo em volta da carga é preservado', () => {
    // Se o sanitizador "resolvesse" apagando o campo, o baralho sumia e ninguém reclamaria pelo
    // motivo certo. A palavra tem que continuar lá — é ela que vira cartão.
    for (const { nome, bruto } of CARGAS) {
      expect(limparCampo(bruto), nome).toContain('casa')
    }
  })
})

describe('limparCampo: o que ele NÃO garante, e por quê', () => {
  /**
   * Caracterização deliberada. A ordem (tags primeiro, entidades depois) é ela que preserva
   * `&lt;div&gt;` como texto. Inverter para "fechar" este caso corromperia conteúdo legítimo de
   * baralho — e não fecharia nada, porque quem segura a marcação é o sink, não o sanitizador.
   */
  for (const { nome, bruto } of ENTIDADES) {
    it(`${nome}: a entidade vira marcação viva — inerte aqui, contida na exportação`, () => {
      expect(limparCampo(bruto)).toMatch(TAG_VIVA)
    })
  }

  it('a decodificação é de UMA passada: entidade dupla não vira tag', () => {
    // `&amp;lt;` é o autor escrevendo `&lt;` como texto. Uma segunda passada o transformaria em
    // `<`, e aí sim o sanitizador estaria fabricando marcação que o arquivo não tinha.
    expect(limparCampo('&amp;lt;script&amp;gt;casa')).toBe('&lt;script&gt;casa')
  })
})

describe('o arquivo inteiro: um .apkg hostil pelo leitor de verdade', () => {
  it('HTML hostil nos campos: nenhuma frente/verso sai com "<"; camposBrutos preserva o original', async () => {
    const r = await ler(await apkgCom(TAGS.map((c) => ({ frente: c.bruto, verso: `verso ${c.bruto}` }))))

    expect(r.notas.length, 'o baralho hostil deveria ser lido, não recusado').toBe(TAGS.length)
    for (const [i, n] of r.notas.entries()) {
      expect(n.frente, `frente: ${n.frente}`).not.toMatch(TAG_VIVA)
      expect(n.verso, `verso: ${n.verso}`).not.toMatch(TAG_VIVA)
      expect(n.camposBrutos?.Front).toBe(TAGS[i].bruto)
    }
  })

  /**
   * `camposBrutos` guarda o campo ÍNTEGRO de propósito — é o que permite refazer o mapeamento sem
   * pedir o arquivo de novo. Ele guarda a carga, então quem o consome tem que ser um lugar que escapa
   * (hoje, a tela; a projeção para cartão jogável usa `frente`/`verso`, que já passaram por `limparCampo`).
   */
  it('caracterização: camposBrutos guarda o HTML original, e o mapeamento depende disso', async () => {
    const r = await ler(await apkgCom([{ frente: '<b>casa</b>', verso: 'house' }]))
    expect(r.notas[0].camposBrutos?.Front).toBe('<b>casa</b>')
    expect(r.notas[0].frente).toBe('casa')
  })

  /**
   * Caracterização: o NOME do baralho não passa por `limparCampo`, e não precisa. Ele tem dois
   * sinks, os dois seguros: a tela (React escapa) e o `Content-Disposition` da exportação, que reduz o
   * nome a `[\w.-]` — o que também fecha injeção de cabeçalho por CRLF.
   */
  it('caracterização: o nome do baralho chega íntegro, e os dois sinks dele escapam', async () => {
    const hostil = '<img src=x onerror=alert(1)>meu deck'
    const r = await ler(await apkgCom([{ frente: 'casa', verso: 'house' }], hostil))
    expect(r.baralhos?.[0]).toBe(hostil)
    const paraCabecalho = `${hostil}\r\nX-Injetado: 1`.replace(/[^\w.-]/g, '_')
    expect(paraCabecalho).not.toMatch(/[\r\n"<>]/)
  })

  it('a importação por TEXTO tem o mesmo piso', () => {
    const linhas = TAGS.map((c) => `${c.bruto}\t verso`).join('\n')
    const r = lerTextoAnki(linhas)
    expect(r.notas.length).toBeGreaterThan(0)
    for (const n of r.notas) {
      expect(n.frente, `frente: ${n.frente}`).not.toMatch(TAG_VIVA)
    }
  })
})
