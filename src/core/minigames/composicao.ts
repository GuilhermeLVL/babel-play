/**
 * ADAPTADOR ÚNICO DE COMPOSIÇÃO DE RODADA (Z1).
 *
 * O QUE ISTO SUBSTITUI: a seleção de palavras vivia no cliente — `cartoesDaFonte` filtrava em JS
 * sobre o deck inteiro, que `fetchDeck()` rebaixava a cada fim de rodada. Não havia filtro de
 * dificuldade, e "por que esta palavra apareceu?" não tinha resposta.
 *
 * CONTRATO: os 9 jogos consomem ESTE módulo. Nenhum jogo chama `/api/...` diretamente — um jogo
 * novo herda filtro, estratégia, proveniência e fallback sem escrever nada disso de novo.
 *
 * RECORTE DECLARADO: dificuldade é propriedade do CARTÃO. Dos 9 jogos, 4 são de modalidade
 * `palavra` e recebem o filtro; os 5 de frase/frase-áudio jogam sobre FALAS de sessão, que não têm
 * dificuldade por palavra. O adaptador serve os 9 e responde, por jogo, se o filtro se aplica —
 * `aceitaFiltroDeDificuldade`. A UI usa isso para não exibir um chip inerte.
 *
 * LOCAL-FIRST: se a composição servida falhar (offline, 5xx, corpo malformado), cai para
 * composição local com `origemDaComposicao: 'fallback-local'`. O comportamento é DEFINIDO e
 * testado, não acidental: rodada vazia silenciosa ou tela quebrada seriam piores que uma seleção
 * sem o refinamento do servidor.
 */
import { MINIGAMES, type MinigameId } from './types'
import { baseLangDe } from '../learning/quality'

export type FaixaDificuldade = 'facil' | 'medio' | 'dificil'
export type EstrategiaDeDistribuicao = 'equilibrado' | 'recentes' | 'frequentes' | 'em-dificuldade'

/** Mesmos cortes do servidor (`core/learning/dificuldade.ts`). Divergir seria ter duas verdades. */
export const CORTE_FACIL = 0.34
export const CORTE_DIFICIL = 0.67

export function faixaDe(score: number | null | undefined): FaixaDificuldade | null {
  if (score == null) return null
  return score < CORTE_FACIL ? 'facil' : score < CORTE_DIFICIL ? 'medio' : 'dificil'
}

/** O filtro de dificuldade só faz sentido onde o item É um cartão de vocabulário. */
export function aceitaFiltroDeDificuldade(jogo: MinigameId): boolean {
  return MINIGAMES[jogo]?.modalidade === 'palavra'
}

export interface CartaoParaCompor {
  id: string
  word: string
  back: string | null
  sentence: string | null
  srcLang?: string | null
  tgtLang?: string | null
  clozePrompt?: string | null
  clozeAnswer?: string | null
  cefrLevel: string | null
  cefrSource: string | null
  occurrences: number | null
  difficultyScore: number | null
  dueAt: number | null
}

export interface Proveniencia {
  origem: 'baralho' | 'sessao' | 'trilha'
  origemRef: string | null
  nivel: string | null
  nivelFonte: string
  dificuldade: number | null
  faixa: FaixaDificuldade | null
  ocorrencias: number | null
  porQueSelecionado: string
  /** De onde veio a COMPOSIÇÃO — a UI precisa distinguir seleção servida de fallback. */
  origemDaComposicao: 'servidor' | 'fallback-local'
}

export interface ItemComposto {
  cardId: string | null
  word: string
  back: string | null
  sentence: string | null
  clozePrompt: string | null
  clozeAnswer: string | null
  proveniencia: Proveniencia
}

export interface Composicao {
  itens: ItemComposto[]
  total: number
  origemDaComposicao: 'servidor' | 'fallback-local'
  /** Preenchido quando caiu para local, para o relatório e para a UI poderem dizer por quê. */
  motivoDoFallback?: string
}

/** O que a TELA precisa saber sobre o tamanho da fonte. Ver `contagemDaFonte`. */
export interface ContagemDaFonte {
  /** Quantos itens esta rodada vai usar. É um RECORTE, e a UI precisa dizer isso. */
  naRodada: number
  /** Quantos existem na fonte inteira, sem teto. É este que responde "quantas eu tenho?". */
  total: number
  /** true quando a rodada é um pedaço de um conjunto maior. */
  recortado: boolean
}

