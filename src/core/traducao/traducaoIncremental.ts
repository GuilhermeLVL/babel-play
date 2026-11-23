/**
 * TRADUÇÃO INCREMENTAL DO PARCIAL (change `parciais-incrementais`, V3 `traducao_incremental`, design D6).
 *
 * Função PURA. O parcial traduz só o prefixo CONFIRMADO da origem (LocalAgreement-2); a tradução de um prefixo
 * ainda não final muda nas últimas palavras quando o prefixo cresce (Arivazhagan et al., arXiv:2004.03643), então:
 *   - MASK-K: esconde as `k` últimas palavras da tradução (k = 2 é PROVISÓRIO, a confirmar pelo dono);
 *   - SEM REGREDIR: o que já foi mostrado só some ou muda quando a nova hipótese traz tanto quanto ele
 *     (prefixo que apenas encolhe, ou troca que mostra menos, mantém o texto anterior).
 *
 * Palavra = a mesma regra de `src/core/legendas/medidasDeParcial.ts` (letras/números; escritas sem espaço contam um
 * caractere por palavra), para a medida de erasure da bancada e o corte daqui concordarem.
 * O FINAL da fala não passa por aqui: ele é a tradução de sempre e substitui a provisória.
 */
import { tokenizar } from '../legendas/medidasDeParcial';

/** k do mask-k: palavras finais da tradução que ficam escondidas num prefixo não final. PROVISÓRIO. */
export const K_DO_MASK = 2;

const SEM_ESPACO =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u;

/** Posição (índice do fim, exclusivo) de cada palavra do texto, na mesma contagem de `tokenizar`. */
function fimDasPalavras(texto: string): number[] {
  const fins: number[] = [];
  for (const m of texto.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const inicio = m.index ?? 0;
    let corrido = 0;
    let naPalavra = false;
    for (const ch of m[0]) {
      const fim = inicio + corrido + ch.length;
      if (SEM_ESPACO.test(ch)) {
        if (naPalavra) naPalavra = false;
        fins.push(fim);
      } else if (naPalavra) {
        fins[fins.length - 1] = fim;
      } else {
        fins.push(fim);
        naPalavra = true;
      }
      corrido += ch.length;
    }
  }
  return fins;
}

/** Remove as `k` últimas palavras do texto (e a pontuação que sobra no fim). `k <= 0` devolve o texto aparado. */
function esconderUltimasPalavras(texto: string, k: number): string {
  const t = texto.trim();
  if (k <= 0) return t;
  const fins = fimDasPalavras(t);
  const sobram = fins.length - k;
  if (sobram <= 0) return '';
  return t
    .slice(0, fins[sobram - 1])
    .trimEnd()
    .replace(/[\s,;:]+$/u, '');
}

const ehPrefixo = (curto: string[], longo: string[]): boolean =>
  curto.length <= longo.length && curto.every((p, i) => p === longo[i]);

export interface EntradaDaTraducaoIncremental {
  /** O prefixo CONFIRMADO da origem que foi traduzido. Vazio = nada a mostrar de novo. */
  confirmado: string;
  /** O que a tela já mostra da tradução desta fala (`''` se nada). */
  anterior: string;
  /** A nova hipótese de tradução do `confirmado`. */
  nova: string;
  /** Palavras finais escondidas (padrão `K_DO_MASK`). */
  k?: number;
  /** O prefixo é a fala inteira já fechada: sem máscara. Padrão `false`. */
  final?: boolean;
}

/**
 * O texto de tradução que o parcial mostra agora. Devolve `anterior` (a MESMA string) quando nada deve mudar na tela.
 */
export function traducaoIncremental(e: EntradaDaTraducaoIncremental): string {
  if (!e.confirmado.trim()) return e.anterior;
  const visivel = esconderUltimasPalavras(e.nova, e.final ? 0 : (e.k ?? K_DO_MASK));
  const novas = tokenizar(visivel);
  if (novas.length === 0) return e.anterior;
  const antigas = tokenizar(e.anterior);
  // Cresce (ou repete): o anterior continua firme na frente.
  if (ehPrefixo(antigas, novas)) return novas.length === antigas.length ? e.anterior : visivel;
  // Só encolhe: não regride.
  if (ehPrefixo(novas, antigas)) return e.anterior;
  // Troca: só vale se a nova hipótese mostra ao menos tanto quanto o que já estava na tela.
  return novas.length >= antigas.length ? visivel : e.anterior;
}
