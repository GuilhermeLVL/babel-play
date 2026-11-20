/**
 * A EXPORTAÇÃO `.apkg` DO NAVEGADOR (`src/lib/anki/montarApkg.ts`), rodada em Node com o mesmo `sql.js`.
 *
 * Os casos de HTML hostil vieram de `tests/seguranca/anki-html-hostil.test.ts` (lá ficava só a exportação).
 *
 * A cadeia, e onde cada elo escapa:
 *
 *   arquivo → `limparCampo` → `vocab_cards` → tela (React escapa) → `montarApkg` → Anki da pessoa
 *
 * A MEDIÇÃO (2026-09-09). `limparCampo` remove tags, mas decodifica as entidades DEPOIS — de propósito,
 * senão `&lt;div&gt;`, que o autor escreveu para ser mostrado como texto, seria apagado. O efeito colateral
 * é que `&lt;script&gt;alert(1)&lt;/script&gt;` SAI dele como marcação viva. Dentro do produto ela é inerte
 * (o React escapa tudo), mas `notes.flds` do `.apkg` é renderizado como HTML pelo Anki, um webview: o
 * último elo é `escaparHtml` em `montarApkg.ts`, e é ele que este arquivo cobra.
 */
import { createRequire } from 'node:module'

import { unzipSync } from 'fflate'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { describe, expect, it } from 'vitest'

import { lerApkg } from '../src/lib/anki/lerApkg'
import { montarApkg } from '../src/lib/anki/montarApkg'

const SEP = '\x1f'
const require = createRequire(import.meta.url)

/** O `abrirSqlite` de Node: o mesmo `sql.js`, com o `.wasm` achado em `node_modules`. Memoizado. */
let sqlite: Promise<SqlJsStatic> | undefined
const abrirSqlite = () => (sqlite ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }))

const montar = (cartoes: Array<{ frente: string; verso: string; exemplo?: string }>, nome = 'x') =>
  montarApkg(cartoes, nome, abrirSqlite)

/** Cargas escritas como MARCAÇÃO: uma por técnica que um removedor de tags poderia deixar passar. */
const TAGS = [
  '<script>alert(1)</script>casa',
  '<img src=x onerror=alert(1)>casa',
  '<svg/onload=alert(1)>casa',
  '<a href="javascript:alert(1)">casa</a>',
  '<scr<script>ipt>alert(1)</script>casa',
  '<!--[if IE]><script>alert(1)</script><![endif]-->casa',
  '<img src="x" alt="a<b" onerror=alert(1)>casa',
  '<iframe src="data:text/html,<script>alert(1)</script>">casa',
]

/** Cargas escritas como ENTIDADE: atravessam `limparCampo` como marcação (ver o cabeçalho). */
const ENTIDADES = [
  '&lt;script&gt;alert(1)&lt;/script&gt;casa',
  '&#60;script&#62;alert(1)&#60;/script&#62;casa',
  '&#x3c;img src=x onerror=alert(1)&#x3e;casa',
]

/** Uma tag de verdade: `<` seguido de nome de elemento ou de barra. `a < b` não conta. */
const TAG_VIVA = /<\/?[a-z][a-z0-9]*[\s/>]/i

/** Abre a coleção do `.apkg` exportado e roda a consulta, sem interpretar nada. */
async function consultar(apkg: Uint8Array, sql: string): Promise<unknown[][]> {
  const zip = unzipSync(apkg)
  const SQL = await abrirSqlite()
  const db = new SQL.Database(zip['collection.anki2'])
  try {
    return db.exec(sql)[0]?.values ?? []
  } finally {
    db.close()
  }
}

const camposDoApkg = async (apkg: Uint8Array) =>
  (await consultar(apkg, 'SELECT flds FROM notes ORDER BY id')).map(([f]) => String(f).split(SEP))