/**
 * DECIDE QUAL NÚMERO VAI PARA A TELA.
 *
 * Existe porque a faixa "Praticar" exibia o tamanho da COMPOSIÇÃO como se fosse o tamanho do
 * ACERVO. `compor()` é chamado com `limite: 200` fixo, então `composicao.itens.length` satura em
 * 200 — enquanto os contadores vizinhos ("N em outro idioma", "N para revisar") vêm da triagem
 * local sobre o baralho inteiro. Com 1.902 cartões jogáveis a tela dizia "200 prontas" ao lado
 * de "988 em outro idioma": dois números em bases diferentes, lado a lado, sem aviso.
 *
 * `composicao.total` já existia no contrato e nunca era renderizado.
 *
 * O total do SERVIDOR vence o local porque só ele enxerga a fonte inteira: o cliente pode ter
 * apenas uma parte do deck em memória.
 */
export function contagemDaFonte(composicao: Composicao | null, acervoLocal: number): ContagemDaFonte {
  const naRodada = composicao?.itens.length ?? 0
  const doServidor = composicao?.total ?? 0
  // `Math.max` não é paranoia: um total menor que a rodada seria um número impossível na tela
  // ("8 nesta rodada · 3 disponíveis") e destruiria a confiança em toda a faixa.
  const total = Math.max(doServidor, acervoLocal, naRodada)
  return { naRodada, total, recortado: naRodada > 0 && total > naRodada }
}

export interface PedidoDeComposicao {
  jogo: MinigameId
  /**
   * `lang` É PARTE DA FONTE, e a ausência dele foi um defeito de meses.
   *
   * O servidor compunha a rodada CEGO A IDIOMA: gastava os 200 slots com cartões de qualquer
   * idioma, ordenados por vencimento, e o cliente os entregava aos jogos. Medido no baralho real:
   * praticando português, dos 200 servidos só 5 tinham tradução — enquanto o baralho tinha 323
   * palavras portuguesas jogáveis. O seletor de idioma do lobby não tinha efeito nenhum sobre o
   * material; ele só mudava os números da linha de status.
   *
   * Vazio = sem filtro (o comportamento antigo, preservado para quem não escolheu idioma ainda).
   */
  fonte: { id: 'baralho' | 'sessao' | 'trilha'; ref?: string | null; lang?: string }
  dificuldade?: FaixaDificuldade[]
  estrategia?: EstrategiaDeDistribuicao
  limite: number
  evitar?: string[]
}

function proveniencia(c: CartaoParaCompor, p: PedidoDeComposicao, de: 'servidor' | 'fallback-local'): Proveniencia {
  const vencido = (c.dueAt ?? Infinity) <= Date.now()
  return {
    origem: p.fonte.id,
    origemRef: p.fonte.ref ?? null,
    nivel: c.cefrLevel,
    nivelFonte: c.cefrSource ?? 'ausente',
    dificuldade: c.difficultyScore,
    faixa: faixaDe(c.difficultyScore),
    ocorrencias: c.occurrences,
    porQueSelecionado: vencido ? 'vencido' : `estrategia:${p.estrategia ?? 'equilibrado'}`,
    origemDaComposicao: de,
  }
}

/**
 * Composição LOCAL — o fallback, e a mesma regra do servidor.
 *
 * Cartão sem `difficulty_score` NÃO é descartado: durante a migração ele é a maioria, e sumir com
 * a maior parte do deck seria pior que não filtrar.
 */
export function composicaoLocal(cartoes: CartaoParaCompor[], p: PedidoDeComposicao, motivo?: string): Composicao {
  let pool = cartoes
  /* O FALLBACK TINHA O MESMO BURACO DO SERVIDOR. Pôr o filtro de idioma só na rota deixaria a
     composição errada exatamente quando a rede cai — que é quando um app local-first tem de estar
     certo. `baseLangDe` é a mesma normalização de `quality.ts`, para as duas verdades serem uma. */
  if (p.fonte.lang) {
    const alvo = baseLangDe(p.fonte.lang)
    if (alvo) pool = pool.filter((c) => baseLangDe(c.srcLang) === alvo)
  }
  if (p.evitar?.length) {
    const evitar = new Set(p.evitar)
    pool = pool.filter((c) => !evitar.has(c.id) && !evitar.has(c.word))
  }
  if (p.dificuldade?.length && aceitaFiltroDeDificuldade(p.jogo)) {
    const querido = new Set(p.dificuldade)
    pool = pool.filter((c) => {
      const f = faixaDe(c.difficultyScore)
      return f == null ? false : querido.has(f)
    })
  }

  const ordenado = [...pool].sort((a, b) => {
    switch (p.estrategia) {
      case 'frequentes': return (b.occurrences ?? 0) - (a.occurrences ?? 0)
      case 'em-dificuldade': return (b.difficultyScore ?? 0) - (a.difficultyScore ?? 0)
      case 'recentes': return (b.dueAt ?? 0) - (a.dueAt ?? 0)
      // Equilibrado preserva a prioridade do FSRS: vencido primeiro.
      default: return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    }
  })

  const escolhidos = ordenado.slice(0, p.limite)
  return {
    total: pool.length,
    origemDaComposicao: 'fallback-local',
    motivoDoFallback: motivo,
    itens: escolhidos.map((c) => ({
      cardId: c.id, word: c.word, back: c.back, sentence: c.sentence,
      clozePrompt: c.clozePrompt ?? null, clozeAnswer: c.clozeAnswer ?? null,
      proveniencia: proveniencia(c, p, 'fallback-local'),
    })),
  }
}

