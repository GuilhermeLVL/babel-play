/**
 * DE ONDE O CLIENTE LÊ A VERSÃO DA CHAVE DE DUPLICATA (openspec `modelo-do-aluno-e-dados`, 5.4).
 *
 * Com servidor: a flag `chave_dedup_v2` (`GET /api/flags`, a mesma que o servidor segue em `versaoDaChaveDedup()`).
 * Edição estática: não há servidor de flags, então vale o build (`VITE_CHAVE_DEDUP_V2=1`), DESLIGADO por padrão. NÃO
 * LIGUE no build estático enquanto o IndexedDB não migrar (5.4 segue aberta para a edição estática: `normKey` e as
 * marcadas de `data/efemero` ficam na v1).
 */
import { FLAG_CHAVE_DEDUP_V2 } from '../core/planos';
import { registrarVersaoDaChave } from '../core/texto/chaveAtiva';
import type { VersaoDaChaveDedup } from '../core/texto/palavra';
import { edicaoEstatica } from './edicaoEstatica';
import { flagLigada } from './flagsCache';

export function chaveDedupV2Ativa(ctx: {
  edicaoEstatica: boolean;
  /** `import.meta.env.VITE_CHAVE_DEDUP_V2` do build. */
  envDoBuild: string | undefined;
  /** `flagLigada('chave_dedup_v2')`, do cache de `GET /api/flags`. */
  flagDoServidor: boolean;
}): boolean {
  return ctx.edicaoEstatica ? ctx.envDoBuild === '1' : ctx.flagDoServidor;
}

/** Síncrono: lê o cache das flags. */
export function versaoDaChaveDoCliente(): VersaoDaChaveDedup {
  return chaveDedupV2Ativa({
    edicaoEstatica: edicaoEstatica(),
    envDoBuild: import.meta.env?.VITE_CHAVE_DEDUP_V2,
    flagDoServidor: flagLigada(FLAG_CHAVE_DEDUP_V2),
  })
    ? 2
    : 1;
}

/** Chamado uma vez no boot (`main.tsx`). */
export function ligarAVersaoDaChave(): void {
  registrarVersaoDaChave(versaoDaChaveDoCliente);
}
