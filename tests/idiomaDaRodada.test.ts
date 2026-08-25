/**
 * O DEFEITO QUE ESTE ARQUIVO IMPEDE DE VOLTAR — e ele não tinha nenhum teste.
 *
 * `Play.tsx` fazia isto ao montar a rodada:
 *
 *     if (composicao && composicao.itens.length) {
 *       const servidos = composicao.itens.map(i => porId.get(i.cardId)).filter(Boolean)
 *       if (servidos.length) return servidos      // ← `triagem.usaveis` nunca era consultada
 *     }
 *
 * Ou seja: quando o servidor respondia, a triagem inteira era descartada. E o servidor selecionava
 * SEM idioma e SEM régua de qualidade. Medido no baralho real: praticando português, dos 200
 * cartões servidos só 5 tinham tradução, embora o baralho tivesse 323 palavras portuguesas
 * jogáveis. Os jogos ficavam cinza e a causa estava a três arquivos de distância.
 *
 * Duas invariantes, e é por elas que o defeito não tem como voltar sem quebrar a build:
 *
 *  1. **Membresia**: tudo o que sai de `recortarPelaComposicao` está em `usaveis`. A composição
 *     ORDENA e PRIORIZA; ela nunca ADICIONA.
 *  2. **Idioma**: o material entregue aos jogos respeita o idioma escolhido — o que, antes, o
 *     seletor do lobby não conseguia garantir de jeito nenhum.
 */
import { describe, it, expect } from 'vitest'
import { recortarPelaComposicao, composicaoLocal, type Composicao, type CartaoParaCompor } from '../src/core/minigames/composicao'
import { triarCartoes, baseLangDe } from '../src/core/learning/quality'
import { cartoesDaFonte } from '../src/core/minigames/source'
import type { VocabCard } from '../src/types'

function carta(id: string, word: string, translation: string, srcLang: string | undefined): VocabCard {
  return {
    id, word, phonetics: '', translation, explanation: '',
    srcLang, tgtLang: 'pt', frequency: 'medium',
    leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5,
    fsrsPredictedRetention: 0, fsrsDueAt: new Date(0).toISOString(), inDeck: true,
  }
}

/** Baralho misto, como o real: inglês com tradução, português com tradução, e alguns sem idioma. */
const EN = [
  carta('en1', 'house', 'casa', 'en-US'),
  carta('en2', 'bread', 'pão', 'en'),
  carta('en3', 'window', 'janela', 'en-US'),
  carta('en4', 'table', 'mesa', 'en'),
]
const PT = [
  carta('pt1', 'saudade', 'longing', 'pt-BR'),
  carta('pt2', 'cadeira', 'chair', 'pt'),
  carta('pt3', 'janela', 'window', 'pt-BR'),
]
const SEM_IDIOMA = [carta('x1', 'mistero', 'mistério', undefined)]
const DECK = [...EN, ...PT, ...SEM_IDIOMA]

/** Uma composição servida que mistura idiomas — exatamente o que o servidor mandava. */
function composicaoMisturada(ids: string[]): Composicao {
  return {
    total: ids.length,
    origemDaComposicao: 'servidor',
    itens: ids.map(id => ({
      cardId: id, word: id, back: null, sentence: null,
      proveniencia: {
        origem: 'baralho', origemRef: null, nivel: null, nivelFonte: 'ausente',
        dificuldade: null, faixa: null, ocorrencias: null,
        porQueSelecionado: 'teste', origemDaComposicao: 'servidor',
      },
    })),
  } as unknown as Composicao
}