/**
 * A URL da composição servida — construída à mão, de propósito.
 *
 * `URLSearchParams` é global do WHATWG, não do ES2022, e `src/core/tsconfig.json` declara
 * `lib: ["ES2022"]` e `types: []` justamente para o núcleo não depender de DOM nem de Node.
 * Usá-la aqui furava essa fronteira e deixava `npm run typecheck:core` — que é passo do CI —
 * VERMELHO desde `078a865` (achado F0-01 da auditoria). `encodeURIComponent` é built-in do ES e
 * faz o mesmo trabalho.
 */
function caminhoDaComposicao(p: PedidoDeComposicao): string {
  const partes: Array<[string, string]> = [
    ['fonte', p.fonte.id],
    ['limite', String(p.limite)],
    ['estrategia', p.estrategia ?? 'equilibrado'],
  ]
  if (p.fonte.ref) partes.push(['fonteRef', p.fonte.ref])
  if (p.fonte.lang) partes.push(['lang', p.fonte.lang])
  // Só manda o filtro onde ele significa algo — ver `aceitaFiltroDeDificuldade`.
  if (p.dificuldade?.length && aceitaFiltroDeDificuldade(p.jogo)) partes.push(['dificuldade', p.dificuldade.join(',')])
  if (p.evitar?.length) partes.push(['evitar', p.evitar.join(',')])
  const query = partes.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  return `/api/vocab/para-jogo?${query}`
}

/** O transporte, injetado. Devolve o corpo já decodificado, ou lança. */
export type BuscarComposicao = (caminho: string) => Promise<unknown>

/**
 * Transporte padrão: resolve `fetch` pelo objeto global EM TEMPO DE EXECUÇÃO.
 *
 * O núcleo não pode declarar `fetch` em tempo de tipo (é o que quebrava o `typecheck:core`), mas
 * pode consultar o ambiente em que está rodando. Se não houver `fetch` — Node antigo, worker sem
 * a API — devolve erro e `compor` cai no fallback local, que é o comportamento já definido e
 * testado para falha de rede.
 */
