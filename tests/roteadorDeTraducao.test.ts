/**
 * ROTEADOR DE TRADUÇÃO (`routeMt`) — a escada M0–M5 do `harness-adaptativo.md` §1.2, pura.
 *
 * O achado nº 1 da auditoria de eficiência (2026-09-28): o PARCIAL da fala ia ao LLM pago a cada
 * ~1,1 s, porque o ramo `falada/nuvemPrimeiro` do gateway ignorava `parcial`. A regra que estes
 * testes prendem acima de todas: parcial NUNCA inclui nuvem nem terceiro. As outras: grátis sem cota
 * de convidado nunca vai à nuvem; sem consentimento nada sai do aparelho; a ordem é do mais barato
 * ao mais caro; e cada degrau descartado diz POR QUÊ (telemetria).
 */
import { describe, expect, it } from 'vitest'

import { type EntradaDaRotaMt, routeMt } from '../src/core/harness/roteadorDeTraducao'

const tudo = { tradutorNativo: true, opusMt: true, bergamot: true, nuvem: true, terceiro: true }

const base = (extra: Partial<EntradaDaRotaMt> = {}): EntradaDaRotaMt => ({
  texto: 'I would like a cup of coffee',
  ehToqueEmPalavra: false,
  parcial: false,
  pago: true,
  consentimento: true,
  disponibilidade: tudo,
  origem: 'en',
  destino: 'pt',
  falada: false,
  ...extra,
})

const degraus = (e: EntradaDaRotaMt) => routeMt(e).degraus.map((d) => d.degrau)

describe('routeMt — ordem da escada', () => {
  it('pago, texto final, tudo disponível: memória → nativo → local → nuvem → terceiro', () => {
    expect(degraus(base())).toEqual(['memoria', 'nativo', 'local', 'nuvem', 'terceiro'])
  })

  /* Bancada Etapa 5 (`docs/auditoria/eval/bancada-2026-09-etapa5.md`): o Bergamot ganha no pt→en
     (COMET +0,028, IC exclui 0, ~10× mais rápido) e fica FORA do en→pt (português europeu; o gold de
     conversa piora). A decisão vale mesmo que o chamador diga que o Bergamot "cobre" o par. */
  it('pt→en: o Bergamot vem ANTES do opus-mt (venceu na bancada)', () => {
    const r = routeMt(base({ texto: 'Eu gostaria de um café', origem: 'pt', destino: 'en' }))
    const locais = r.degraus.filter((d) => d.degrau === 'local')
    expect(locais.map((d) => d.motor)).toEqual(['bergamot-local', 'opus-mt-local'])
  })

  it('pt-BR→en-US também (a decisão é pelo idioma base)', () => {
    const r = routeMt(base({ texto: 'Eu gostaria de um café', origem: 'pt-BR', destino: 'en-US' }))
    expect(r.degraus.filter((d) => d.degrau === 'local').map((d) => d.motor)[0]).toBe('bergamot-local')
  })

  it('en→pt NUNCA usa o Bergamot, mesmo com ele disponível (português europeu)', () => {
    const locais = routeMt(base()).degraus.filter((d) => d.degrau === 'local')
    expect(locais.map((d) => d.motor)).toEqual(['opus-mt-local'])
  })

  it('pt→en sem o Bergamot (sem modelo no build, falhou aqui): fica o opus-mt', () => {
    const r = routeMt(
      base({
        texto: 'Eu gostaria de um café',
        origem: 'pt',
        destino: 'en',
        disponibilidade: { ...tudo, bergamot: false },
      }),
    )
    expect(r.degraus.filter((d) => d.degrau === 'local').map((d) => d.motor)).toEqual(['opus-mt-local'])
  })

  it('pt→en só com o Bergamot (opus-mt fora): o local ainda existe', () => {
    const r = routeMt(
      base({
        texto: 'Eu gostaria de um café',
        origem: 'pt',
        destino: 'en',
        disponibilidade: { ...tudo, opusMt: false },
      }),
    )
    expect(r.degraus.filter((d) => d.degrau === 'local').map((d) => d.motor)).toEqual(['bergamot-local'])
  })

  it('cada degrau nomeia o motor do registro', () => {
    const r = routeMt(base())
    expect(r.degraus.find((d) => d.degrau === 'nativo')?.motor).toBe('chrome-translator')
    expect(r.degraus.find((d) => d.degrau === 'nuvem')?.motor).toBe('server-llm-mt')
    expect(r.degraus.find((d) => d.degrau === 'terceiro')?.motor).toBe('mymemory')
  })

  it('fala FINAL de quem paga: nuvem sobe para antes do nativo (o LLM traduz sentido, não palavra)', () => {
    expect(degraus(base({ falada: true }))).toEqual(['memoria', 'nuvem', 'nativo', 'local', 'terceiro'])
  })

  it('nuvemPrimeiro (legenda do sistema de quem paga) também sobe a nuvem', () => {
    expect(degraus(base({ nuvemPrimeiro: true }))[1]).toBe('nuvem')
  })

  it('sem nada disponível sobra só a memória (e o motivo de cada descarte)', () => {
    const r = routeMt(base({ disponibilidade: { tradutorNativo: false, opusMt: false, nuvem: false }, pago: false }))
    expect(r.degraus.map((d) => d.degrau)).toEqual(['memoria'])
    expect(r.descartados.map((d) => d.degrau)).toEqual(expect.arrayContaining(['nativo', 'local', 'nuvem', 'terceiro']))
  })
})

