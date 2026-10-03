/**
 * PARTIR A TRADUÇÃO EM FRASES para a voz por frase (`vozDaNuvem.ts`, chave `vozPorFrase`): a primeira frase
 * começa a ser sintetizada e lida sem esperar as outras. Função pura.
 *
 * `Intl.Segmenter` ('sentence') quando existe — ele sabe de "Sr.", "3.5" e reticências melhor do que uma
 * regex —, e uma regex simples quando o navegador não o tem. Dois ajustes, ambos por custo e prosódia:
 *   - fragmento curto ("Sim.", "Ok.") cola na frase vizinha: cada frase é um pedido de síntese, e uma
 *     palavra solta soaria picotada;
 *   - no máximo `MAX_DE_FRASES`: o que passar disso vira a última frase (nenhum texto se perde).
 */

/** Menos que isto (caracteres) e a frase cola na vizinha. */
const MINIMO_DE_FRASE = 12;
/** Tetos de pedidos de síntese por tradução. */
const MAX_DE_FRASES = 8;

function segmentar(texto: string, lang: string): string[] {
  const Segmentador = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmentador) {
    try {
      return [...new Segmentador(lang || undefined, { granularity: 'sentence' }).segment(texto)].map((s) => s.segment);
    } catch {
      /* idioma que o Segmenter recusa: a regex abaixo */
    }
  }
  // Termina em . ! ? … (com fechamento de aspas/parêntese) seguido de espaço; o resto é a última frase.
  return texto.match(/[^.!?…]+(?:[.!?…]+["')\]”’]*(?:\s+|$)|$)/g) ?? [texto];
}

export function partirEmFrases(texto: string, lang: string): string[] {
  const brutas = segmentar(texto, lang)
    .map((s) => s.trim())
    .filter(Boolean);
  const frases: string[] = [];
  let pendente = '';
  for (const f of brutas) {
    // Cola o que está pendente (fragmento curto) na frase que chegou.
    const atual = pendente ? `${pendente} ${f}` : f;
    if (atual.length < MINIMO_DE_FRASE) pendente = atual;
    else {
      frases.push(atual);
      pendente = '';
    }
  }
  // Sobrou um fragmento curto no fim: cola na última frase (ou é a única).
  if (pendente) {
    if (frases.length) frases[frases.length - 1] = `${frases[frases.length - 1]} ${pendente}`;
    else frases.push(pendente);
  }
  if (frases.length > MAX_DE_FRASES) {
    const resto = frases.splice(MAX_DE_FRASES - 1);
    frases.push(resto.join(' '));
  }
  return frases;
}
