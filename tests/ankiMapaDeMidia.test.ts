/**
 * MOTOR ANKI — MÍDIA: mapa de arquivos (`server/import/anki.ts`).
 *
 * Cobre `lerMapaDeMidia` (JSON legado + protobuf `MediaEntries` moderno), `extrairArquivoDeMidia`
 * (zstd por arquivo na variante Latest + teto de tamanho) e `indiceInversoDeMidia`. As fixtures
 * seguem o padrão de `tests/ankiMidia.test.ts` e `tests/integration/anki-bomba.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { zstdCompressSync } from 'node:zlib'
import JSZip from 'jszip'
import {
  lerMapaDeMidia,
  extrairArquivoDeMidia,
  indiceInversoDeMidia,
  TETO_DE_MIDIA_POR_ARQUIVO,
} from '../server/import/anki'

/** `.apkg` mínimo, só com a coleção (SQLite vazio o bastante pra JSZip aceitar) — usado quando o
 *  teste só precisa do `media` e dos arquivos numerados, não de notas de verdade. */
async function apkgComMedia(opts: { media: Buffer | string; arquivos?: Record<string, Buffer | string> }): Promise<JSZip> {
  const zip = new JSZip()
  zip.file('collection.anki2', 'nao-e-um-sqlite-de-verdade-mas-nao-importa-para-estes-testes')
  zip.file('media', opts.media)
  for (const [nome, conteudo] of Object.entries(opts.arquivos ?? {})) zip.file(nome, conteudo)
  return zip
}

/* ═══════════════════════════ encoder protobuf mínimo (só para o teste) ═══════════════════════════ */

function escreverVarint(valor: number): Buffer {
  const bytes: number[] = []
  let v = valor
  do {
    let byte = v & 0x7f
    v = Math.floor(v / 128)
    if (v > 0) byte |= 0x80
    bytes.push(byte)
  } while (v > 0)
  return Buffer.from(bytes)
}

function tag(campo: number, wireType: number): Buffer {
  return escreverVarint((campo << 3) | wireType)
}

function campoLengthDelimited(campo: number, conteudo: Buffer): Buffer {
  return Buffer.concat([tag(campo, 2), escreverVarint(conteudo.length), conteudo])
}

function campoVarint(campo: number, valor: number): Buffer {
  return Buffer.concat([tag(campo, 0), escreverVarint(valor)])
}

/** Codifica UMA `MediaEntry` (name=1, size=2, sha1=3, legacy_zip_filename=255). */
function codificarMediaEntry(e: { nome: string; bytes?: number; sha1?: Buffer; legacyZipFilename?: number }): Buffer {
  const partes: Buffer[] = [campoLengthDelimited(1, Buffer.from(e.nome, 'utf8'))]
  if (e.bytes !== undefined) partes.push(campoVarint(2, e.bytes))
  if (e.sha1) partes.push(campoLengthDelimited(3, e.sha1))
  if (e.legacyZipFilename !== undefined) partes.push(campoVarint(255, e.legacyZipFilename))
  return Buffer.concat(partes)
}

/** Codifica a mensagem raiz `MediaEntries` (entries=1, repetido). */
function codificarMediaEntries(entradas: Array<{ nome: string; bytes?: number; sha1?: Buffer; legacyZipFilename?: number }>): Buffer {
  return Buffer.concat(entradas.map(e => campoLengthDelimited(1, codificarMediaEntry(e))))
}

/* ═══════════════════════════════════════ testes ═══════════════════════════════════════ */

describe('lerMapaDeMidia — forma JSON (Legacy 1/2)', () => {
  it('lê o mapa {"0":"nome"} e devolve numérico -> {nome}', async () => {
    const zip = await apkgComMedia({ media: JSON.stringify({ '0': 'palavra.mp3', '1': 'foto.jpg' }) })
    const mapa = await lerMapaDeMidia(zip)
    expect(mapa).toBeDefined()
    expect(mapa!.get('0')).toEqual({ nome: 'palavra.mp3' })
    expect(mapa!.get('1')).toEqual({ nome: 'foto.jpg' })
  })

  it('devolve undefined quando o .apkg não tem arquivo media', async () => {
    const zip = new JSZip()
    zip.file('collection.anki2', 'x')
    const mapa = await lerMapaDeMidia(zip)
    expect(mapa).toBeUndefined()
  })
})

