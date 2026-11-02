import { describe, expect, it } from 'vitest'

import {
  emocaoEfetiva,
  EMOCOES_DO_AVATAR,
  estadoDoAvatar,
  ESTADOS_DO_AVATAR,
  transicaoValida,
} from '../src/core/avatar/estados'
import { origemPermitida, politicaDeAvatar, protegidoPelaFaixa } from '../src/core/avatar/politicaDeMenor'
import { escolherTier, limitarTier, ORCAMENTOS, TIER_DO_PIP } from '../src/core/avatar/tiers'

describe('tiers: orçamento', () => {
  it('o fraco é o piso combinado: 20k triângulos, 1 material, textura até 1024', () => {
    expect(ORCAMENTOS.fraco).toMatchObject({ triangulos: 20_000, materiais: 1, texturaMax: 1024, molas: false })
  })
  it('o desktop vai até 70k e o orçamento cresce de fraco a forte', () => {
    expect(ORCAMENTOS.forte.triangulos).toBe(70_000)
    expect(ORCAMENTOS.fraco.triangulos).toBeLessThan(ORCAMENTOS.medio.triangulos)
    expect(ORCAMENTOS.medio.triangulos).toBeLessThanOrEqual(ORCAMENTOS.forte.triangulos)
    expect(ORCAMENTOS.fraco.pixelRatioMax).toBeLessThanOrEqual(ORCAMENTOS.forte.pixelRatioMax)
  })
  it('o PiP usa o tier fraco', () => expect(TIER_DO_PIP).toBe('fraco'))
  it('limitarTier nunca passa do teto', () => {
    expect(limitarTier('forte', 'fraco')).toBe('fraco')
    expect(limitarTier('fraco', 'forte')).toBe('fraco')
    expect(limitarTier('medio', 'medio')).toBe('medio')
  })
})

describe('tiers: escolherTier', () => {
  it('máquina boa: forte', () => {
    expect(escolherTier({ memoriaGb: 8, nucleos: 12, gpu: 'alta' })).toBe('forte')
    expect(escolherTier({ memoriaGb: 8, nucleos: 8 })).toBe('forte')
  })
  it('Safari (sem deviceMemory) nunca chega a forte', () => {
    expect(escolherTier({ nucleos: 10, gpu: 'alta' })).toBe('medio')
    expect(escolherTier({})).toBe('medio')
  })
  it('celular modesto: fraco', () => {
    expect(escolherTier({ memoriaGb: 2, nucleos: 8 })).toBe('fraco')
    expect(escolherTier({ memoriaGb: 4, nucleos: 2 })).toBe('fraco')
    expect(escolherTier({ memoriaGb: 4, nucleos: 3 })).toBe('fraco')
    expect(escolherTier({ memoriaGb: 8, nucleos: 8, gpu: 'baixa' })).toBe('fraco')
  })
  it('economia de dados força o fraco', () => {
    expect(escolherTier({ memoriaGb: 8, nucleos: 12, saveData: true })).toBe('fraco')
  })
  it('movimento reduzido limita o forte a médio mas não rebaixa o resto', () => {
    expect(escolherTier({ memoriaGb: 8, nucleos: 12, movimentoReduzido: true })).toBe('medio')
    expect(escolherTier({ memoriaGb: 2, movimentoReduzido: true })).toBe('fraco')
  })
  it('valores hostis contam como desconhecidos', () => {
    expect(escolherTier({ memoriaGb: NaN, nucleos: Infinity })).toBe('medio')
    expect(escolherTier({ memoriaGb: -1, nucleos: 0 })).toBe('medio')
    expect(escolherTier({ memoriaGb: '8' as never, nucleos: '12' as never })).toBe('medio')
    expect(escolherTier(undefined)).toBe('medio')
  })
})

