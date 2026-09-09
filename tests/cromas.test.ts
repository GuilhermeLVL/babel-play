// @vitest-environment jsdom
/**
 * CROMAS (mudança inventario-e-cromas) — o que estes testes protegem:
 *
 * 1. **Croma é adição, nunca remoção.** Introduzir uma economia nova tirando algo que já era da
 *    pessoa seria a pior forma de fazer isto. Quem tem um estilo de paleta continua com as 30
 *    matizes que ele sempre deu.
 * 2. **Nem tudo se compra.** Duas posições de cada peça saem de conquista e do Passe Premium —
 *    é o que impede a coleção completa de ser só uma questão de moer Seeds.
 * 3. **Sem croma, nada muda.** É a garantia de que a economia velha continua funcionando.
 */
import { beforeEach,describe, expect, it } from 'vitest'

import { acessoAoEstilo } from '../src/lib/galeria/acesso'
import {
corDoCromaEquipado,   cromaEquipado,   cromasDaPeca, cromasPossuidos, equiparCroma, hidratarCromas,
idDoCroma, marcarCroma, PRECO_DO_CROMA,
temOCroma, } from '../src/lib/galeria/cromas'
import { todasAsPaletas } from '../src/lib/galeria/paletas'

beforeEach(() => {
  localStorage.removeItem('babel.cromas')
  localStorage.removeItem('babel.croma_equipado')
})

describe('as quatro vias de um croma', () => {
  it('a peça vem com uma cor inclusa, que nunca custa nada', () => {
    const cs = cromasDaPeca('part-estrelas', 'epico')
    expect(cs[0].via).toBe('incluso')
    expect(cs[0].preco).toBeUndefined()
    expect(temOCroma(cs[0])).toBe(true)
  })

  it('duas posições NÃO estão à venda — saem de conquista e do Premium', () => {
    const cs = cromasDaPeca('part-estrelas', 'epico')
    const vias = cs.map((c) => c.via)
    expect(vias).toContain('conquista')
    expect(vias).toContain('premium')
    for (const c of cs.filter((x) => x.via === 'conquista' || x.via === 'premium')) {
      expect(c.preco, 'croma fora da venda não pode ter preço').toBeUndefined()
      expect(temOCroma(c)).toBe(false)
    }
  })

  it('o preço escala com a raridade da PEÇA, e o teto fica bem abaixo de um item de catálogo', () => {
    expect(PRECO_DO_CROMA.comum).toBeLessThan(PRECO_DO_CROMA.raro)
    expect(PRECO_DO_CROMA.raro).toBeLessThan(PRECO_DO_CROMA.epico)
    expect(PRECO_DO_CROMA.epico).toBeLessThan(PRECO_DO_CROMA.lendario)
    // O lendário do catálogo custa 380-600; croma é onde a Seed sobrando vai, não uma barreira.
    expect(PRECO_DO_CROMA.lendario).toBeLessThan(100)
  })

  it('comprar move o croma de "à venda" para "meu"', () => {
    const antes = cromasDaPeca('part-estrelas', 'epico').find((c) => c.via === 'seeds')!
    marcarCroma(idDoCroma('part-estrelas', antes.matiz))
    const depois = cromasDaPeca('part-estrelas', 'epico').find((c) => c.matiz === antes.matiz)!
    expect(depois.via).toBe('meu')
    expect(temOCroma(depois)).toBe(true)
  })

  it('a posse é POR PEÇA: comprar o âmbar das partículas não dá o âmbar do rastro', () => {
    const alvo = cromasDaPeca('part-estrelas', 'epico').find((c) => c.via === 'seeds')!
    marcarCroma(idDoCroma('part-estrelas', alvo.matiz))
    const noRastro = cromasDaPeca('ras-faisca', 'raro').find((c) => c.matiz === alvo.matiz)!
    expect(noRastro.via).toBe('seeds')
  })
})