describe('routeMt — parcial nunca sai para a nuvem', () => {
  it('parcial de quem paga, falada, com tudo: nem nuvem nem terceiro', () => {
    const r = routeMt(base({ parcial: true, falada: true, nuvemPrimeiro: true }))
    const ds = r.degraus.map((d) => d.degrau)
    expect(ds).not.toContain('nuvem')
    expect(ds).not.toContain('terceiro')
    expect(r.descartados).toEqual(
      expect.arrayContaining([
        { degrau: 'nuvem', motivo: 'parcial' },
        { degrau: 'terceiro', motivo: 'parcial' },
      ]),
    )
  })

  it.each([true, false])('vale para qualquer plano (pago=%s) e com cota de convidado', (pago) => {
    const ds = degraus(base({ parcial: true, pago, cotaDeConvidado: true }))
    expect(ds).not.toContain('nuvem')
    expect(ds).not.toContain('terceiro')
  })
})

describe('routeMt — plano e consentimento', () => {
  it('grátis sem cota de convidado nunca vai à nuvem', () => {
    const r = routeMt(base({ pago: false }))
    expect(r.degraus.map((d) => d.degrau)).not.toContain('nuvem')
    expect(r.descartados).toContainEqual({ degrau: 'nuvem', motivo: 'plano' })
  })

  it('grátis COM cota de convidado pode ir à nuvem', () => {
    expect(degraus(base({ pago: false, cotaDeConvidado: true }))).toContain('nuvem')
  })

  it('grátis falado não ganha nuvem-primeiro (não há nuvem)', () => {
    expect(degraus(base({ pago: false, falada: true }))[1]).toBe('nativo')
  })

  it('sem consentimento, nada sai do aparelho (nem nuvem, nem terceiro)', () => {
    const r = routeMt(base({ consentimento: false }))
    expect(r.degraus.map((d) => d.degrau)).toEqual(['memoria', 'nativo', 'local'])
    expect(r.descartados).toEqual(
      expect.arrayContaining([
        { degrau: 'nuvem', motivo: 'consentimento' },
        { degrau: 'terceiro', motivo: 'consentimento' },
      ]),
    )
  })

  it('terceiro (MyMemory) não depende de plano, mas é o último recurso', () => {
    const ds = degraus(base({ pago: false }))
    expect(ds[ds.length - 1]).toBe('terceiro')
  })

  it('nuvem indisponível (servidor sem chave) é descartada com motivo próprio', () => {
    const r = routeMt(base({ disponibilidade: { ...tudo, nuvem: false } }))
    expect(r.descartados).toContainEqual({ degrau: 'nuvem', motivo: 'indisponivel' })
  })
})

describe('routeMt — degraus sem IA (M0–M2)', () => {
  const conhece = (lista: string[]) => (p: string) => lista.includes(p.toLowerCase())

  it('M0: todas as palavras conhecidas → só "pular", nenhum motor', () => {
    const r = routeMt(base({ texto: 'Thank you!', palavrasConhecidas: conhece(['thank', 'you']) }))
    expect(r.degraus).toEqual([{ degrau: 'pular', motivo: 'todas-conhecidas' }])
  })

  it('M0 não se aplica se falta UMA palavra', () => {
    const r = routeMt(base({ texto: 'Thank you, mate', palavrasConhecidas: conhece(['thank', 'you']) }))
    expect(r.degraus[0].degrau).toBe('memoria')
  })

  it('M0 não se aplica ao toque em palavra (o aluno pediu o significado)', () => {
    const r = routeMt(base({ texto: 'coffee', ehToqueEmPalavra: true, palavrasConhecidas: () => true }))
    expect(r.degraus[0].degrau).toBe('dicionario')
  })

  it('M1: toque numa palavra solta começa pelo dicionário', () => {
    expect(degraus(base({ texto: 'coffee', ehToqueEmPalavra: true }))).toEqual([
      'dicionario',
      'memoria',
      'nativo',
      'local',
      'nuvem',
      'terceiro',
    ])
  })

  it('toque em expressão de várias palavras não vai ao dicionário', () => {
    const r = routeMt(base({ texto: 'cup of coffee', ehToqueEmPalavra: true }))
    expect(r.degraus[0].degrau).toBe('memoria')
    expect(r.descartados).toContainEqual({ degrau: 'dicionario', motivo: 'nao-e-palavra-solta' })
  })

  it('dicionário e memória podem ser desligados pela disponibilidade', () => {
    const r = routeMt(
      base({
        texto: 'coffee',
        ehToqueEmPalavra: true,
        disponibilidade: { ...tudo, dicionario: false, memoria: false },
      }),
    )
    expect(r.degraus[0].degrau).toBe('nativo')
  })

  it('texto vazio → escada vazia', () => {
    const r = routeMt(base({ texto: '   ' }))
    expect(r.degraus).toEqual([])
    expect(r.descartados).toEqual([{ degrau: 'pular', motivo: 'texto-vazio' }])
  })

  it('origem igual ao destino → só "pular"', () => {
    expect(routeMt(base({ origem: 'pt-BR', destino: 'pt' })).degraus).toEqual([
      { degrau: 'pular', motivo: 'mesmo-idioma' },
    ])
  })
})