describe('estados do avatar', () => {
  it('cobre os quatro estados e as seis emoções', () => {
    expect(ESTADOS_DO_AVATAR).toEqual(['parado', 'ouvindo', 'pensando', 'falando'])
    expect(EMOCOES_DO_AVATAR).toEqual(['neutro', 'feliz', 'triste', 'bravo', 'surpreso', 'relaxado'])
  })
  it('o ciclo normal: ouvir, pensar, falar, calar', () => {
    let e = estadoDoAvatar('parado', 'ouvir')
    expect(e).toBe('ouvindo')
    e = estadoDoAvatar(e, 'pensar')
    expect(e).toBe('pensando')
    e = estadoDoAvatar(e, 'falar')
    expect(e).toBe('falando')
    expect(estadoDoAvatar(e, 'calar')).toBe('parado')
  })
  it('a pessoa interrompe quem fala ou pensa', () => {
    expect(estadoDoAvatar('falando', 'ouvir')).toBe('ouvindo')
    expect(estadoDoAvatar('pensando', 'ouvir')).toBe('ouvindo')
  })
  it('transição inválida não muda o estado e não lança', () => {
    expect(transicaoValida('falando', 'pensar')).toBe(false)
    expect(estadoDoAvatar('falando', 'pensar')).toBe('falando')
    expect(estadoDoAvatar('parado', 'calar')).toBe('parado')
    expect(estadoDoAvatar('parado', 'voar' as never)).toBe('parado')
    expect(estadoDoAvatar('quebrado' as never, 'falar')).toBe('parado')
  })
  it('toda combinação estado x evento devolve um estado conhecido', () => {
    for (const s of ESTADOS_DO_AVATAR)
      for (const ev of ['ouvir', 'pensar', 'falar', 'calar'] as const)
        expect(ESTADOS_DO_AVATAR).toContain(estadoDoAvatar(s, ev))
  })
  it('a emoção só vale falando ou pensando; desconhecida vira neutro', () => {
    expect(emocaoEfetiva('falando', 'feliz')).toBe('feliz')
    expect(emocaoEfetiva('pensando', 'triste')).toBe('triste')
    expect(emocaoEfetiva('parado', 'bravo')).toBe('neutro')
    expect(emocaoEfetiva('parado', 'relaxado')).toBe('relaxado')
    for (const x of [undefined, null, 'raiva', 7, {}, '__proto__']) expect(emocaoEfetiva('falando', x)).toBe('neutro')
  })
})

describe('política de menor', () => {
  it('perfil protegido: só coleção curada, sem importar, sem galeria, sem compra', () => {
    const p = politicaDeAvatar(true)
    expect(p).toMatchObject({
      podeImportar: false,
      podeVerGaleriaDeTerceiros: false,
      podeComprarComDinheiro: false,
      enviaDadosAoServidor: false,
    })
    expect(p.origensPermitidas).toEqual(['familia', 'colecao'])
    expect(origemPermitida(true, 'importado')).toBe(false)
    expect(origemPermitida(true, 'colecao')).toBe(true)
  })
  it('adulto importa, mas nenhum dado de avatar sai do aparelho', () => {
    const p = politicaDeAvatar(false)
    expect(p.podeImportar).toBe(true)
    expect(p.enviaDadosAoServidor).toBe(false)
    expect(origemPermitida(false, 'importado')).toBe(true)
  })
  it('o rótulo de demonstração vale para todos', () => {
    expect(politicaDeAvatar(true).rotuloDeDemonstracaoObrigatorio).toBe(true)
    expect(politicaDeAvatar(false).rotuloDeDemonstracaoObrigatorio).toBe(true)
  })
  it('valor que não é exatamente false é protegido (falha fechada)', () => {
    for (const x of [undefined, null, 0, '', 'false']) expect(politicaDeAvatar(x as never).podeImportar).toBe(false)
  })
  it('origem desconhecida nunca é permitida', () => {
    for (const x of [undefined, '__proto__', 'Importado', 3]) expect(origemPermitida(false, x)).toBe(false)
  })
  it('a faixa segue o servidor: só adulto declarado é desprotegido', () => {
    expect(protegidoPelaFaixa('adulto')).toBe(false)
    for (const f of ['menor-12', '12-15', '16-17', null, undefined, 'x']) expect(protegidoPelaFaixa(f)).toBe(true)
  })
})