const buscarPadrao: BuscarComposicao = async (caminho) => {
  const g = globalThis as { fetch?: (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> }
  if (typeof g.fetch !== 'function') throw new Error('sem fetch neste ambiente')
  const res = await g.fetch(caminho, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`http ${res.status}`)
  return res.json()
}

/**
 * Compõe a rodada pelo SERVIDOR, com fallback local.
 *
 * `cartoesLocais` é a rede de segurança — passar o deck já carregado evita que a falha de rede
 * vire tela vazia.
 *
 * O TRANSPORTE VEM DE FORA. `fetch` também é global do WHATWG e não existe sob a fronteira do
 * núcleo; injetá-lo mantém este módulo isomórfico e testável sem stub global. O default abaixo
 * existe só para não quebrar quem já chamava com dois argumentos, e ele próprio não referencia
 * `fetch` em tempo de tipo — resolve pelo objeto global em tempo de execução.
 */
export async function compor(
  p: PedidoDeComposicao,
  cartoesLocais: CartaoParaCompor[],
  buscar: BuscarComposicao = buscarPadrao,
): Promise<Composicao> {
  try {
    const dados = await buscar(caminhoDaComposicao(p)) as { itens?: Array<Record<string, unknown>>; total?: number } | null
    if (!dados || !Array.isArray(dados.itens)) return composicaoLocal(cartoesLocais, p, 'corpo malformado')
    return {
      total: Number(dados.total ?? dados.itens.length),
      origemDaComposicao: 'servidor',
      itens: dados.itens.map((i: Record<string, unknown>) => ({
        cardId: (i.cardId as string) ?? null,
        word: String(i.word ?? ''),
        back: (i.back as string) ?? null,
        sentence: (i.sentence as string) ?? null,
        clozePrompt: (i.clozePrompt as string) ?? null,
        clozeAnswer: (i.clozeAnswer as string) ?? null,
        proveniencia: { ...(i.proveniencia as object), origemDaComposicao: 'servidor' } as Proveniencia,
      })),
    }
  } catch (e) {
    return composicaoLocal(cartoesLocais, p, String((e as Error)?.message ?? e).slice(0, 80))
  }
}

/**
 * O RECORTE FINAL DA RODADA — e a invariante que impede o defeito de voltar.
 *
 * O DEFEITO QUE ISTO CONSERTA. `Play.tsx` fazia assim:
 *
 *     if (composicao && composicao.itens.length) {
 *       const servidos = composicao.itens.map(i => porId.get(i.cardId)).filter(Boolean)
 *       if (servidos.length) return servidos      // ← `triagem.usaveis` nunca era consultada
 *     }
 *
 * Ou seja: quando o servidor respondia, a TRIAGEM INTEIRA era descartada. E o servidor selecionava
 * sem idioma e sem régua de qualidade. O resultado, medido no baralho real: praticando português,
 * dos 200 cartões servidos só 5 tinham tradução, enquanto o baralho tinha 323 palavras portuguesas
 * jogáveis. Os jogos ficavam cinza e a explicação estava a três arquivos de distância.
 *
 * A DIVISÃO DE TRABALHO que esta função estabelece:
 *   · **servidor** = seleção de CONJUNTO — escala, ordem estratégica, vencimento, faixa, idioma;
 *   · **cliente**  = RÉGUA — `triarCartoes`, e é ele quem corta no limite, POR ÚLTIMO.
 *
 * Levar a régua para SQL seria a alternativa, e é a errada: ela é regex, listas gramaticais por
 * idioma e deduplicação normalizada. Reimplementá-la em SQL criaria a segunda verdade contra a
 * qual `lib/langConfig.ts` avisa por experiência própria.
 *
 * A INVARIANTE, e é ela que vale o arquivo: **todo cartão devolvido está em `usaveis`.** A
 * composição ORDENA e PRIORIZA; ela nunca ADICIONA. Enquanto isso valer, o bypass não tem como
 * voltar sem quebrar o teste.
 */
export function recortarPelaComposicao<T extends { id: string }>(
  usaveis: T[],
  composicao: Composicao | null | undefined,
  opts: { completar: boolean },
): T[] {
  if (!composicao?.itens?.length) return usaveis

  const porId = new Map(usaveis.map((c) => [c.id, c]))
  const escolhidos: T[] = []
  const jaEntrou = new Set<string>()

  // 1) A ordem do servidor (vencido primeiro, faixa, estratégia) — mas só o que a régua aprovou.
  for (const item of composicao.itens) {
    if (!item.cardId) continue
    const carta = porId.get(item.cardId)
    if (!carta || jaEntrou.has(carta.id)) continue
    escolhidos.push(carta)
    jaEntrou.add(carta.id)
  }

  /**
   * 2) O RESTO DO ACERVO ENTRA ATRÁS — e é isto que conserta os "jogos cinza".
   *
   * A primeira versão desta função cortava em 200, o mesmo teto pedido ao servidor. Medido: com
   * `dueAt ASC`, os 200 primeiros são as capturas antigas nunca revisadas, que são justamente as
   * que têm frase e NÃO têm tradução. O orçamento inteiro se esgotava antes de chegar às palavras
   * que os jogos de par conseguem usar — praticando português, a Memória via 5 das 323 possíveis.
   *
   * A composição decide a ORDEM, não a MEMBRESIA. Quem limita o tamanho da rodada é cada jogo, com
   * o próprio `maxItems`; passar o acervo inteiro custa um `filter` por jogo e devolve à Memória as
   * 323 em vez de 5.
   *
   * `completar: false` quando há filtro de dificuldade: ali o recorte VEIO do servidor, e completar
   * encheria a rodada com cartões fora da faixa, apagando em silêncio o que a pessoa escolheu.
   */
  if (!opts.completar) return escolhidos

  for (const carta of usaveis) {
    if (jaEntrou.has(carta.id)) continue
    escolhidos.push(carta)
    jaEntrou.add(carta.id)
  }
  return escolhidos
}
