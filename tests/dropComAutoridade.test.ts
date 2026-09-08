/**
 * O BAÚ DE FIM DE RODADA, sob a mesma régua de todo o resto da economia.
 *
 * O drop é o canal em que a tentação de deixar o cliente decidir é MAIOR do que em qualquer outro:
 * ele entrega item de graça, e o cliente é quem sabe que a rodada acabou. A versão que existia no
 * ramo de trabalho (`src/lib/drops.ts`) cedeu à tentação três vezes — mandava `amount` e `reason`
 * no corpo, punha `Date.now()` dentro do `creditoId` (matando a idempotência, que é POR
 * `creditoId`) e usava um prefixo que nenhuma família reconhecia.
 *
 * O que este arquivo prende é o núcleo PURO da regra nova: quem pode cair, com que peso, e o que
 * `valorDoDrop` recusa. A ancoragem na rodada e a idempotência de ponta a ponta ficam em
 * `tests/integration/drop-idempotente.test.ts`, que precisa de banco.
 */
import { describe, it, expect } from 'vitest'
import {
  SEEDS_DO_DROP, PESOS_DO_DROP, roundIdDoDrop, itensSorteaveisNoDrop, sortearItemDoDrop,
  valorDoDrop, valorDoCredito, ehRecusa,
} from '../src/core/economiaAutoridade'
import { CATALOGO_DA_LOJA } from '../src/core/loja'

const TODOS = itensSorteaveisNoDrop(new Set())

describe('roundIdDoDrop: o formato do creditoId é fechado', () => {
  it('extrai o roundId de `drop:<roundId>`', () => {
    expect(roundIdDoDrop('drop:termo-1757000000000-a1b2c')).toBe('termo-1757000000000-a1b2c')
  })

  it('devolve null para outras famílias — elas seguem o fluxo de sempre', () => {
    expect(roundIdDoDrop('conquista-ouvinte')).toBeNull()
    expect(roundIdDoDrop('passe:t1:cofre-d10-1')).toBeNull()
    /* O formato do ramo de trabalho: `drop-partida-bau-<Date.now()>`. Ele NÃO é desta família —
       o hífen no lugar do dois-pontos era o que fazia `valorDoCredito` responder 400. */
    expect(roundIdDoDrop('drop-partida-bau-1757000000000')).toBeNull()
  })

  it('recusa o prefixo sem rodada e o roundId com dois-pontos', () => {
    expect(roundIdDoDrop('drop:')).toBeNull()
    expect(roundIdDoDrop('drop:a:b')).toBeNull()
  })
})

describe('quem pode cair num baú', () => {
  it('item exclusivo de conquista NUNCA sai — é o que separa conquista de compra', () => {
    const exclusivos = CATALOGO_DA_LOJA.filter((i) => i.exclusivoDe).map((i) => i.id)
    expect(exclusivos.length).toBeGreaterThan(0)
    for (const id of exclusivos) expect(TODOS.map((i) => i.id)).not.toContain(id)
    /* E a régua vale também pela porta de trás: mesmo já sorteado, o item é recusado. */
    const r = valorDoDrop('drop:r1', 'tema-aurora')
    expect(ehRecusa(r)).toBe(true)
  })

  it('item de Créditos NUNCA sai — é a moeda que custou dinheiro', () => {
    const pagos = CATALOGO_DA_LOJA.filter((i) => i.precoCreditos !== undefined).map((i) => i.id)
    expect(pagos.length).toBeGreaterThan(0)
    for (const id of pagos) expect(TODOS.map((i) => i.id)).not.toContain(id)
    expect(ehRecusa(valorDoDrop('drop:r1', 'dourada-1'))).toBe(true)
  })

  it('só comum e raro: épico e lendário continuam sendo o motivo de poupar', () => {
    expect(TODOS.every((i) => i.raridade === 'comum' || i.raridade === 'raro')).toBe(true)
    expect(ehRecusa(valorDoDrop('drop:r1', 'tema-custom'))).toBe(true)
    expect(ehRecusa(valorDoDrop('drop:r1', 'part-estrelas'))).toBe(true)
  })

  it('só o que teria preço em Seeds: o baú não entrega a fonte que todo mundo já tem', () => {
    /* Sem esta regra, `fonte-padrao`, `pos-topo`, `cur-padrao`, `ras-off` e `pack-classico` —
       nível 1, sem preço — entrariam no sorteio e o baú premiaria com o que já é de todos. */
    expect(TODOS.every((i) => i.precoSeeds !== undefined)).toBe(true)
    for (const id of ['fonte-padrao', 'pos-topo', 'cur-padrao', 'ras-off', 'pack-classico']) {
      expect(TODOS.map((i) => i.id)).not.toContain(id)
      expect(ehRecusa(valorDoDrop('drop:r1', id))).toBe(true)
    }
  })

  it('item já possuído sai do sorteio — duplicata não é prêmio', () => {
    const alvo = TODOS[0].id
    const sem = itensSorteaveisNoDrop(new Set([alvo]))
    expect(sem.map((i) => i.id)).not.toContain(alvo)
    expect(sem.length).toBe(TODOS.length - 1)
  })

  it('o catálogo de hoje tem itens sorteáveis nas duas faixas', () => {
    expect(TODOS.filter((i) => i.raridade === 'comum').length).toBeGreaterThan(0)
    expect(TODOS.filter((i) => i.raridade === 'raro').length).toBeGreaterThan(0)
  })
})

