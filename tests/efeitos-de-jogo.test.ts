// @vitest-environment jsdom
/**
 * EFEITOS DE JOGO E FINALIZAÇÕES (recompensas v2, Task 3.3).
 *
 * O catálogo (6 acertos e 4 combos genéricos; por jogo: acerto no nível 2, moldura no 3,
 * finalização no 4, título no 5), a porta de cada um (maestria nunca tem preço nem nível), a regra
 * de onde o efeito vale (o de maestria só no jogo de origem até o Mestre daquele jogo) e o motor
 * de comemoração usando a receita equipada — só com o motor de partículas e tokens de cor.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ACERTOS_GENERICOS,
  autorizarGasto,
  CATALOGO_DA_LOJA,
  COMBOS_GENERICOS,
  EFEITOS_DE_JOGO,
  efeitoValeNoJogo,
  FINALIZACOES_DE_MAESTRIA,
  type ItemDaLoja,
  itensSorteaveisNoDrop,
  type MinigameId,
  MINIGAMES,
} from '../src/core'
import { planoDeComemoracao } from '../src/lib/comemoracao'
import { definirJogoEmCurso, efeitosGuardados, RECEITAS } from '../src/lib/comemoracao/efeitos'
import { EFEITOS_PADRAO, efeitosEquipados } from '../src/lib/comemoracao/pacotes'
import { type ContextoDeEquipar, equiparItem, perfilEquipado } from '../src/lib/galeria/equipar'
import { estadoDoItem, rotaDeObtencao } from '../src/lib/loja'
import { itensDaMaestria } from '../src/lib/maestria'
import { hidratarMaestria } from '../src/lib/maestriaPosse'

const JOGOS = Object.keys(MINIGAMES) as MinigameId[]
const TIPOS_DE_EFEITO = ['efeito-acerto', 'efeito-combo', 'finalizacao'] as const
const DE_MAESTRIA = CATALOGO_DA_LOJA.filter((i) => i.origemMaestria)
const item = (id: string) => CATALOGO_DA_LOJA.find((i) => i.id === id)!

const ctx: ContextoDeEquipar = {
  setTheme: () => {},
  setFonte: () => {},
  setMenuPosition: () => {},
  onOpenStudio: () => {},
  nivel: 50,
  saldo: 99_999,
}

beforeEach(() => {
  localStorage.clear()
  definirJogoEmCurso(null)
})

describe('o catálogo da onda 3', () => {
  it('6 acertos e 4 combos genéricos, só com Seeds (sem nível), nas faixas calibradas', () => {
    expect(ACERTOS_GENERICOS).toHaveLength(6)
    expect(COMBOS_GENERICOS).toHaveLength(4)
    for (const e of [...ACERTOS_GENERICOS, ...COMBOS_GENERICOS]) {
      const i = item(e.id)
      expect(i.nivel, e.id).toBeUndefined()
      expect(i.origemMaestria, e.id).toBeUndefined()
      const [min, max] = i.raridade === 'comum' ? [350, 450] : [1000, 1300]
      expect(i.precoSeeds, e.id).toBeGreaterThanOrEqual(min)
      expect(i.precoSeeds, e.id).toBeLessThanOrEqual(max)
    }
  })

  it('cada um dos 18 jogos tem exatamente um acerto (2), uma moldura (3), uma finalização (4) e um título (5)', () => {
    expect(JOGOS).toHaveLength(18)
    for (const jogo of JOGOS) {
      const doJogo = DE_MAESTRIA.filter((i) => i.origemMaestria!.jogo === jogo)
      const por = (tipo: ItemDaLoja['tipo']) => doJogo.filter((i) => i.tipo === tipo)
      expect(
        por('efeito-acerto').map((i) => i.origemMaestria!.nivel),
        jogo,
      ).toEqual([2])
      expect(
        por('moldura').map((i) => i.origemMaestria!.nivel),
        jogo,
      ).toEqual([3])
      expect(
        por('finalizacao').map((i) => i.origemMaestria!.nivel),
        jogo,
      ).toEqual([4])
      expect(
        por('titulo').map((i) => i.origemMaestria!.nivel),
        jogo,
      ).toEqual([5])
      expect(doJogo.every((i) => i.jogo === jogo)).toBe(true)
    }
    expect(FINALIZACOES_DE_MAESTRIA).toHaveLength(18)
  })

  it('item de maestria: sem nível, sem Seeds, sem Créditos, nunca à venda nem no baú', () => {
    expect(DE_MAESTRIA).toHaveLength(72)
    for (const i of DE_MAESTRIA) {
      expect(i.nivel, i.id).toBeUndefined()
      expect(i.precoSeeds, i.id).toBeUndefined()
      expect(i.precoCreditos, i.id).toBeUndefined()
      expect(autorizarGasto(`loja:${i.id}`), i.id).toHaveProperty('erro')
    }
    const sorteaveis = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))
    expect(DE_MAESTRIA.some((i) => sorteaveis.has(i.id))).toBe(false)
  })

  it('nenhum emoji no nome nem na descrição dos itens novos', () => {
    const novos = CATALOGO_DA_LOJA.filter((i) => [...TIPOS_DE_EFEITO, 'moldura', 'titulo'].includes(i.tipo as never))
    for (const i of novos) expect(`${i.nome} ${i.desc}`, i.id).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('itensDaMaestria entrega o que cada nível libera', () => {
    expect(itensDaMaestria('memory', 4).map((i) => i.id)).toEqual(['finalizacao-memory'])
    expect(itensDaMaestria('taboo', 5).map((i) => i.tipo)).toEqual(['titulo'])
  })
})

describe('estadoDoItem e a rota de um item de maestria', () => {
  it('trancado diz o jogo e o nível, nunca um preço; nível da conta e saldo não abrem', () => {
    const fin = item('finalizacao-memory')
    const e = estadoDoItem(fin, 99, 1_000_000)
    expect(e).toEqual({ estado: 'bloqueado', motivo: 'Maestria: Memória Platina' })
    expect(e.motivo).not.toMatch(/seeds|créditos|\d/i)
    for (const i of DE_MAESTRIA)
      expect(estadoDoItem(i, 99, 1_000_000).motivo ?? '', i.id).not.toMatch(/seeds|créditos/i)
    expect(rotaDeObtencao(fin).destino).toBe('jogar')
  })

  it('abre com o crédito de maestria do jogo, no nível certo', () => {
    hidratarMaestria(['maestria:memory:1', 'maestria:memory:2', 'maestria:memory:3'])
    expect(estadoDoItem(item('acerto-memory'), 1, 0).estado).toBe('equipavel')
    expect(estadoDoItem(item('moldura-memory'), 1, 0).estado).toBe('equipavel')
    expect(estadoDoItem(item('finalizacao-memory'), 1, 0).estado).toBe('bloqueado')
    expect(estadoDoItem(item('acerto-termo'), 1, 0).estado).toBe('bloqueado')
  })
})

describe('onde o efeito vale', () => {
  it('genérico vale sempre; o de maestria só no jogo de origem até o nível 5 dele', () => {
    expect(efeitoValeNoJogo({}, 'termo', 0)).toBe(true)
    expect(efeitoValeNoJogo({ jogo: 'memory' }, 'memory', 4)).toBe(true)
    expect(efeitoValeNoJogo({ jogo: 'memory' }, 'termo', 4)).toBe(false)
    expect(efeitoValeNoJogo({ jogo: 'memory' }, 'termo', 5)).toBe(true)
    expect(efeitoValeNoJogo({ jogo: 'memory' }, null, 4)).toBe(false)
  })

  it('finalização de Memória equipada: vale em Memória; em Termo só depois do Mestre de Memória', () => {
    hidratarMaestria(['maestria:memory:4'])
    expect(equiparItem(item('finalizacao-memory'), ctx)).toBe(true)
    expect(efeitosGuardados().finalizacao).toBe('finalizacao-memory')
    expect(efeitosEquipados('memory').finalizacao).toBe('finalizacao-memory')
    expect(efeitosEquipados('termo').finalizacao).toBe('padrao')
    hidratarMaestria(['maestria:memory:4', 'maestria:memory:5'])
    expect(efeitosEquipados('termo').finalizacao).toBe('finalizacao-memory')
  })

  it('o acerto de maestria usa o jogo em curso (a casca avisa)', () => {
    hidratarMaestria(['maestria:karuta:2'])
    equiparItem(item('acerto-karuta'), ctx)
    definirJogoEmCurso('karuta')
    expect(efeitosEquipados().acerto).toBe('acerto-karuta')
    definirJogoEmCurso('memory')
    expect(efeitosEquipados().acerto).toBe('padrao')
  })

  it('sem a posse, equipar recusa; efeito guardado sem posse ou inexistente cai no padrão', () => {
    expect(equiparItem(item('finalizacao-bao'), ctx)).toBe(false)
    localStorage.setItem(
      'babel.efeitos_equipados',
      JSON.stringify({ finalizacao: 'finalizacao-bao', acerto: 'nao-existe' }),
    )
    expect(efeitosEquipados('bao')).toEqual(EFEITOS_PADRAO)
  })

  it('genérico comprado vale em qualquer jogo; moldura e título ficam guardados no perfil', () => {
    localStorage.setItem('babel.loja_possuidos', JSON.stringify(['acerto-raio', 'combo-trovao']))
    expect(equiparItem(item('acerto-raio'), { ...ctx, nivel: 1, saldo: 0 })).toBe(true)
    expect(equiparItem(item('combo-trovao'), { ...ctx, nivel: 1, saldo: 0 })).toBe(true)
    expect(efeitosEquipados('taboo')).toMatchObject({ acerto: 'acerto-raio', combo: 'combo-trovao' })
    hidratarMaestria(['maestria:tenis:3', 'maestria:tenis:5'])
    expect(equiparItem(item('moldura-tenis'), ctx)).toBe(true)
    expect(equiparItem(item('titulo-tenis'), ctx)).toBe(true)
    expect(perfilEquipado()).toEqual({ moldura: 'moldura-tenis', titulo: 'titulo-tenis' })
  })
})

describe('as receitas: só o motor de partículas e tokens de cor', () => {
  it('todo efeito do catálogo tem receita, e toda receita é de um efeito do catálogo', () => {
    for (const e of EFEITOS_DE_JOGO) expect(RECEITAS[e.tipo][e.id], e.id).toBeTruthy()
    const ids = new Set(EFEITOS_DE_JOGO.map((e) => e.id))
    for (const tipo of TIPOS_DE_EFEITO) for (const id of Object.keys(RECEITAS[tipo])) expect(ids.has(id), id).toBe(true)
  })

  it('forma do motor (sem emoji, sem a cometa da conquista) e cor só por token', () => {
    for (const tipo of TIPOS_DE_EFEITO) {
      for (const [id, r] of Object.entries(RECEITAS[tipo])) {
        expect(['circulo', 'confete', 'pixel', 'raio', 'coracao', 'fumaca'], id).toContain(r.forma)
        expect(['--accent', '--good', '--warn', '--ink-muted'], id).toContain(r.cor)
        expect(JSON.stringify(r), id).not.toMatch(/#[0-9a-f]{3,8}/i)
      }
    }
  })

  it('as 18 finalizações são 18 festas diferentes (forma × origem × cor)', () => {
    const assinaturas = FINALIZACOES_DE_MAESTRIA.map((f) => {
      const r = RECEITAS.finalizacao[f.id]
      return `${r.forma}/${r.origem}/${r.cor}`
    })
    expect(new Set(assinaturas).size).toBe(18)
    // E nenhuma repete a festa da casa (confete caindo do topo na cor de destaque).
    expect(assinaturas).not.toContain('confete/chuva/--accent')
  })
})

describe('planoDeComemoracao usa a receita equipada', () => {
  const cheio = { leve: false, semSom: false }

  it('rodada de 3 estrelas solta a finalização equipada', () => {
    const plano = planoDeComemoracao(
      { tipo: 'rodada', estrelas: 3, jogo: 'blitz' },
      { ...cheio, efeitos: { ...EFEITOS_PADRAO, finalizacao: 'finalizacao-blitz' } },
    )
    expect(plano.rajadas).toEqual([
      { kind: 'perfeito', forma: 'raio', origem: 'cantos', cor: '--warn', contagem: 28, quantidade: 1 },
    ])
    expect(plano.sons[0].evento).toBe('fever')
  })

  it('o acerto equipado troca a forma e a cor, e o tom continua subindo com o combo', () => {
    const plano = planoDeComemoracao(
      { tipo: 'acerto', combo: 4 },
      { ...cheio, efeitos: { ...EFEITOS_PADRAO, acerto: 'acerto-pixel' } },
    )
    expect(plano.rajadas[0]).toMatchObject({ kind: 'xp', forma: 'pixel', cor: '--good' })
    expect(plano.sons[0].transpose).toBe(4)
  })

  it('o combo equipado', () => {
    const plano = planoDeComemoracao(
      { tipo: 'combo', multiplicador: 3 },
      { ...cheio, efeitos: { ...EFEITOS_PADRAO, combo: 'combo-confete' } },
    )
    expect(plano.rajadas[0]).toMatchObject({ kind: 'combo', forma: 'confete', origem: 'chuva' })
  })

  it('modo leve: a finalização equipada vira retorno discreto (sem partícula, sem tremor)', () => {
    const plano = planoDeComemoracao(
      { tipo: 'rodada', estrelas: 3, jogo: 'blitz' },
      { leve: true, semSom: false, efeitos: { ...EFEITOS_PADRAO, finalizacao: 'finalizacao-blitz' } },
    )
    expect(plano.rajadas).toEqual([])
    expect(plano.tremor).toBe(0)
    expect(plano.vibracao).toBeNull()
    expect(plano.sons.length).toBeGreaterThan(0)
  })
})
