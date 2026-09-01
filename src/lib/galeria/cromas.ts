/**
 * CROMAS — a variação de cor de uma peça que já é sua (modelo do League of Legends).
 *
 * O BURACO QUE ISTO FECHA. A economia tinha um fim: o catálogo inteiro custa 7.950 Seeds, ou
 * ~92 dias de estudo, e depois disso a moeda que se ganha estudando **não tem mais onde ser
 * gasta**. Quem chega lá continua ganhando Seeds que não compram nada. Croma dá destino infinito
 * para a moeda — e, como cor não altera progresso nenhum, sem virar pay-to-win.
 *
 * A REGRA QUE PROTEGE QUEM JÁ JOGOU: **croma é adição, nunca remoção.** Quem possui um estilo de
 * paleta continua com as 30 matizes que ele sempre deu; os cromas são variações NOVAS de peças
 * que hoje têm uma cor só (partículas, rastros, temas). Introduzir uma economia nova tirando algo
 * que já era da pessoa seria a pior forma de fazer isto, e é o que o teste trava.
 *
 * POSSE SEM TABELA NOVA. A compra é o mesmo `gastarSeeds` idempotente da Loja, com
 * `reason: 'croma:<item>:<matiz>'` — e o servidor deriva a posse desse razão, exatamente como
 * passou a fazer com `loja:<id>` quando a brecha B4 foi fechada. Um evento, uma fonte de verdade.
 */
import { MATIZES } from './paletas'
import type { Raridade } from '../loja'
import { PRECO_DO_CROMA } from '@core'

/** As quatro vias de um croma. Só uma delas envolve gastar a moeda de estudo. */
export type ViaDoCroma = 'incluso' | 'meu' | 'seeds' | 'conquista' | 'premium'

export interface Croma {
  /** Id do matiz no catálogo de paletas — a mesma lista que gera as 200 paletas. */
  matiz: string
  nome: string
  /** Matiz HSL (0-360), para a amostra e para a cor aplicada. */
  h: number
  via: ViaDoCroma
  /** Só quando `via === 'seeds'`. */
  preco?: number
}

/**
 * Preço por raridade da PEÇA, não do croma.
 *
 * Barato de propósito (o mais caro é 60, contra 380-600 de um lendário do catálogo): croma é onde
 * a Seed sobrando vai parar, não uma segunda barreira na frente do conteúdo. Quem não comprar
 * nenhum não perde nada — a peça já funciona com a cor inclusa.
 */
/* A tabela mudou para `core/economiaAutoridade.ts` — o SERVIDOR precisa dela para conferir o
   preço de um croma antes de debitar. Reexportada aqui para nenhuma tela mudar de import. */
export { PRECO_DO_CROMA }

const CHAVE = 'babel.cromas'

/** `croma:<itemId>:<matizId>` — a chave que vale no localStorage, no spendId e no razão. */
export function idDoCroma(itemId: string, matiz: string): string {
  return `croma:${itemId}:${matiz}`
}

export function cromasPossuidos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]) } catch { return new Set() }
}

export function marcarCroma(id: string): void {
  try {
    const s = cromasPossuidos()
    s.add(id)
    localStorage.setItem(CHAVE, JSON.stringify([...s]))
  } catch { /* sem storage: a posse volta na próxima hidratação do servidor */ }
}

/**
 * Espelha a posse que o servidor derivou do razão de gastos. UNION pelo mesmo motivo da posse da
 * Loja: uma compra feita offline (débito ainda na fila) não pode sumir porque a lista do servidor
 * ainda não a conhece.
 */
/** Mesma regra de `hidratarPosse`: com conta o servidor substitui; sem conta, soma. */
export function hidratarCromas(doServidor: readonly string[] | undefined, autoritativo = false): void {
  if (!doServidor) return
  try {
    if (autoritativo) {
      localStorage.setItem(CHAVE, JSON.stringify([...new Set(doServidor)]))
      return
    }
    if (!doServidor.length) return
    const s = cromasPossuidos()
    const antes = s.size
    for (const id of doServidor) s.add(id)
    if (s.size !== antes) localStorage.setItem(CHAVE, JSON.stringify([...s]))
  } catch { /* sem storage */ }
}

/**
 * Os cromas de uma peça, com a via de cada um já resolvida.
 *
 * As duas últimas posições NÃO têm preço: uma sai de conquista e outra do Passe Premium. É o que
 * impede a coleção completa de ser só uma questão de moer Seeds — sempre sobra algo que exige
 * fazer, e algo que exige apoiar o projeto.
 */
export function cromasDaPeca(itemId: string, raridade: Raridade): Croma[] {
  const possuidos = cromasPossuidos()
  const total = MATIZES.length
  return MATIZES.map((m, i) => {
    const id = idDoCroma(itemId, m.id)
    // A cor inclusa é a primeira: toda peça já nasce com uma, e ela nunca custa nada.
    if (i === 0) return { matiz: m.id, nome: m.nome, h: m.h, via: 'incluso' as const }
    if (possuidos.has(id)) return { matiz: m.id, nome: m.nome, h: m.h, via: 'meu' as const }
    if (i === total - 1) return { matiz: m.id, nome: m.nome, h: m.h, via: 'premium' as const }
    if (i === total - 2) return { matiz: m.id, nome: m.nome, h: m.h, via: 'conquista' as const }
    return { matiz: m.id, nome: m.nome, h: m.h, via: 'seeds' as const, preco: PRECO_DO_CROMA[raridade] }
  })
}

/** Um croma está disponível para uso? (inclusa e comprada valem; as outras três não) */
export function temOCroma(c: Croma): boolean {
  return c.via === 'incluso' || c.via === 'meu'
}

/* ── O CROMA EQUIPADO POR PEÇA ────────────────────────────────────────────
   Preferência, não posse: trocar de croma é grátis e reversível, como a intensidade das
   partículas. Só DESBLOQUEAR custa. */

const CHAVE_EQUIPADO = 'babel.croma_equipado'

export function cromaEquipado(itemId: string): string | null {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_EQUIPADO) || '{}') as Record<string, string>
    return m[itemId] ?? null
  } catch { return null }
}

export function equiparCroma(itemId: string, matiz: string | null): void {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_EQUIPADO) || '{}') as Record<string, string>
    if (matiz) m[itemId] = matiz; else delete m[itemId]
    localStorage.setItem(CHAVE_EQUIPADO, JSON.stringify(m))
  } catch { /* sem storage */ }
}

/**
 * A COR que o croma equipado produz — ou `null` quando não há croma (e aí vale o token do tema).
 *
 * `null` é a resposta importante: sem croma, nada muda no comportamento atual. É isso que faz
 * esta economia inteira ser aditiva.
 */
export function corDoCromaEquipado(itemId: string): string | null {
  const matiz = cromaEquipado(itemId)
  if (!matiz) return null
  const m = MATIZES.find((x) => x.id === matiz)
  if (!m) return null
  // Só matiz e luminosidade fixas: o croma muda a COR, não o brilho nem a saturação do preset —
  // senão um croma poderia deixar a partícula invisível em algum dos 7 temas.
  return `hsl(${m.h} 78% 62%)`
}
