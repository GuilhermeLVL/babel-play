/**
 * A CÓPIA CURADA DO GUTENBERG (critério 3 da spec de Livros & Leitura): nenhum EPUB curado contém o cabeçalho,
 * o rodapé ou a licença do Project Gutenberg; a única menção permitida é a linha de crédito, e todos a têm.
 *
 * O teste monta uma cópia a partir de um texto com a moldura real do Gutenberg (cabeçalho, rodapé, licença,
 * créditos de voluntários) e confere o EPUB que sai. E, se `data/livros-curados/` existir (o script
 * `scripts/livros/curar-gutenberg.mjs` já rodou nesta máquina), varre TODOS os EPUBs que estão lá.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { lerEpubComoTexto } from '../src/core/livros/epub'
import {
  arquivosDoEpub,
  conferirEpubCurado,
  contemMarcaDoGutenberg,
  dividirEmCapitulos,
  limparTextoDoGutenberg,
  LINHA_DE_CREDITO,
} from '../src/core/livros/gutenberg'

const COM_MOLDURA = `\uFEFFThe Project Gutenberg eBook of Pride and Prejudice

This ebook is for the use of anyone anywhere in the United States and
most other parts of the world at no cost and with almost no restrictions
whatsoever. You may copy it, give it away or re-use it under the terms
of the Project Gutenberg License included with this ebook or online
at www.gutenberg.org.

Title: Pride and Prejudice
Author: Jane Austen
Release date: June 1, 1998 [eBook #1342]

*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***

Produced by Anonymous Volunteers, and David Widger

PRIDE AND PREJUDICE

By Jane Austen

CHAPTER I

It is a truth universally acknowledged, that a single man in possession
of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his
first entering a neighbourhood, this truth is so well fixed in the minds
of the surrounding families.

CHAPTER II

Mr. Bennet was among the earliest of those who waited on Mr. Bingley.

[Transcriber's note: this Project Gutenberg edition fixes two typos.]

*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***

Updated editions will replace the previous one—the old editions will
be renamed.

START: FULL LICENSE

THE FULL PROJECT GUTENBERG LICENSE
PLEASE READ THIS BEFORE YOU DISTRIBUTE OR USE THIS WORK

To protect the Project Gutenberg-tm mission of promoting the free
distribution of electronic works, by using or distributing this work
(or any other work associated in any way with the phrase "Project
Gutenberg"), you agree to comply with all the terms of the Full
Project Gutenberg-tm License available with this file or online at
www.gutenberg.org/license.

Section 3. Information about the Project Gutenberg Literary Archive Foundation
`

function epubCurado(bruto: string) {
  const { texto } = limparTextoDoGutenberg(bruto)
  const arquivos = arquivosDoEpub({
    id: 'pg-1342',
    titulo: 'Pride and Prejudice',
    autores: ['Jane Austen'],
    idioma: 'en',
    capitulos: dividirEmCapitulos(texto, 'Part'),
    licenca: 'Domínio público no Brasil (Lei 9.610, art. 41): Jane Austen †1817.',
    modificadoEm: '2026-10-26T12:00:00.000Z',
  })
  const zip = zipSync(
    Object.fromEntries(arquivos.map(([c, t]) => [c, [strToU8(t), { level: c === 'mimetype' ? 0 : 6 }]])),
  ) as Uint8Array
  return Object.fromEntries(Object.entries(unzipSync(zip)).map(([k, v]) => [k, strFromU8(v)]))
}

describe('limpar a moldura do Gutenberg', () => {
  it('fica só o texto da obra, entre os marcadores, sem nota que cite o projeto', () => {
    const { texto, linhasRemovidas } = limparTextoDoGutenberg(COM_MOLDURA)
    expect(texto).toMatch(/^PRIDE AND PREJUDICE/)
    expect(texto).toContain('It is a truth universally acknowledged')
    expect(texto).toContain('Mr. Bennet was among the earliest')
    expect(texto).not.toMatch(/gutenberg/i)
    expect(texto).not.toMatch(/Produced by/)
    expect(texto).not.toMatch(/FULL LICENSE/)
    expect(linhasRemovidas).toBeGreaterThan(0)
    expect(contemMarcaDoGutenberg(texto)).toBe(false)
  })

  it('texto sem o marcador de início é recusado (a licença pode estar espalhada)', () => {
    expect(() => limparTextoDoGutenberg('Um texto qualquer\nsem moldura nenhuma')).toThrow(/marcador de início/)
  })

  it('a única menção permitida é a linha de crédito', () => {
    expect(contemMarcaDoGutenberg(`<p>${LINHA_DE_CREDITO}</p>`)).toBe(false)
    expect(contemMarcaDoGutenberg('<p>Project Gutenberg-tm</p>')).toBe(true)
    expect(contemMarcaDoGutenberg('see www.gutenberg.org/license')).toBe(true)
    expect(contemMarcaDoGutenberg('Johannes Gutenberg inventou a prensa.')).toBe(false)
  })
})

describe('o EPUB curado', () => {
  const arquivos = epubCurado(COM_MOLDURA)

  it('passa na conferência e tem a página de crédito', () => {
    expect(conferirEpubCurado(arquivos)).toEqual([])
    expect(arquivos['OEBPS/creditos.xhtml']).toContain(LINHA_DE_CREDITO)
    expect(arquivos.mimetype).toBe('application/epub+zip')
  })

  it('a conferência reprova o EPUB com a moldura ou sem o crédito', () => {
    expect(conferirEpubCurado({ ...arquivos, 'OEBPS/x.xhtml': '<p>Project Gutenberg License</p>' })).toHaveLength(1)
    const semCredito = { ...arquivos, 'OEBPS/creditos.xhtml': '<p>Créditos</p>' }
    expect(conferirEpubCurado(semCredito)).toContain('sem a linha de crédito')
  })

  it('abre de novo como texto, com os capítulos na ordem e o crédito primeiro', () => {
    const epub = lerEpubComoTexto(arquivos)
    expect(epub.metadados.titulo).toBe('Pride and Prejudice')
    expect(epub.metadados.idioma).toBe('en')
    /* O crédito, a abertura sem título (o nome e o autor que o texto traz no topo) e os capítulos. */
    expect(epub.capitulos.map((c) => c.titulo)).toEqual(['Pride and Prejudice', '', 'CHAPTER I', 'CHAPTER II'])
    expect(epub.capitulos[2].texto).toContain('It is a truth universally acknowledged')
  })
})

