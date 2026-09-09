/**
 * FASE 4 — UM BARALHO HOSTIL ATRAVESSANDO O IMPORTADOR INTEIRO.
 *
 * Os testes de Anki que já existiam cobrem o que o formato faz de ERRADO por acidente (campo na
 * posição trocada, furigana, bomba de descompressão em `anki-bomba.test.ts`). Este cobre o que um
 * `.apkg` faz de errado de PROPÓSITO: `.apkg` é um arquivo que qualquer pessoa monta e envia, e os
 * campos dele são HTML por definição do formato.
 *
 * A cadeia, e onde cada elo escapa:
 *
 *   arquivo → `limparCampo` → `vocab_cards` → tela (React escapa) → `montarApkg` → Anki da pessoa
 *
 * A MEDIÇÃO QUE ESTE ARQUIVO REGISTRA (2026-09-09). `limparCampo` remove tags, mas decodifica as
 * entidades DEPOIS — de propósito, senão `&lt;div&gt;`, que o autor da nota escreveu para ser
 * mostrado como texto, seria confundido com uma tag e apagado. O efeito colateral é que
 * `&lt;script&gt;alert(1)&lt;/script&gt;` SAI de `limparCampo` como marcação viva. Não é um
 * descuido a corrigir ali: inverter a ordem corromperia conteúdo legítimo, e dentro do produto a
 * marcação é inerte (nada do baralho vira HTML — o único `dangerouslySetInnerHTML` do cliente é o
 * QR do 2FA, e o React escapa o resto).
 *
 * O elo que faltava era o ÚLTIMO. `notes.flds` do `.apkg` exportado é renderizado como HTML pelo
 * Anki, que é um webview: um baralho hostil importado e reexportado levava a carga para fora do
 * nosso domínio, onde a nossa política de escape não vale mais. `escaparHtml` em
 * `server/import/ankiExport.ts` fecha esse ponto, e a última seção aqui é quem cobra.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@libsql/client'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { lerApkg, lerTextoAnki, limparCampo } from '../../server/import/anki'
import { montarApkg } from '../../server/import/ankiExport'

const SEP = '\x1f'

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
 * Cargas escritas como ENTIDADE. Estas ATRAVESSAM `limparCampo` como marcação — ver o cabeçalho.
 * Elas estão aqui para provar que quem as segura é a exportação e a tela, não o sanitizador.
 */
const ENTIDADES: Array<{ nome: string; bruto: string }> = [
  { nome: 'entidade nomeada', bruto: '&lt;script&gt;alert(1)&lt;/script&gt;casa' },
  { nome: 'entidade decimal', bruto: '&#60;script&#62;alert(1)&#60;/script&#62;casa' },
  { nome: 'entidade hexadecimal', bruto: '&#x3c;img src=x onerror=alert(1)&#x3e;casa' },
]

const CARGAS = [...TAGS, ...ENTIDADES]

/** Uma tag de verdade: `<` seguido de nome de elemento ou de barra. `a < b` não conta. */
const TAG_VIVA = /<\/?[a-z][a-z0-9]*[\s/>]/i

/** Monta um `.apkg` (formato moderno) com os campos dados, sem passar por lugar nenhum antes. */
async function apkgCom(notas: Array<{ frente: string; verso: string }>, nomeDoBaralho = 'hostil'): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'babel-anki-hostil-'))
  const caminho = join(dir, 'collection.anki21')
  const cliente = createClient({ url: `file:${caminho}` })
  try {
    await cliente.executeMultiple(`
      CREATE TABLE notetypes (id integer primary key, name text not null);
      CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null);
      CREATE TABLE decks (id integer primary key, name text not null);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, flds text not null, tags text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null);
    `)
    await cliente.execute({ sql: 'INSERT INTO notetypes VALUES (?,?)', args: [1, 'Basic'] })
    await cliente.execute({ sql: 'INSERT INTO fields VALUES (?,?,?)', args: [1, 0, 'Front'] })
    await cliente.execute({ sql: 'INSERT INTO fields VALUES (?,?,?)', args: [1, 1, 'Back'] })
    await cliente.execute({ sql: 'INSERT INTO decks VALUES (?,?)', args: [1, nomeDoBaralho] })
    for (const [i, n] of notas.entries()) {
      await cliente.execute({
        sql: 'INSERT INTO notes VALUES (?,?,?,?,?)',
        args: [i + 1, `g-${i}`, 1, [n.frente, n.verso].join(SEP), ''],
      })
      await cliente.execute({ sql: 'INSERT INTO cards VALUES (?,?,?,0)', args: [i + 1, i + 1, 1] })
    }
    const db = await readFile(caminho)
    const zip = new JSZip()
    zip.file('collection.anki21', db)
    return await zip.generateAsync({ type: 'nodebuffer' })
  } finally {
    try {
      cliente.close()
    } catch {
      /* já fechado */
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* o SO limpa */
    })
  }
}