describe('o material entregue aos jogos respeita o idioma escolhido', () => {
  it('composição misturada + triagem em inglês → só sai inglês', () => {
    const usaveis = cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' }).usaveis
    // O servidor mandou os dois idiomas, como mandava de verdade.
    const servida = composicaoMisturada(['pt1', 'en1', 'pt2', 'en2'])

    const material = recortarPelaComposicao(usaveis, servida, { completar: true })

    for (const c of material) {
      expect(baseLangDe(c.srcLang), `${c.word} não é inglês e chegou aos jogos`).toBe('en')
    }
  })

  it('trocar o idioma troca o material — antes o seletor não tinha efeito nenhum', () => {
    const servida = composicaoMisturada(DECK.map(c => c.id))

    const emIngles = recortarPelaComposicao(cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' }).usaveis, servida, { completar: true })
    const emPortugues = recortarPelaComposicao(cartoesDaFonte(DECK, { id: 'baralho', lang: 'pt' }).usaveis, servida, { completar: true })

    expect(emIngles.length).toBeGreaterThan(0)
    expect(emPortugues.length).toBeGreaterThan(0)
    // Conjuntos disjuntos: nenhuma palavra aparece nas duas rodadas.
    const idsEn = new Set(emIngles.map(c => c.id))
    expect(emPortugues.some(c => idsEn.has(c.id))).toBe(false)
  })

  it('cartão sem idioma não entra numa rodada com idioma declarado', () => {
    const t = cartoesDaFonte(DECK, { id: 'baralho', lang: 'en' })
    expect(t.usaveis.some(c => c.id === 'x1'), 'cartão sem srcLang passou como inglês').toBe(false)
    // E é DEFEITO (tem conserto na curadoria), não "de outro idioma".
    expect(t.fora.some(f => f.card.id === 'x1' && f.motivo === 'idioma-incerto')).toBe(true)
    expect(t.outroIdioma.some(c => c.id === 'x1')).toBe(false)
  })

  it('sem idioma declarado, nada muda — o comportamento antigo é preservado', () => {
    const t = cartoesDaFonte(DECK, { id: 'baralho', lang: '' })
    expect(t.usaveis.some(c => c.id === 'x1')).toBe(true)
    expect(t.outroIdioma).toEqual([])
  })
})

describe('a composição ordena e prioriza; nunca adiciona', () => {
  const usaveis = triarCartoes(EN, { lang: 'en' }).usaveis

  it('tudo o que sai está em usaveis — a invariante anti-bypass', () => {
    // A composição cita um id que a régua reprovou; ele NÃO pode aparecer no material.
    const servida = composicaoMisturada(['pt1', 'en2', 'fantasma', 'en1'])
    const material = recortarPelaComposicao(usaveis, servida, { completar: true })

    const permitidos = new Set(usaveis.map(c => c.id))
    for (const c of material) {
      expect(permitidos.has(c.id), `${c.id} entrou sem passar pela triagem`).toBe(true)
    }
  })

  it('respeita a ordem do servidor nos que ele citou', () => {
    const material = recortarPelaComposicao(usaveis, composicaoMisturada(['en3', 'en1']), { completar: true })
    expect(material[0].id).toBe('en3')
    expect(material[1].id).toBe('en1')
  })

  it('completa com o resto do acervo — foi o teto que fez a Memória ver 5 de 323', () => {
    const material = recortarPelaComposicao(usaveis, composicaoMisturada(['en3']), { completar: true })
    expect(material).toHaveLength(usaveis.length)
    expect(material[0].id).toBe('en3')
  })

  it('com filtro de dificuldade NÃO completa — senão o recorte pedido seria apagado', () => {
    const material = recortarPelaComposicao(usaveis, composicaoMisturada(['en3']), { completar: false })
    expect(material.map(c => c.id)).toEqual(['en3'])
  })

  it('sem composição (offline), o acervo inteiro passa', () => {
    expect(recortarPelaComposicao(usaveis, null, { completar: true })).toHaveLength(usaveis.length)
  })

  it('não duplica quando a composição repete um id', () => {
    const material = recortarPelaComposicao(usaveis, composicaoMisturada(['en1', 'en1', 'en1']), { completar: false })
    expect(material).toHaveLength(1)
  })
})

describe('o fallback offline também filtra idioma', () => {
  const paraCompor: CartaoParaCompor[] = DECK.map(c => ({
    id: c.id, word: c.word, back: c.translation, sentence: null,
    srcLang: c.srcLang ?? null, tgtLang: c.tgtLang ?? null,
    clozePrompt: null, clozeAnswer: null,
    cefrLevel: null, cefrSource: null, occurrences: null, difficultyScore: null, dueAt: null,
  }))

  it('sem rede, a composição local respeita o idioma', () => {
    /* O buraco simétrico: pôr o filtro só na rota deixaria a rodada errada exatamente quando a
       rede cai — que é quando um app local-first tem de estar certo. */
    const c = composicaoLocal(paraCompor, {
      jogo: 'memory', fonte: { id: 'baralho', lang: 'pt' }, limite: 50,
    })
    const ids = c.itens.map(i => i.cardId)
    expect(ids).not.toContain('en1')
    expect(ids).toContain('pt1')
  })

  it('sem idioma no pedido, devolve tudo — compatibilidade preservada', () => {
    const c = composicaoLocal(paraCompor, { jogo: 'memory', fonte: { id: 'baralho' }, limite: 50 })
    expect(c.itens.length).toBe(DECK.length)
  })
})