describe('lerMapaDeMidia — forma protobuf MediaEntries (Latest)', () => {
  it('faz o round-trip do decodificador: índice da entrada = nome numérico', async () => {
    const sha1A = Buffer.from('a'.repeat(40), 'hex')
    const bruto = codificarMediaEntries([
      { nome: 'palavra.mp3', bytes: 12345, sha1: sha1A },
      { nome: 'foto.jpg', bytes: 999 },
    ])
    const zip = await apkgComMedia({ media: bruto })
    const mapa = await lerMapaDeMidia(zip)

    expect(mapa).toBeDefined()
    expect(mapa!.get('0')).toEqual({ nome: 'palavra.mp3', bytes: 12345, sha1: 'a'.repeat(40) })
    expect(mapa!.get('1')).toEqual({ nome: 'foto.jpg', bytes: 999, sha1: undefined })
  })

  it('respeita legacy_zip_filename quando presente, em vez do índice posicional', async () => {
    const bruto = codificarMediaEntries([
      { nome: 'primeira.mp3' }, // índice 0, sem override -> numérico "0"
      { nome: 'segunda.mp3', legacyZipFilename: 7 }, // índice 1, override -> numérico "7"
    ])
    const zip = await apkgComMedia({ media: bruto })
    const mapa = await lerMapaDeMidia(zip)

    expect(mapa!.get('0')?.nome).toBe('primeira.mp3')
    expect(mapa!.has('1')).toBe(false)
    expect(mapa!.get('7')?.nome).toBe('segunda.mp3')
  })

  it('trata mensagem vazia sem lançar (baralho com media vazio)', async () => {
    const zip = await apkgComMedia({ media: Buffer.alloc(0) })
    const mapa = await lerMapaDeMidia(zip)
    expect(mapa).toBeDefined()
    expect(mapa!.size).toBe(0)
  })
})

describe('extrairArquivoDeMidia — descompressão zstd por arquivo (Latest)', () => {
  it('descomprime um arquivo numerado comprimido individualmente com zstd', async () => {
    const original = Buffer.from('conteúdo de áudio simulado, repetido '.repeat(50), 'utf8')
    const comprimido = zstdCompressSync(original)
    // Comprimido de verdade menor que o original — senão o teste não prova nada sobre zstd.
    expect(comprimido.length).toBeLessThan(original.length)

    const zip = await apkgComMedia({ media: '{}', arquivos: { '0': comprimido } })
    const extraido = await extrairArquivoDeMidia(zip, '0', 'collection.anki21b')
    expect(extraido.equals(original)).toBe(true)
  })

  it('variante não-Latest devolve o arquivo cru, sem tentar zstd', async () => {
    const original = Buffer.from('arquivo cru, legacy', 'utf8')
    const zip = await apkgComMedia({ media: '{}', arquivos: { '0': original } })
    const extraido = await extrairArquivoDeMidia(zip, '0', 'collection.anki21')
    expect(extraido.equals(original)).toBe(true)
  })

  it('lança quando o numérico pedido não existe no zip', async () => {
    const zip = await apkgComMedia({ media: '{}' })
    await expect(extrairArquivoDeMidia(zip, '99', 'collection.anki21')).rejects.toThrow(/não existe/i)
  })
})

describe('extrairArquivoDeMidia — teto de tamanho (conteúdo de terceiros é hostil)', () => {
  it('recusa arquivo (não-zstd) maior que TETO_DE_MIDIA_POR_ARQUIVO', async () => {
    const grande = Buffer.alloc(TETO_DE_MIDIA_POR_ARQUIVO + 1024, 1)
    const zip = await apkgComMedia({ media: '{}', arquivos: { '0': grande } })
    await expect(extrairArquivoDeMidia(zip, '0', 'collection.anki21')).rejects.toThrow(/teto/i)
  })

  it('recusa quando um orçamento acumulado menor é informado, mesmo dentro do teto padrão', async () => {
    const medio = Buffer.alloc(1024, 1)
    const zip = await apkgComMedia({ media: '{}', arquivos: { '0': medio } })
    await expect(extrairArquivoDeMidia(zip, '0', 'collection.anki21', 512)).rejects.toThrow(/teto/i)
  })

  it('recusa uma saída zstd (Latest) que estouraria o teto, mesmo comprimida pequena', async () => {
    // Zero repetido comprime pra quase nada: prova que o teto vale sobre o DESCOMPACTADO, não
    // sobre o tamanho do payload zstd em si (mesmo raciocínio do F4-01 para o zip externo).
    const enorme = Buffer.alloc(TETO_DE_MIDIA_POR_ARQUIVO * 2, 0)
    const comprimido = zstdCompressSync(enorme)
    expect(comprimido.length).toBeLessThan(enorme.length / 1000)

    const zip = await apkgComMedia({ media: '{}', arquivos: { '0': comprimido } })
    await expect(extrairArquivoDeMidia(zip, '0', 'collection.anki21b')).rejects.toThrow()
  })
})

describe('indiceInversoDeMidia', () => {
  it('inverte nome-real -> numérico', () => {
    const mapa = new Map([
      ['0', { nome: 'palavra.mp3' }],
      ['1', { nome: 'foto.jpg' }],
    ])
    const inverso = indiceInversoDeMidia(mapa)
    expect(inverso.get('palavra.mp3')).toBe('0')
    expect(inverso.get('foto.jpg')).toBe('1')
    expect(inverso.size).toBe(2)
  })

  it('em nome duplicado entre numéricos, o último vence (documentado, não escondido)', () => {
    const mapa = new Map([
      ['0', { nome: 'igual.mp3' }],
      ['5', { nome: 'igual.mp3' }],
    ])
    const inverso = indiceInversoDeMidia(mapa)
    expect(inverso.get('igual.mp3')).toBe('5')
  })
})