/** Lê os campos de volta de um `.apkg` exportado, sem interpretar nada. */
async function camposDoApkg(apkg: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(apkg)
  const arquivo = zip.file('collection.anki2') ?? zip.file('collection.anki21')
  if (!arquivo) throw new Error('o .apkg exportado não tem coleção dentro')
  const dir = await mkdtemp(join(tmpdir(), 'babel-anki-relido-'))
  const caminho = join(dir, 'collection.sqlite')
  await writeFile(caminho, await arquivo.async('nodebuffer'))
  const cliente = createClient({ url: `file:${caminho}` })
  try {
    const r = await cliente.execute('SELECT flds FROM notes ORDER BY id')
    return r.rows.map((linha) => String(linha.flds).split(SEP))
  } finally {
    try {
      cliente.close()
    } catch {
      /* já fechado */
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* o SO limpa */
    })
  }
}

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
   * Caracterização deliberada. A ordem (tags primeiro, entidades depois) está explicada em
   * `server/import/anki.ts` e é ela que preserva `&lt;div&gt;` como texto. Inverter para "fechar"
   * este caso corromperia conteúdo legítimo de baralho — e não fecharia nada, porque quem segura
   * a marcação é o sink, não o sanitizador.
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
  it('nenhuma frente ou verso escrito como TAG sai do leitor com tag', async () => {
    const apkg = await apkgCom(TAGS.map((c) => ({ frente: c.bruto, verso: `verso ${c.bruto}` })))
    const r = await lerApkg(apkg)

    expect(r.notas.length, 'o baralho hostil deveria ser lido, não recusado').toBe(TAGS.length)
    for (const n of r.notas) {
      expect(n.frente, `frente: ${n.frente}`).not.toMatch(TAG_VIVA)
      expect(n.verso, `verso: ${n.verso}`).not.toMatch(TAG_VIVA)
    }
  })

  /**
   * `camposBrutos` guarda o campo ÍNTEGRO de propósito — é o que permite refazer o mapeamento sem
   * pedir o arquivo de novo (`server/db/schema.ts:652`). Ele guarda a carga, então quem o consome
   * tem que ser um lugar que escapa. Hoje é a tela (React) e mais nada: a projeção para cartão
   * jogável (`vocabRepo.projetarDoAnki`, chamada por `ativarLote`) usa `frente`/`verso`, que já
   * passaram por `limparCampo`.
   */
  it('caracterização: camposBrutos guarda o HTML original, e o mapeamento depende disso', async () => {
    const apkg = await apkgCom([{ frente: '<b>casa</b>', verso: 'house' }])
    const r = await lerApkg(apkg)
    expect(r.notas[0].camposBrutos?.Front).toBe('<b>casa</b>')
    expect(r.notas[0].frente).toBe('casa')
  })

  /**
   * Caracterização: o NOME do baralho não passa por `limparCampo`, e não precisa. Ele tem dois
   * sinks, os dois seguros: a tela (React escapa) e o `Content-Disposition` da exportação, onde
   * `import.ts:221` reduz o nome a `[\w.-]` — o que também fecha injeção de cabeçalho por CRLF.
   * O nome também vai para o JSON de baralhos do `.apkg`, que o Anki mostra como texto.
   */
  it('caracterização: o nome do baralho chega íntegro, e os dois sinks dele escapam', async () => {
    const hostil = '<img src=x onerror=alert(1)>meu deck'
    const r = await lerApkg(await apkgCom([{ frente: 'casa', verso: 'house' }], hostil))
    expect(r.baralhos?.[0]).toBe(hostil)
    // O mesmo saneamento de `import.ts:221`, sobre o mesmo valor: nem tag, nem CR, nem LF, nem
    // aspas para fechar o `filename="..."`.
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

describe('a saída: o .apkg que a pessoa abre no Anki', () => {
  /**
   * O SINK DE VERDADE. `notes.flds` é renderizado como HTML por um webview — o escape aqui não é
   * sobre a nossa tela, é sobre não entregar carga executável num arquivo que sai do nosso
   * domínio. Este teste usa as cargas de ENTIDADE de propósito: são elas que chegam vivas até
   * aqui, e sem `escaparHtml` este `expect` falha.
   */
  it('campo nenhum do arquivo exportado contém marcação viva', async () => {
    const apkg = await apkgCom(CARGAS.map((c) => ({ frente: c.bruto, verso: `verso ${c.bruto}` })))
    const lido = await lerApkg(apkg)

    const exportado = await montarApkg(
      lido.notas.map((n) => ({ frente: n.frente, verso: n.verso, exemplo: n.exemplo })),
      'baralho reexportado',
    )

    const campos = await camposDoApkg(exportado)
    expect(campos.length).toBe(lido.notas.length)
    for (const nota of campos) {
      for (const campo of nota) {
        expect(campo, `campo exportado com tag: ${campo}`).not.toMatch(TAG_VIVA)
      }
    }
  })

  it('o escape preserva, não apaga: o texto continua legível no Anki', async () => {
    const exportado = await montarApkg([{ frente: '<script>casa', verso: 'a & b < c', exemplo: '' }], 'x')
    const [nota] = await camposDoApkg(exportado)
    expect(nota[0]).toBe('&lt;script&gt;casa')
    expect(nota[1]).toBe('a &amp; b &lt; c')
  })

  it('cartão comum sai byte a byte igual ao que entrou', async () => {
    // A prova de que o escape é inerte para conteúdo real: nenhum cartão legítimo tem `<`, `>` ou
    // `&`, porque todos passaram por `limparCampo` antes de virar cartão.
    const exportado = await montarApkg([{ frente: 'casa', verso: 'house', exemplo: 'a casa é azul' }], 'x')
    const [nota] = await camposDoApkg(exportado)
    expect(nota).toEqual(['casa', 'house', 'a casa é azul'])
  })
})
