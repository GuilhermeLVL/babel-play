/**
 * AS PALAVRAS MARCADAS SEM CARTÃO — "Já sei" e "Ignorar" (openspec `vocab-conhecidas-e-ignoradas`; o LingQ chama de
 * "Known" e "Ignore"). Regra pura: sem rede, sem DOM, sem armazenamento.
 *
 *  - `conhecida`: a pessoa já sabe a palavra. Não vira cartão, não entra em revisão, conta no "Palavras que você
 *    conhece" e na cobertura de um texto. Na legenda não pinta nada (como `dominada`).
 *  - `ignorada`: nome, ruído, palavra que não interessa. Não pinta nada, nunca ganha o ponto "nova para você" e NÃO
 *    conta como conhecida.
 *
 * PRECEDÊNCIA (a mesma em todo lugar): o CARTÃO do caderno manda; só sem cartão vale a marcação; só sem as duas vem o
 * ponto "nova para você". Uma palavra salva (cartão novo) e marcada como "Já sei" continua `salva` e não conta como
 * conhecida até o cartão avançar: quem decide é o caderno, onde a pessoa estuda de verdade.
 *
 * OS MARCOS SÃO POR RESULTADO (quantas palavras a pessoa conhece), NUNCA por tempo: nada de sequência de dias, prazo
 * ou "volte amanhã" (Decreto 12.880/2026, art. 9º; o mesmo cuidado de `src/core/missoes.ts`).
 */
import { baseLang } from '../texto/idioma';
import { chaveDaPalavra } from '../texto/palavra';
import { estadoNoCaderno, FORCA_QUE_APAGA_A_GLOSA, type IndiceDeForcas, type IndiceDoCaderno } from './etiquetas';

export const ESTADOS_DA_MARCACAO = ['conhecida', 'ignorada'] as const;
export type EstadoDaMarcacao = (typeof ESTADOS_DA_MARCACAO)[number];

/** Quantas palavras marcadas uma conta guarda (o servidor recusa marcação NOVA acima disto; trocar o estado vale). */
export const TETO_DE_MARCADAS = 20_000;

/** Uma marcação como a rota e o espelho sem conta a devolvem. */
export interface PalavraMarcada {
  /** O idioma BASE (`en`, não `en-US`). */
  lang: string;
  /** `chaveDaPalavra`: sem acento, sem caixa, sem pontuação. */
  chave: string;
  estado: EstadoDaMarcacao;
  atualizadoEm: number;
}

export function ehEstadoDaMarcacao(v: unknown): v is EstadoDaMarcacao {
  return v === 'conhecida' || v === 'ignorada';
}

/** As marcações por idioma-base: `lang → chave → estado`. */
export type IndiceDeMarcadas = ReadonlyMap<string, ReadonlyMap<string, EstadoDaMarcacao>>;

export function montarIndiceDeMarcadas(
  marcadas: Iterable<{ lang: string; chave: string; estado: EstadoDaMarcacao }>,
): IndiceDeMarcadas {
  const indice = new Map<string, Map<string, EstadoDaMarcacao>>();
  for (const m of marcadas) {
    const idioma = baseLang(m.lang);
    const chave = chaveDaPalavra(m.chave);
    if (!idioma || !chave || !ehEstadoDaMarcacao(m.estado)) continue;
    let balde = indice.get(idioma);
    if (!balde) indice.set(idioma, (balde = new Map()));
    balde.set(chave, m.estado);
  }
  return indice;
}

/** A marcação da chave no idioma (sem balde "sem idioma": marcar exige saber o idioma). */
export function estadoMarcado(
  indice: IndiceDeMarcadas | null | undefined,
  chave: string,
  lang: string | undefined,
): EstadoDaMarcacao | undefined {
  if (!indice || !chave) return undefined;
  return indice.get(baseLang(lang))?.get(chave);
}

/**
 * As chaves que a pessoa CONHECE num idioma: as `aprendendo`/`dominada` do caderno mais as marcadas `conhecida` sem
 * cartão. Um conjunto, então a mesma palavra nunca conta duas vezes. `incluirSemIdioma` soma o balde dos cartões sem
 * idioma (a cobertura de um texto aceita; a CONTAGEM por idioma não, senão o mesmo cartão contaria em todo idioma).
 */
