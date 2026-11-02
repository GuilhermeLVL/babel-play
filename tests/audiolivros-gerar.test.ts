import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { frasesDoCapituloEpub } from '../scripts/audiolivros/capitulos.mjs'
import { gerarCapitulo, gerarLivro } from '../scripts/audiolivros/gerar-livro.mjs'
import { criarSintetizadorFalso } from '../scripts/audiolivros/sintetizador.mjs'
import { duracaoDoWav } from '../scripts/audiolivros/wav.mjs'
import { validarManifesto } from '../src/core/leitura/audiolivro'
import { frasesDoTexto } from '../src/core/leitura/narracao'
import { prepararTextoParaVoz } from '../src/core/leitura/prepararTextoParaVoz'

const PAUSAS = { frase: 0.2, paragrafo: 0.4 }
const POR_CARACTERE = 0.06

/** Um sintetizador falso que registra o texto recebido e falha nas primeiras `falhasPorTexto[texto]` vezes. */
function espiao(falhasPorTexto: Record<string, number> = {}, limiteDeCaracteres?: number) {
  const base = criarSintetizadorFalso({ duracaoPorCaractereS: POR_CARACTERE, limiteDeCaracteres })
  const recebidos: string[] = []
  const restantes = { ...falhasPorTexto }
  const sintetizar = vi.fn(async (texto: string, o: { voz: string; idioma: string }) => {
    recebidos.push(texto)
    if ((restantes[texto] ?? 0) > 0) {
      restantes[texto]--
      throw new Error('motor caiu')
    }
    return base.sintetizar(texto, o)
  })
  return { sintetizador: { ...base, sintetizar }, recebidos, sintetizar }
}

/** Codificador de mentira (sem ffmpeg): os bytes do WAV e o SHA-256 deles. */
const codificarFalso = async (wav: Uint8Array) => ({
  bytes: wav,
  sha256: createHash('sha256').update(wav).digest('hex'),
})

const frases = [
  { texto: 'Uma noite destas.', fimDeParagrafo: false },
  { texto: 'Vindo da cidade.', fimDeParagrafo: true },
  { texto: 'Em 1889 encontrei um rapaz.', fimDeParagrafo: true },
]

describe('gerarCapitulo', () => {
  it('tempos na ordem, batendo com as durações e as pausas; o WAV tem a duração do último t1', async () => {
    const { sintetizador } = espiao()
    const r = await gerarCapitulo({ frases, idioma: 'pt', voz: 'falsa', sintetizador, opcoes: {}, pausas: PAUSAS })
    expect(r.falhas).toEqual([])
    const d = frases.map((f) => prepararTextoParaVoz(f.texto, 'pt').length * POR_CARACTERE)
    expect(r.tempos.map((t) => t.i)).toEqual([0, 1, 2])
    expect(r.tempos[0].t0).toBe(0)
    expect(r.tempos[0].t1).toBeCloseTo(d[0], 3)
    expect(r.tempos[1].t0).toBeCloseTo(d[0] + PAUSAS.frase, 3)
    expect(r.tempos[2].t0).toBeCloseTo(d[0] + PAUSAS.frase + d[1] + PAUSAS.paragrafo, 3)
    expect(duracaoDoWav(r.wavs)).toBeCloseTo(r.tempos[2].t1, 2)
  })

  it('cada frase passa por prepararTextoParaVoz antes do motor', async () => {
    const { sintetizador, recebidos } = espiao()
    await gerarCapitulo({ frases, idioma: 'pt', voz: 'falsa', sintetizador, opcoes: {}, pausas: PAUSAS })
    expect(recebidos[2]).toBe('Em mil oitocentos e oitenta e nove encontrei um rapaz.')
    expect(recebidos).toEqual(frases.map((f) => prepararTextoParaVoz(f.texto, 'pt')))
  })

  it('o motor que falha 2 vezes e acerta na 3ª: capítulo ok', async () => {
    const { sintetizador, sintetizar } = espiao({ 'Vindo da cidade.': 2 })
    const r = await gerarCapitulo({ frases, idioma: 'pt', voz: 'falsa', sintetizador, opcoes: {}, pausas: PAUSAS })
    expect(r.falhas).toEqual([])
    expect(r.tempos).toHaveLength(3)
    expect(sintetizar).toHaveBeenCalledTimes(5)
  })

  it('falha 3 vezes: a frase entra em falhas', async () => {
    const { sintetizador } = espiao({ 'Vindo da cidade.': 3 })
    const r = await gerarCapitulo({ frases, idioma: 'pt', voz: 'falsa', sintetizador, opcoes: {}, pausas: PAUSAS })
    expect(r.falhas).toEqual([1])
  })

  it('frase de 900 caracteres: o corte é o de frasesDoTexto (índice igual ao do app) e o adaptador sub-divide', async () => {
    const longa = Array.from({ length: 90 }, (_, k) => `palavra${k % 10}`).join(' ') + ' fim.'
    expect(longa.length).toBeGreaterThanOrEqual(800)
    const doCapitulo = frasesDoCapituloEpub(`<html><body><p>${longa}</p><p>Outra.</p></body></html>`, 'pt')
    const doApp = frasesDoTexto(`${longa}\nOutra.`, 'pt').map((f) => f.texto)
    expect(doCapitulo.map((f) => f.texto)).toEqual(doApp)
    expect(doCapitulo.length).toBeGreaterThanOrEqual(3)
    const { sintetizador, sintetizar } = espiao({}, 100)
    const r = await gerarCapitulo({
      frases: doCapitulo,
      idioma: 'pt',
      voz: 'falsa',
      sintetizador,
      opcoes: {},
      pausas: PAUSAS,
    })
    expect(r.tempos).toHaveLength(doCapitulo.length)
    expect(sintetizar.mock.calls.length).toBeGreaterThan(doCapitulo.length)
  })
})