describe('croma NUNCA tira acesso que já existia', () => {
  it('as 200 paletas continuam existindo e o estilo continua liberando o estilo inteiro', () => {
    // Se a introdução dos cromas tivesse mexido no gate das paletas, este número mudaria.
    expect(todasAsPaletas().length).toBeGreaterThanOrEqual(200)
    // 'claro' é livre no nível 1 desde sempre — continua livre.
    expect(acessoAoEstilo('claro', 1, 0).liberado).toBe(true)
    // 'neon' exige nível 5 ou Seeds, como antes — o croma não criou um segundo pedágio.
    const neon = acessoAoEstilo('neon', 1, 0)
    expect(neon.liberado).toBe(false)
    expect(acessoAoEstilo('neon', 5, 0).liberado).toBe(true)
  })

  it('sem croma equipado, a cor é `null` — e aí vale o token do tema, como sempre valeu', () => {
    expect(cromaEquipado('part-estrelas')).toBeNull()
    expect(corDoCromaEquipado('part-estrelas')).toBeNull()
  })
})

describe('equipar croma', () => {
  it('trocar de croma é grátis e reversível; só desbloquear custa', () => {
    equiparCroma('part-estrelas', 'ambar')
    expect(cromaEquipado('part-estrelas')).toBe('ambar')
    expect(corDoCromaEquipado('part-estrelas')).toMatch(/^hsl\(/)
    equiparCroma('part-estrelas', null)
    expect(cromaEquipado('part-estrelas')).toBeNull()
  })

  it('matiz inexistente não vira cor inventada', () => {
    equiparCroma('part-estrelas', 'nao-existe')
    expect(corDoCromaEquipado('part-estrelas')).toBeNull()
  })
})

describe('hidratação do servidor', () => {
  /**
   * COM CONTA, O SERVIDOR SUBSTITUI (mudança servidor-e-autoridade).
   *
   * A união preservava a compra offline e, junto com ela, qualquer id injetado à mão no
   * localStorage — que nunca mais saía: recarregar não limpava, trocar de aparelho não limpava.
   * Fechar o gasto no servidor e deixar a posse local intocada seria trancar a porta da frente.
   */
  it('modo autoritativo apaga o que o servidor não conhece', () => {
    marcarCroma(idDoCroma('part-estrelas', 'forjado'))
    hidratarCromas([idDoCroma('ras-faisca', 'ambar')], true)
    const s = cromasPossuidos()
    expect(s.has(idDoCroma('ras-faisca', 'ambar'))).toBe(true)
    expect(s.has(idDoCroma('part-estrelas', 'forjado')), 'id forjado tem de sumir').toBe(false)
  })

  it('lista vazia do servidor com conta esvazia — quem não comprou nada não tem nada', () => {
    marcarCroma(idDoCroma('part-estrelas', 'forjado'))
    hidratarCromas([], true)
    expect(cromasPossuidos().size).toBe(0)
  })

  it('soma ao espelho local sem apagar a compra que ainda não sincronizou', () => {
    marcarCroma(idDoCroma('part-estrelas', 'offline'))
    hidratarCromas([idDoCroma('ras-faisca', 'ambar'), idDoCroma('tema-babel', 'roxo')])
    expect(cromasPossuidos().size).toBe(3)
    // Lista vazia ou ausente não zera nada.
    hidratarCromas([])
    hidratarCromas(undefined)
    expect(cromasPossuidos().size).toBe(3)
  })
})

describe('o croma APARECE — comprar cor e não ver nada mudar seria o controle falso que cobra', () => {
  it('o rastro resolve a cor do croma sem passar por uma paleta da galeria', async () => {
    const { estiloDeRastro, idDeRastroDeCroma } = await import('../src/lib/rastroDoMouse')
    const id = idDeRastroDeCroma('estrelas', 'ambar')
    const r = estiloDeRastro(id)
    expect(r, 'croma:<forma>:<matiz> precisa resolver').not.toBeNull()
    expect(r!.kind).toBe('rastroEstrelas')
    // A cor sai do MATIZ, não de uma paleta: comprar um croma de 25 Seeds não pode abrir de lado
    // um produto de 380 (as paletas têm porta própria por estilo, em `acessoAoEstilo`).
    expect(r!.sobrescrever?.paleta?.[0]).toMatch(/^hsl\(/)
  })

  it('matiz que não existe não vira rastro — id inválido continua inválido', async () => {
    const { estiloDeRastro, rastroValido } = await import('../src/lib/rastroDoMouse')
    expect(estiloDeRastro('croma:estrelas:nao-existe')).toBeNull()
    expect(rastroValido('croma:nao-existe:ambar')).toBe(false)
  })
})