describe('dividir em capítulos', () => {
  it('sem títulos, divide em partes de ~5000 palavras', () => {
    const paragrafo = Array.from({ length: 500 }, () => 'palavra').join(' ')
    const texto = Array.from({ length: 25 }, () => paragrafo).join('\n\n')
    const partes = dividirEmCapitulos(texto, 'Parte')
    expect(partes.map((p) => p.titulo)).toEqual(['Parte 1', 'Parte 2', 'Parte 3'])
  })
})

const PASTA = 'data/livros-curados'
describe.runIf(existsSync(PASTA))('os EPUBs curados desta máquina (data/livros-curados)', () => {
  const epubs = existsSync(PASTA) ? readdirSync(PASTA).filter((f) => f.endsWith('.epub')) : []
  it('há o que conferir', () => expect(epubs.length).toBeGreaterThan(0))
  it.each(epubs)('%s não cita o Project Gutenberg fora do crédito, e tem o crédito', (f) => {
    const z = unzipSync(new Uint8Array(readFileSync(join(PASTA, f))), {
      filter: (e) => /\.(x?html?|opf|xml|ncx)$/i.test(e.name),
    })
    const textos = Object.fromEntries(Object.entries(z).map(([k, v]) => [k, strFromU8(v)]))
    expect(conferirEpubCurado(textos)).toEqual([])
  })
})
