/**
 * "PRATICAR A CONVERSA" NO INTÉRPRETE — as regras puras (spec `docs/specs/2026-10-25-assistente-ao-vivo.md`, seção
 * "Praticar a conversa"). Com a prática ligada, a METADE da pessoa fala o idioma que ela aprende; a fala dela, nesse
 * idioma, é "você" e ganha a correção gentil pelas regras de sempre (`planejarChamadas`: só a própria fala, só fora do
 * idioma da pessoa, nunca a de lado incerto). A fala da outra pessoa nunca é corrigida.
 */
import type { RecursosDoAssistente } from './telaDoAssistente';

const base = (lang: string | undefined) => (lang || '').toLowerCase().split('-')[0];

/**
 * A prática cabe nesta conversa? `ok`; `detectar` (o idioma da outra pessoa ainda não foi escolhido: só o automático o
 * mede, e o automático não separa duas pessoas no mesmo idioma); `sem_idioma` (o idioma que a pessoa aprende falta, ou é
 * o dela).
 */
export type PraticaPossivel = 'ok' | 'detectar' | 'sem_idioma';

export function praticaPossivel(o: { meu: string; outro: string; aprende: string | undefined }): PraticaPossivel {
  if (!o.aprende || !base(o.aprende) || base(o.aprende) === base(o.meu)) return 'sem_idioma';
  if (!o.outro) return 'detectar';
  return 'ok';
}

/**
 * A correção da fala na prática: `ligada` (flag + plano pago ou teste + consentimento de nuvem), `sem_consentimento`
 * (a conta tem, falta autorizar a IA de nuvem) ou `indisponivel` (Grátis, convidado, ou o servidor recusou na sessão).
 * Com a flag desligada a prática nem aparece (a tela não chama isto).
 */
export type CorrecaoNaPratica = 'ligada' | 'sem_consentimento' | 'indisponivel';

export function correcaoNaPratica(r: Pick<RecursosDoAssistente, 'nuvem'>, consentiuNuvem: boolean): CorrecaoNaPratica {
  if (!r.nuvem) return 'indisponivel';
  return consentiuNuvem ? 'ligada' : 'sem_consentimento';
}

/** Escritas sem espaço entre palavras (chinês, japonês, tailandês, laosiano, khmer, birmanês). */
const ESCRITA_SEM_ESPACO =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

type Segmentador = new (
  l?: string,
  o?: { granularity: 'word' },
) => { segment: (t: string) => Iterable<{ segment: string; isWordLike?: boolean }> };

/**
 * As palavras de uma frase, para comparar (minúsculas, sem pontuação; todo apóstrofo vira o reto: "don't"). Nas escritas
 * sem espaço, pelo `Intl.Segmenter`; sem ele, `null` — a tela não compara o que não sabe partir.
 */
function palavras(s: string, lang: string | undefined): string[] | null {
  const texto = s.toLowerCase().replaceAll(/[’‘ʼ]/gu, "'");
  if (!ESCRITA_SEM_ESPACO.test(texto)) return texto.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
  const Segmenter = (Intl as unknown as { Segmenter?: Segmentador }).Segmenter;
  if (!Segmenter) return null;
  try {
    const lista: string[] = [];
    for (const seg of new Segmenter(lang || undefined, { granularity: 'word' }).segment(texto))
      if (seg.isWordLike) lista.push(seg.segment);
    return lista;
  } catch {
    return null;
  }
}

export interface ComparacaoComASugestao {
  /** A fala tem todas as palavras da sugestão (a ordem e as palavras a mais não contam: é uma conversa, não um ditado). */
  igual: boolean;
  /** As palavras da sugestão que não apareceram na fala, na ordem da sugestão (sem repetir), até 4. */
  faltaram: string[];
}

/**
 * "FALAR ESTA": a pessoa leu em voz alta uma sugestão do "Como respondo?". A tela compara o que o reconhecedor ouviu
 * com a sugestão, no aparelho (nada sai para a rede): diz as palavras que faltaram. A correção do servidor, se vier,
 * aparece junto, como em toda fala da pessoa. `null` = não dá para comparar aqui (escrita sem espaço, sem o
 * `Intl.Segmenter`): a tela não diz nada, em vez de afirmar o que não mediu.
 */
export function compararComASugestao(falado: string, sugestao: string, lang?: string): ComparacaoComASugestao | null {
  const ditas = palavras(falado, lang);
  const esperadas = palavras(sugestao, lang);
  if (!ditas || !esperadas || !esperadas.length) return null;
  const restantes = new Map<string, number>();
  for (const p of ditas) restantes.set(p, (restantes.get(p) ?? 0) + 1);
  const faltaram: string[] = [];
  for (const p of esperadas) {
    const n = restantes.get(p) ?? 0;
    if (n > 0) restantes.set(p, n - 1);
    else if (!faltaram.includes(p)) faltaram.push(p);
  }
  return { igual: faltaram.length === 0, faltaram: faltaram.slice(0, 4) };
}