describe('gerarLivro', () => {
  const base = (saida: string, sintetizador: ReturnType<typeof espiao>['sintetizador']) => ({
    livroId: 'pg-teste',
    idioma: 'pt',
    voz: 'falsa',
    sintetizador,
    opcoes: {},
    pausas: PAUSAS,
    kbps: 32,
    saida,
    licencaDoTexto: 'dominio-publico',
    classificacao: 'livre',
    codificar: codificarFalso,
  })

  it('escreve opus, tempos e o manifesto, que passa validarManifesto; capítulo vazio sem arquivo', async () => {
    const saida = mkdtempSync(join(tmpdir(), 'gerar-livro-'))
    const { sintetizador } = espiao()
    const r = await gerarLivro({
      ...base(saida, sintetizador),
      capitulos: [
        { nn: 1, frases },
        { nn: 2, frases: [] },
      ],
    })
    expect(r.publicado).toBe(true)
    const pasta = join(saida, 'audiolivros/pg-teste/falsa')
    const manifesto = JSON.parse(readFileSync(join(pasta, 'manifesto.json'), 'utf8'))
    const v = validarManifesto(manifesto, 'pg-teste')
    expect(v.ok).toBe(true)
    expect(manifesto.rotulo).toBe('voz sintetizada')
    expect(manifesto.motor).toBe('falso')
    expect(manifesto.versaoDoMotor).toBe('0')
    expect(manifesto.versaoDoPreprocessador).toBe('1')
    expect(manifesto.formato).toEqual({ codec: 'opus', kbps: 32, canais: 1 })
    expect(manifesto.capitulos[1]).toMatchObject({ nn: 2, frases: 0, bytes: 0, duracaoS: 0 })
    expect(readdirSync(join(pasta, '1')).sort()).toEqual(['01.json', '01.opus'])
    const tempos = JSON.parse(readFileSync(join(pasta, '1/01.json'), 'utf8'))
    expect(tempos).toHaveLength(3)
    expect(manifesto.capitulos[0].bytes).toBe(readFileSync(join(pasta, '1/01.opus')).length)
  })

  it('regerar grava a versão seguinte', async () => {
    const saida = mkdtempSync(join(tmpdir(), 'gerar-livro-'))
    const { sintetizador } = espiao()
    await gerarLivro({ ...base(saida, sintetizador), capitulos: [{ nn: 1, frases }] })
    const r = await gerarLivro({ ...base(saida, sintetizador), capitulos: [{ nn: 1, frases }] })
    expect(r.versao).toBe(2)
    expect(existsSync(join(saida, 'audiolivros/pg-teste/falsa/2/01.opus'))).toBe(true)
    /* O ponteiro `atual.json` (ruling da demo): o cliente lê dele qual pasta de versão buscar. */
    expect(JSON.parse(readFileSync(join(saida, 'audiolivros/pg-teste/falsa/atual.json'), 'utf8'))).toEqual({
      versao: 2,
    })
  })

  it('atual.json é o ÚLTIMO arquivo gravado (depois do manifesto)', async () => {
    const saida = mkdtempSync(join(tmpdir(), 'gerar-livro-'))
    const { sintetizador } = espiao()
    const ordem: string[] = []
    await gerarLivro({
      ...base(saida, sintetizador),
      capitulos: [{ nn: 1, frases }],
      aoGravar: (arquivo: string) => ordem.push(arquivo.split('/').slice(-2).join('/')),
    })
    expect(ordem.at(-1)).toBe('falsa/atual.json')
    expect(ordem.at(-2)).toBe('falsa/manifesto.json')
    expect(JSON.parse(readFileSync(join(saida, 'audiolivros/pg-teste/falsa/atual.json'), 'utf8'))).toEqual({
      versao: 1,
    })
  })

  it('frase que falha 3 vezes: nada é escrito', async () => {
    const saida = mkdtempSync(join(tmpdir(), 'gerar-livro-'))
    const { sintetizador } = espiao({ 'Vindo da cidade.': 3 })
    const r = await gerarLivro({ ...base(saida, sintetizador), capitulos: [{ nn: 1, frases }] })
    expect(r.publicado).toBe(false)
    expect(r.falhas).toEqual([{ nn: 1, i: 1 }])
    expect(readdirSync(saida)).toEqual([])
  })
})
