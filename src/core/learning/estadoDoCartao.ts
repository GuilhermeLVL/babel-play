/**
 * O ESTADO DE UM CARTÃO — nova, aprendida (aprendendo) ou dominada. Uma régua só para a moldura do
 * cartão (`src/lib/pelesDeCartao.ts`) e para o histórico da palavra no servidor
 * (`GET /api/vocab/palavra`), que antes não tinha como dizer o mesmo que a tela.
 *
 * Nada é calculado de novo aqui:
 *   · a FASE do FSRS sai da linha do banco pela regra que o cliente sempre usou (`fsrsStateOf` de
 *     `src/data/rotas/vocabulario.ts`): sem estabilidade é `New`; com menos de 2 revisões, `Learning`;
 *     depois, `Review`;
 *   · `dominada` é fase `Review` E a retenção de agora (`retrievability`) acima do corte de domínio da
 *     fluência (`RETENCAO_DE_DOMINIO`) — o mesmo "isto está sustentado" do rótulo de nível;
 *   · o resto (Learning, Relearning, Review que está escapando) é `aprendida`.
 */
/* Direto dos módulos, e não do barril: o corte vem de `dominio.ts` para não trazer a wordlist de
   `fluencia.ts` ao arranque (a pele é lida no grafo de `equipar`). */
import { RETENCAO_DE_DOMINIO } from './dominio';
import { retrievability } from './scheduler';

export type FaseFsrs = 'New' | 'Learning' | 'Review' | 'Relearning';

export type EstadoDoCartao = 'nova' | 'aprendida' | 'dominada';

const DIA = 86_400_000;

/** A fase do FSRS de uma linha de `vocab_cards` (a mesma regra de `fsrsStateOf` no cliente). */
export function fsrsStateDaLinha(row: { stability?: number | null; reps?: number | null }): FaseFsrs {
  if (row.stability == null) return 'New';
  return (row.reps ?? 0) < 2 ? 'Learning' : 'Review';
}

export interface CartaoParaEstado {
  fsrsState: FaseFsrs;
  fsrsStability?: number | null;
  stability?: number | null;
  lastReview?: number | null;
}

export function estadoDoCartao(c: CartaoParaEstado, agora: number = Date.now()): EstadoDoCartao {
  if (c.fsrsState === 'New') return 'nova';
  if (c.fsrsState !== 'Review') return 'aprendida';
  const estabilidade = c.fsrsStability || c.stability || 0;
  if (estabilidade <= 0) return 'aprendida';
  const dias = c.lastReview ? Math.max(0, (agora - c.lastReview) / DIA) : 0;
  return retrievability(dias, estabilidade) >= RETENCAO_DE_DOMINIO ? 'dominada' : 'aprendida';
}
