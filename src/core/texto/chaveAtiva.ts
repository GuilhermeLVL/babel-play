/**
 * A CHAVE DA VERSÃO ATIVA NO CLIENTE (openspec `modelo-do-aluno-e-dados`, tarefa 5.4).
 *
 * O servidor guarda `norm_key`, `palavras_marcadas.chave` e `palavras_vistas.chave` na versão que a flag
 * `chave_dedup_v2` manda (`versaoDaChaveDedup()`): v1 (`chaveDaPalavra`, tira toda marca) ou v2 (`chaveDaPalavraV2`,
 * mantém ñ, ô/õ/ç, ü, ù/û/ï…). O cliente compara as palavras da tela com essas chaves, então tem de montá-las na MESMA
 * versão — senão a marcada `año` (es) não casa com o `año` da legenda.
 *
 * Este módulo só guarda DE ONDE vem a versão; quem a decide (flag remota, `VITE_` da edição estática) é
 * `lib/versaoDaChave.ts`, que se registra no boot. Sem registro a versão é 1, igual a hoje: o núcleo continua sem
 * rede, sem DOM e sem armazenamento.
 */
import { chaveDaPalavraNaVersao, chaveDedup, type VersaoDaChaveDedup } from './palavra';

let provedor: () => VersaoDaChaveDedup = () => 1;

/** O boot diz de onde ler a versão. `null` volta ao padrão (1), para os testes. */
export function registrarVersaoDaChave(fonte: (() => VersaoDaChaveDedup) | null): void {
  provedor = fonte ?? (() => 1);
}

export function versaoAtivaDaChave(): VersaoDaChaveDedup {
  return provedor();
}

/** A chave comparável da palavra no idioma, na versão ativa (a que o servidor grava em marcadas, vistas e `norm_key`). */
export function chaveAtiva(palavra: string | undefined | null, lang: string | undefined | null): string {
  return chaveDaPalavraNaVersao(palavra, lang, provedor());
}

/** `lang|chave` na versão ativa: o `norm_key` do cartão. */
export function chaveDedupAtiva(palavra: string | undefined | null, lang: string | undefined | null): string {
  return chaveDedup(palavra, lang, provedor());
}
