/**
 * O CAMPO `audio` DO CATÁLOGO (F2): quais livros têm áudio pré-gerado publicado (`scripts/audiolivros/publicados.json`,
 * escrito em `public/catalogo/livros.json` por `montar-catalogo.mjs`), e a porta única `temAudioVisivel`: flag ligada
 * + áudio + o livro visível para quem lê (`visivelPara`). Menor, livro a revisar ou flag desligada: sem áudio.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { anexarAudio, entradaDoManifesto } from '../scripts/audiolivros/publicar-catalogo.mjs'
import { audioValido, temAudioVisivel } from '../src/core/livros/catalogo'

const AUDIO = { voz: 'F1', versao: 1, capitulos: 1, horas: 0.04 }

describe('temAudioVisivel', () => {
  const livro = { audio: AUDIO, classificacao: '12' }
  it('false com a flag desligada', () => {
    expect(temAudioVisivel(livro, '18', false)).toBe(false)
  })
  it('false sem audio (ou audio malformado)', () => {
    expect(temAudioVisivel({ classificacao: '12' }, '18', true)).toBe(false)
    expect(temAudioVisivel({ classificacao: '12', audio: { voz: '', versao: 1 } }, '18', true)).toBe(false)
    expect(temAudioVisivel({ classificacao: '12', audio: 'sim' }, '18', true)).toBe(false)
  })
  it('false se o livro não é visível (menor, livro a revisar) mesmo com audio', () => {
    expect(temAudioVisivel(livro, 'livre', true)).toBe(false)
    expect(temAudioVisivel({ audio: AUDIO, classificacao: null }, '16', true)).toBe(false)
    expect(temAudioVisivel(livro, 'xx' as never, true)).toBe(false)
  })
  it('true só com as três condições', () => {
    expect(temAudioVisivel(livro, '18', true)).toBe(true)
    expect(temAudioVisivel(livro, '12', true)).toBe(true)
  })
})

describe('audioValido', () => {
  it('aceita a forma publicada e recusa o resto', () => {
    expect(audioValido(AUDIO)).toEqual(AUDIO)
    for (const ruim of [null, {}, { ...AUDIO, versao: 0 }, { ...AUDIO, capitulos: -1 }, { ...AUDIO, voz: '../x' }])
      expect(audioValido(ruim)).toBeNull()
  })
})

describe('anexarAudio (montar-catalogo)', () => {
  it('escreve audio só nos livros de publicados.json e não toca os outros', () => {
    const livros = [
      { id: 'a', titulo: 'A' },
      { id: 'b', titulo: 'B', audio: { voz: 'velha', versao: 9, capitulos: 9, horas: 9 } },
      { id: 'c', titulo: 'C' },
    ]
    const n = anexarAudio(livros, { livros: { a: AUDIO } })
    expect(n).toBe(1)
    expect(livros[0]).toEqual({ id: 'a', titulo: 'A', audio: AUDIO })
    expect(livros[1]).toEqual({ id: 'b', titulo: 'B' }) // saiu de publicados: o campo some
    expect(livros[2]).toEqual({ id: 'c', titulo: 'C' })
  })
  it('recusa id publicado que não está no catálogo e entrada malformada', () => {
    expect(() => anexarAudio([{ id: 'a' }], { livros: { z: AUDIO } })).toThrow(/z/)
    expect(() => anexarAudio([{ id: 'a' }], { livros: { a: { voz: 'F1' } } })).toThrow(/a/)
  })
  it('entradaDoManifesto conta capítulos com áudio e soma as horas', () => {
    const m = {
      voz: 'F1',
      capitulos: [
        { nn: 1, duracaoS: 3600, frases: 10 },
        { nn: 2, duracaoS: 0, frases: 0 },
        { nn: 3, duracaoS: 1800, frases: 5 },
      ],
    }
    expect(entradaDoManifesto(m, 2)).toEqual({ voz: 'F1', versao: 2, capitulos: 2, horas: 1.5 })
  })
})

describe('os arquivos versionados', () => {
  const catalogo = JSON.parse(readFileSync('public/catalogo/livros.json', 'utf8'))
  const porId = new Map(catalogo.livros.map((l: { id: string }) => [l.id, l]))
  const publicados = JSON.parse(readFileSync('scripts/audiolivros/publicados.json', 'utf8'))
  const piloto = JSON.parse(readFileSync('scripts/audiolivros/piloto.json', 'utf8'))

  it('nenhum id do piloto tem classificação não aprovada', () => {
    expect(piloto.livros).toHaveLength(10)
    for (const id of piloto.livros) {
      const l = porId.get(id) as { classificacao: unknown } | undefined
      expect(l, id).toBeTruthy()
      expect(l!.classificacao, id).not.toBeNull()
    }
  })
  it('livros.json traz o audio de publicados.json, e só nesses livros', () => {
    const comAudio = catalogo.livros.filter((l: { audio?: unknown }) => l.audio).map((l: { id: string }) => l.id)
    expect(comAudio.sort()).toEqual(Object.keys(publicados.livros).sort())
    for (const [id, a] of Object.entries(publicados.livros))
      expect((porId.get(id) as { audio: unknown }).audio).toEqual(a)
    expect(publicados.livros['ws-pt-dom-casmurro']).toMatchObject({ voz: 'F1', versao: 1, capitulos: 1 })
  })
})