export function chavesConhecidas(
  caderno: IndiceDoCaderno | null | undefined,
  marcadas: IndiceDeMarcadas | null | undefined,
  lang: string,
  o: { incluirSemIdioma?: boolean } = {},
): Set<string> {
  const idioma = baseLang(lang);
  const conhecidas = new Set<string>();
  const baldes = o.incluirSemIdioma ? [caderno?.get(idioma), caderno?.get('')] : [caderno?.get(idioma)];
  for (const balde of baldes) {
    for (const [chave, estado] of balde ?? []) if (estado !== 'nova') conhecidas.add(chave);
  }
  for (const [chave, estado] of marcadas?.get(idioma) ?? []) {
    // O cartão manda: com cartão (em qualquer estado), a marcação não decide.
    if (estado === 'conhecida' && !estadoNoCaderno(caderno ?? null, chave, idioma)) conhecidas.add(chave);
  }
  return conhecidas;
}

/**
 * As chaves "conhecidas" para a GLOSA do leitor com a flag `forca_na_legenda`: cartão só conta com força
 * >= `FORCA_QUE_APAGA_A_GLOSA` (3); "Já sei" sem cartão conta na hora. `chavesConhecidas` e `contarConhecidas`
 * NÃO mudam (decisão do dono: os números que a pessoa já viu ficam como estão).
 */
export function chavesConhecidasPorForca(
  caderno: IndiceDoCaderno | null | undefined,
  forcas: IndiceDeForcas | null | undefined,
  marcadas: IndiceDeMarcadas | null | undefined,
  lang: string,
  o: { incluirSemIdioma?: boolean } = {},
): Set<string> {
  const idioma = baseLang(lang);
  const conhecidas = new Set<string>();
  const baldes = o.incluirSemIdioma ? [forcas?.get(idioma), forcas?.get('')] : [forcas?.get(idioma)];
  for (const balde of baldes) {
    for (const [chave, forca] of balde ?? []) if (forca >= FORCA_QUE_APAGA_A_GLOSA) conhecidas.add(chave);
  }
  for (const [chave, estado] of marcadas?.get(idioma) ?? []) {
    if (estado === 'conhecida' && !estadoNoCaderno(caderno ?? null, chave, idioma)) conhecidas.add(chave);
  }
  return conhecidas;
}

/** Quantas palavras a pessoa conhece no idioma (caderno aprendendo/dominada + "Já sei" sem cartão, sem duplicar). */
export function contarConhecidas(
  caderno: IndiceDoCaderno | null | undefined,
  marcadas: IndiceDeMarcadas | null | undefined,
  lang: string,
): number {
  return chavesConhecidas(caderno, marcadas, lang).size;
}

/** Os idiomas com alguma palavra conhecida, do que tem mais para o que tem menos. */
export function contagemPorIdioma(
  caderno: IndiceDoCaderno | null | undefined,
  marcadas: IndiceDeMarcadas | null | undefined,
): Array<{ lang: string; conhecidas: number }> {
  const idiomas = new Set<string>([...(caderno?.keys() ?? []), ...(marcadas?.keys() ?? [])]);
  idiomas.delete('');
  return [...idiomas]
    .map((lang) => ({ lang, conhecidas: contarConhecidas(caderno, marcadas, lang) }))
    .filter((l) => l.conhecidas > 0)
    .sort((a, b) => b.conhecidas - a.conhecidas || a.lang.localeCompare(b.lang));
}

/** Os marcos de palavras conhecidas. Por RESULTADO, nunca por tempo. */
export const MARCOS_DE_PALAVRAS = [100, 250, 500, 1000, 2000, 3000, 5000, 8000] as const;

export interface ProgressoDoMarco {
  /** O maior marco já alcançado, ou `null` antes do primeiro. */
  alcancado: number | null;
  /** O próximo marco, ou `null` depois do último. */
  proximo: number | null;
  /** Quantas palavras faltam para o próximo (0 depois do último). */
  faltam: number;
  /** De 0 a 1: o caminho do marco alcançado (ou de zero) até o próximo. 1 depois do último. */
  fracao: number;
}

export function progressoDoMarco(conhecidas: number): ProgressoDoMarco {
  const n = Math.max(0, Math.floor(conhecidas));
  let alcancado: number | null = null;
  let proximo: number | null = null;
  for (const m of MARCOS_DE_PALAVRAS) {
    if (m <= n) alcancado = m;
    else {
      proximo = m;
      break;
    }
  }
  if (proximo === null) return { alcancado, proximo, faltam: 0, fracao: 1 };
  const base = alcancado ?? 0;
  return { alcancado, proximo, faltam: proximo - n, fracao: (n - base) / (proximo - base) };
}
