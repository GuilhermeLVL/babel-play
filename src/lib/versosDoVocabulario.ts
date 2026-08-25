/**
 * OS VERSOS DOS CARTÕES, sem prender o usuário na tela.
 *
 * O salvamento de uma sessão traduzia palavra por palavra num laço SEQUENCIAL:
 *
 *     for (const s of segs)            // ~40 falas
 *       for (const w of s.words)       // ~10 palavras cada
 *         back = await gateway.mt.translate(w)   // uma chamada de rede por palavra
 *
 * Centenas de idas e voltas em série, e só depois de TODAS elas o `onSave()` liberava a
 * interface. Enquanto isso a pessoa não conseguia iniciar outra captura nem sair da tela.
 *
 * E o caso patológico é justamente o mais comum quando não há tradutor configurado: com todos
 * os disjuntores abertos, CADA chamada ainda paga a tentativa antes de estourar `NoRouteError`.
 * Quanto pior a situação do tradutor, mais tempo a espera — exatamente ao contrário do que
 * deveria acontecer.
 *
 * Três correções, e a primeira é a que importa:
 *
 *  1. DESISTÊNCIA. Rota de tradução não aparece no meio de um laço. Se a primeira chamada falha
 *     por ausência de rota, as outras vão falhar igual: para tudo e devolve o que tem. É a
 *     diferença entre esperar uma falha e esperar seiscentas.
 *  2. CONCORRÊNCIA LIMITADA em vez de estritamente serial, para o caso em que o tradutor existe.
 *  3. TETO de palavras traduzidas por sessão, DECLARADO no resultado. Sem ele, uma sessão longa
 *     sempre será lenta, por mais eficiente que cada chamada seja.
 *
 * O cartão sem verso continua sendo gravado — o produto já sabe exibir "sem tradução" com
 * honestidade, e é melhor que travar a tela.
 */

export interface PedidoDeVerso {
  word: string
  src: string
  tgt: string
}

export interface ResultadoDosVersos {
  /** Verso por palavra (chave em minúsculas). Ausente = não traduzida. */
  versos: Map<string, string>
  /** Quantas foram efetivamente traduzidas. */
  traduzidas: number
  /** Por que paramos antes do fim, quando paramos. Vai para a mensagem ao usuário. */
  motivo: 'completo' | 'sem-rota' | 'teto' | null
  /** Quantas ficaram sem verso por causa da parada. */
  naoTentadas: number
}

/** Erro de "não existe rota para esta capacidade" — desistir dele é seguro e é o ponto. */
export function ehFaltaDeRota(e: unknown): boolean {
  const nome = (e as { name?: string } | null)?.name
  const msg = String((e as { message?: string } | null)?.message ?? '')
  return nome === 'NoRouteError' || /sem rota dispon[ií]vel/i.test(msg)
}

/**
 * Traduz os versos com desistência rápida, concorrência limitada e teto declarado.
 *
 * @param traduzir  normalmente `gateway.mt.translate`
 * @param teto      máximo de palavras traduzidas nesta sessão
 * @param paralelas quantas chamadas simultâneas
 */
export async function traduzirVersos(
  pedidos: PedidoDeVerso[],
  traduzir: (texto: string, de: string, para: string) => Promise<{ text?: string }>,
  { teto = 120, paralelas = 6 }: { teto?: number; paralelas?: number } = {},
): Promise<ResultadoDosVersos> {
  const versos = new Map<string, string>()
  if (!pedidos.length) return { versos, traduzidas: 0, motivo: null, naoTentadas: 0 }

  const fila = pedidos.slice(0, teto)
  let motivo: ResultadoDosVersos['motivo'] = pedidos.length > teto ? 'teto' : 'completo'
  let semRota = false
  let proximo = 0
  let processadas = 0

  const trabalhador = async () => {
    while (true) {
      // A desistência é checada A CADA item, não só no início: assim que UMA chamada prova que
      // não há rota, os outros trabalhadores param na próxima volta em vez de drenar a fila.
      if (semRota) return
      const i = proximo++
      if (i >= fila.length) return
      const p = fila[i]
      try {
        const r = await traduzir(p.word, p.src, p.tgt)
        processadas++
        if (r?.text) versos.set(p.word.toLowerCase(), r.text)
      } catch (e) {
        processadas++
        if (ehFaltaDeRota(e)) { semRota = true; motivo = 'sem-rota'; return }
        // Falha pontual (rede, limite de uso): a palavra fica sem verso e a fila continua.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(paralelas, fila.length) }, trabalhador))

  return {
    versos,
    traduzidas: versos.size,
    motivo,
    naoTentadas: pedidos.length - processadas,
  }
}

/** Frase curta para a tela, quando a tradução parou antes do fim. Vazia quando completou. */
export function explicarParada(r: ResultadoDosVersos): string {
  if (r.motivo === 'sem-rota') {
    return `${r.naoTentadas} sem tradução: nenhum tradutor disponível`
  }
  if (r.motivo === 'teto') {
    return `${r.naoTentadas} sem tradução: teto de ${r.traduzidas + r.naoTentadas > 0 ? r.versos.size : 0} por sessão`
  }
  return ''
}