describe('o sorteio', () => {
  it('é determinístico: o mesmo float devolve o mesmo item', () => {
    for (const f of [0, 0.1, 0.42, 0.74, 0.75, 0.9, 0.999]) {
      expect(sortearItemDoDrop(f, TODOS)?.id).toBe(sortearItemDoDrop(f, TODOS)?.id)
    }
  })

  it('respeita os pesos: 75% comum, 25% raro, independente de quantos itens há em cada faixa', () => {
    const N = 10_000
    let comuns = 0
    for (let n = 0; n < N; n++) {
      if (sortearItemDoDrop(n / N, TODOS)?.raridade === 'comum') comuns += 1
    }
    /* Varredura uniforme do float, não amostragem aleatória: a proporção tem de bater com o peso
       na casa decimal, e não "por aí". É o que prova que o corte é 75/25 e NÃO a razão entre as
       quantidades de itens de cada faixa: o catálogo tem hoje MAIS raros sorteáveis do que comuns,
       então uma roleta item a item daria ~68/32 — e esse número mudaria sozinho a cada item novo e
       a cada compra da pessoa, que é justamente o que não pode acontecer com uma taxa anunciada. */
    expect(comuns / N).toBeCloseTo(PESOS_DO_DROP.comum / 100, 3)
  })

  it('faixa vazia devolve a probabilidade à outra em vez de sortear nada', () => {
    const soRaros = TODOS.filter((i) => i.raridade === 'raro')
    for (const f of [0, 0.3, 0.74, 0.8, 0.99]) {
      expect(sortearItemDoDrop(f, soRaros)?.raridade).toBe('raro')
    }
    const soComuns = TODOS.filter((i) => i.raridade === 'comum')
    for (const f of [0, 0.3, 0.8, 0.99]) {
      expect(sortearItemDoDrop(f, soComuns)?.raridade).toBe('comum')
    }
  })

  it('lista vazia devolve null — quem já tem tudo não recebe duplicata', () => {
    expect(sortearItemDoDrop(0.5, [])).toBeNull()
    expect(sortearItemDoDrop(0.5, itensSorteaveisNoDrop(new Set(TODOS.map((i) => i.id))))).toBeNull()
  })

  it('float defeituoso não derruba o baú — bônus não pode virar erro', () => {
    for (const f of [Number.NaN, -1, 1, 42]) expect(sortearItemDoDrop(f, TODOS)).not.toBeNull()
  })
})

describe('valorDoDrop: a régua antes de gravar a posse', () => {
  it('autoriza um item sorteável com o razão de onde a posse é derivada', () => {
    const alvo = TODOS.find((i) => i.raridade === 'raro')!
    const r = valorDoDrop('drop:termo-123-abc', alvo.id)
    expect(ehRecusa(r)).toBe(false)
    expect(r).toMatchObject({
      creditoId: 'drop:termo-123-abc',
      seeds: SEEDS_DO_DROP,
      xp: 0,
      reason: `drop:${alvo.id}`,
      nivelMinimo: 0,
    })
  })

  it('recusa item inexistente — sem isto a rota gravaria qualquer posse', () => {
    const r = valorDoDrop('drop:r1', 'item-que-nao-existe')
    expect(ehRecusa(r)).toBe(true)
    if (ehRecusa(r)) expect(r.erro).toContain('inexistente')
  })

  it('recusa creditoId que não é da família de drop', () => {
    expect(ehRecusa(valorDoDrop('conquista-ouvinte', TODOS[0].id))).toBe(true)
    expect(ehRecusa(valorDoDrop('drop-partida-bau-1757000000000', TODOS[0].id))).toBe(true)
  })
})

describe('valorDoCredito não tenta resolver um drop sozinha', () => {
  it('recusa `drop:<roundId>` dizendo que o item é sorteado pelo servidor', () => {
    const r = valorDoCredito('drop:termo-123-abc')
    expect(ehRecusa(r)).toBe(true)
    if (ehRecusa(r)) expect(r.erro).toContain('sorteado')
  })
})
