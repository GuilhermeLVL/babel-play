/**
 * AVISO DE "SEM VOZ NESTE IDIOMA": discreto e UMA vez por idioma por carregamento — quem joga uma rodada inteira em
 * japonês sem voz instalada não precisa de dez avisos iguais. Quem mostra é quem se inscreve (o `Toast`).
 *
 * Mora fora de `tts.ts` e sem dependências de propósito: o `Toast` está no JS inicial e se inscreve ao carregar, e
 * importar `tts.ts` só para isso puxava o motor de voz inteiro (com a escolha da melhor voz) para o caminho inicial
 * (orçamento do bundle). `tts.ts` reexporta as duas funções; quem já as usava não muda.
 */
const semVozAvisado = new Set<string>();
const ouvintesDeSemVoz = new Set<(lang: string) => void>();

/** Inscreve quem mostra o aviso de que falta voz para um idioma. Devolve o cancelamento. */
export function aoFaltarVoz(cb: (lang: string) => void): () => void {
  ouvintesDeSemVoz.add(cb);
  return () => {
    ouvintesDeSemVoz.delete(cb);
  };
}

/** Avisa (uma vez por idioma) que a fala foi omitida por falta de voz aceita. Para quem monta a própria fala. */
export function avisarSemVoz(lang: string): void {
  const base = lang.toLowerCase().split('-')[0];
  console.warn('[tts] sem voz instalada para', lang, '— a fala foi omitida em vez de sair com voz de outro idioma.');
  if (semVozAvisado.has(base)) return;
  semVozAvisado.add(base);
  for (const cb of ouvintesDeSemVoz) cb(lang);
}
