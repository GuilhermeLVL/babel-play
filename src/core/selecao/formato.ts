/**
 * O FORMATO "LACUNA" E A FRASE DA VEZ (openspec `cartoes`, 3.2). Puro.
 *
 * Lacuna: a frente mostra a frase com a palavra escondida e a tradução como pista; só vale quando a frase TEM a
 * palavra (inteira) e sobra texto em volta. Sem isso o cartão fica no formato normal (nunca um vão vazio).
 * Alternar a frase: a cada revisão do cartão, a frase seguinte da lista (a lista vem das ocorrências do cartão).
 */

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A frase tem a palavra para esconder, com texto em volta? */
export function lacunaValida(frase: string | undefined | null, palavra: string): boolean {
  const f = (frase ?? '').trim();
  const p = palavra.trim();
  if (!f || !p) return false;
  if (!new RegExp(`(^|[^\\p{L}])${escRe(p)}(?![\\p{L}])`, 'iu').test(f)) return false;
  /* Sobra algo além da própria palavra: uma lacuna que é a frase toda não ensina nada. */
  return f.replace(new RegExp(escRe(p), 'iu'), '').replace(/[\s\p{P}]/gu, '').length > 0;
}

/** O formato do cartão: `lacuna` só com a opção ligada, o tipo "lembrar" e uma lacuna válida. */
export function formatoDoCartao(e: {
  lacunaLigada: boolean;
  tipo: 'lembrar' | 'digitar' | 'escolha';
  frase: string | undefined | null;
  palavra: string;
}): 'lacuna' | 'normal' {
  return e.lacunaLigada && e.tipo === 'lembrar' && lacunaValida(e.frase, e.palavra) ? 'lacuna' : 'normal';
}

/** A frase desta revisão: a lista gira conforme o número de revisões já feitas do cartão. Lista vazia: `''`. */
export function fraseDaRevisao(frases: readonly string[], revisoesFeitas: number): string {
  const l = frases.filter((f) => f.trim());
  if (!l.length) return '';
  return l[Math.max(0, Math.floor(revisoesFeitas)) % l.length];
}
