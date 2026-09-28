/**
 * RECOMPENSAS v2 NO CLIENTE — a flag e o reembolso do corte do catálogo (Tasks 2.3 e 2.4).
 *
 * A FLAG `recompensas_v2` (`src/core/flags.ts`): no app com servidor ela vem de `GET /api/flags`
 * (nasce DESLIGADA na migração); na edição estática não há servidor, e quem liga é o build
 * (`VITE_RECOMPENSAS_V2=1`, a onda 5 acende).
 *
 * O REEMBOLSO: uma vez por sessão, com a flag ligada, o cliente pede `POST
 * /api/metrics/seeds/reembolso` — o servidor decide o que é devido a partir do próprio razão. O
 * aviso "Trocamos os cursores e emojis por recompensas novas. Suas Seeds voltaram: +N" aparece
 * quando o SERVIDOR diz que ainda falta avisar (`avisoPendente`), com o que entrou AGORA
 * (`creditado`) — não por aparelho, nem com o total da vida. Servidor antigo, sem o campo: o
 * comportamento anterior (uma vez por instalação, `babel.aviso_reembolso_v2`, com o total).
 */
import { FLAG_RECOMPENSAS_V2, recompensasV2Ativas } from '../core/flags';
import { reembolsarSeeds } from '../data/api';
import { edicaoEstatica } from './edicaoEstatica';
import { flagLigada } from './flagsCache';

/** A flag, com a regra da edição estática. Síncrono: lê o cache das flags. */
export function recompensasV2Ligadas(): boolean {
  return recompensasV2Ativas({
    edicaoEstatica: edicaoEstatica(),
    envDoBuild: import.meta.env?.VITE_RECOMPENSAS_V2,
    flagDoServidor: flagLigada(FLAG_RECOMPENSAS_V2),
  });
}

export const CHAVE_DO_AVISO_DE_REEMBOLSO = 'babel.aviso_reembolso_v2';

let pedidoDestaSessao: Promise<number | null> | null = null;

/**
 * Pede o reembolso uma vez por sessão (duas chamadas dividem o mesmo pedido). Devolve o total
 * reembolsado a ANUNCIAR — `null` quando não há nada a dizer (flag desligada, falha, nada devido
 * ou aviso já mostrado antes).
 */
export function reembolsarUmaVez(): Promise<number | null> {
  if (!recompensasV2Ligadas()) return Promise.resolve(null);
  pedidoDestaSessao ??= reembolsarSeeds().then((r) => {
    if (!r) return null;
    /* O servidor sabe se o aviso já foi dado (em qualquer aparelho): ele manda. */
    if (typeof r.avisoPendente === 'boolean') return r.avisoPendente && r.creditado > 0 ? r.creditado : null;
    // Servidor antigo: uma vez por instalação, com o total reembolsado.
    if (r.reembolsado <= 0) return null;
    try {
      if (localStorage.getItem(CHAVE_DO_AVISO_DE_REEMBOLSO)) return null;
      localStorage.setItem(CHAVE_DO_AVISO_DE_REEMBOLSO, String(r.reembolsado));
    } catch {
      /* sem storage: o aviso pode repetir noutra sessão, e o crédito continua sendo um só */
    }
    return r.reembolsado;
  });
  return pedidoDestaSessao;
}

/** Só para teste: esquece o pedido desta sessão. */
export function _reiniciarReembolsoDaSessao(): void {
  pedidoDestaSessao = null;
}