describe('a exportação .apkg no navegador', () => {
  it('gera um .apkg que o leitor da Task 2 lê de volta com os mesmos cartões', async () => {
    const cartoes = [
      { frente: 'casa', verso: 'house', exemplo: 'a casa é azul' },
      { frente: 'gato', verso: 'cat', exemplo: '' },
    ]
    const apkg = await montar(cartoes, 'Meu baralho')
    const lido = await lerApkg(new Blob([apkg]), { abrirSqlite })
    expect(lido.notas.map((n) => [n.frente, n.verso, n.exemplo ?? ''])).toEqual([
      ['casa', 'house', 'a casa é azul'],
      ['gato', 'cat', ''],
    ])
  })

  it('o leitor reconhece formato, campos e ordem; cada nota ganha um cartão e o esquema é o 11', async () => {
    // Relê-lo verifica zip, esquema, tabelas e a ordem dos campos de uma vez.
    const apkg = await montar(
      [
        { frente: 'house', verso: 'casa', exemplo: 'I live in a big house.' },
        { frente: 'water', verso: 'água' },
        { frente: 'e', verso: 'f' },
      ],
      'X',
    )
    expect(Object.keys(unzipSync(apkg)).sort()).toEqual(['collection.anki2', 'media'])
    const lido = await lerApkg(new Blob([apkg]), { abrirSqlite })
    expect(lido.formato).toBe('collection.anki2')
    expect(lido.campos).toEqual(['Frente', 'Verso', 'Frase'])
    expect(lido.notas.slice(0, 2).map((n) => `${n.frente}=${n.verso}`)).toEqual(['house=casa', 'water=água'])
    expect(lido.descartadas).toBe(0)

    // sem cartão o Anki importa e não mostra nada
    expect(
      await consultar(apkg, 'SELECT (SELECT COUNT(*) FROM notes), (SELECT COUNT(*) FROM cards), ver FROM col'),
    ).toEqual([[3, 3, 11]])
  })

  it('escapa < & > nos campos (HTML hostil não vira tag no Anki da pessoa)', async () => {
    const [nota] = await camposDoApkg(await montar([{ frente: '<script>casa', verso: 'a & b < c', exemplo: '' }]))
    expect(nota[0]).toBe('&lt;script&gt;casa')
    expect(nota[1]).toBe('a &amp; b &lt; c')
  })

  it('campo nenhum do arquivo exportado contém marcação viva', async () => {
    const cargas = [...TAGS, ...ENTIDADES]
    const apkg = await montar(cargas.map((c) => ({ frente: c, verso: `verso ${c}`, exemplo: c })))
    const campos = await camposDoApkg(apkg)
    expect(campos.length).toBe(cargas.length)
    for (const nota of campos)
      for (const campo of nota) expect(campo, `campo exportado com tag: ${campo}`).not.toMatch(TAG_VIVA)
  })

  it('cartão comum sai byte a byte igual ao que entrou', async () => {
    const [nota] = await camposDoApkg(await montar([{ frente: 'casa', verso: 'house', exemplo: 'a casa é azul' }]))
    expect(nota).toEqual(['casa', 'house', 'a casa é azul'])
  })

  it('nome do baralho com aspas e <script> chega íntegro e escapado em col.decks', async () => {
    const nome = 'O "meu" <script>alert(1)</script> baralho'
    const [[decks]] = await consultar(await montar([{ frente: 'a', verso: 'b' }], nome), 'SELECT decks FROM col')
    const baralhos = Object.values(JSON.parse(String(decks))) as Array<{ name: string }>
    // JSON.stringify guarda o nome como dado: aspas escapadas, e lido de volta é exatamente o que entrou.
    expect(baralhos[0].name).toBe(nome)
    expect(String(decks)).toContain('\\"meu\\"')
  })

  it('o csum é o SHA-1 do primeiro campo, como o Anki calcula', async () => {
    // sha1("casa") começa com 81bce1f3 (conferido com `printf casa | shasum`)
    const [[csum]] = await consultar(await montar([{ frente: 'casa', verso: 'house' }]), 'SELECT csum FROM notes')
    expect(csum).toBe(parseInt('81bce1f3', 16))
  })

  it('mais de 5.000 cartões → erro', async () => {
    const cartoes = Array.from({ length: 5001 }, (_, i) => ({ frente: `f${i}`, verso: 'v' }))
    await expect(montar(cartoes)).rejects.toThrow(/5\.000/)
  })

  it('zero cartões, campo grande demais e nome grande demais → erro', async () => {
    await expect(montar([])).rejects.toThrow(/ao menos um cartão/)
    await expect(montar([{ frente: 'x'.repeat(2001), verso: 'v' }])).rejects.toThrow(/2\.000/)
    await expect(montar([{ frente: 'a', verso: 'v' }], 'n'.repeat(121))).rejects.toThrow(/120/)
  })
})
