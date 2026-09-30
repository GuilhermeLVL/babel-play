/**
 * O EXECUTOR DO "POLIR A SESSÃO" (D5 da Fase D) — a fila de blocos que a Análise percorre.
 *
 * O servidor polia UM bloco por pedido (`POST /api/ai/mt/polir`, `server/ai/polimento.ts`), e quem
 * anda pelos blocos é o cliente: assim o progresso é real ("bloco 2 de 5"), cancelar é não pedir o
 * próximo, e nenhum pedido segura a conexão por minutos.
 *
 * OS MESMOS BLOCOS DO SERVIDOR: a contagem usa `blocosDoPolimento` (`promptDoPolimento.ts`), a mesma
 * função que monta o bloco lá. Um bloco é PENDENTE quando tem fala sem polida; retomar é rodar a fila
 * de novo com as falas já atualizadas — os completos nem são pedidos. E se a tela estiver desatualizada,
 * o servidor responde o que já guardou sem cobrar (a idempotência é dele; aqui é só economia de ida).
 *
 * CANCELAR não aborta o bloco que já foi ao provedor: ele foi pago, então o que voltar ainda é entregue
 * (`aoPolir`), e a fila para antes do próximo.
 *
 * Carregado junto com a tela do polimento (`views/analise/PolirSessao.tsx`, por `lazy()`): nada disto
 * entra no JS inicial.
 */
import type { FalhaDaNuance, PolidaDaFala, PolimentoDoBloco, ResultadoDaNuance } from '../../data/apiDaNuance';
import { blocosDoPolimento, type LinhaDoPolimento } from '../traducao/promptDoPolimento';

/** Uma fala da sessão como a Análise a tem (`UtteranceRow`), no que o polimento precisa. */
export interface FalaParaPolir {
  id: string;
  idx?: number | null;
  sourceText: string | null;
  translatedText: string | null;
  traducaoPolida?: string | null;
}

interface LinhaComPolida extends LinhaDoPolimento {
  polida: boolean;
}

/** As falas na ordem do servidor (`idx`), no formato dos blocos. */
function linhasDaSessao(falas: ReadonlyArray<FalaParaPolir>): LinhaComPolida[] {
  return [...falas]
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((f) => ({
      id: f.id,
      original: f.sourceText ?? '',
      traducao: f.translatedText ?? '',
      polida: !!f.traducaoPolida,
    }));
}

export interface ContagemDoPolimento {
  /** Quantos blocos a sessão tem. */
  total: number;
  /** Quantos já estão inteiros polidos. */
  completos: number;
  /** Os números dos blocos com alguma fala sem polida, em ordem. */
  pendentes: number[];
  /** Falas que entram no polimento, e quantas delas já têm polida. */
  linhasPolidaveis: number;
  linhasPolidas: number;
}

export function contarPolimento(falas: ReadonlyArray<FalaParaPolir>): ContagemDoPolimento {
  const blocos = blocosDoPolimento(linhasDaSessao(falas));
  const pendentes = blocos.flatMap((b, k) => (b.some((l) => !l.polida) ? [k] : []));
  const linhas = blocos.flat();
  return {
    total: blocos.length,
    completos: blocos.length - pendentes.length,
    pendentes,
    linhasPolidaveis: linhas.length,
    linhasPolidas: linhas.filter((l) => l.polida).length,
  };
}

export interface ProgressoDoPolimento {
  /** O bloco sendo polido agora; `null` quando a fila terminou. */
  bloco: number | null;
  /** Blocos concluídos (os que já estavam e os desta vez). */
  feitos: number;
  total: number;
}

export type FimDoPolimento = { fim: 'pronto' } | { fim: 'cancelado' } | { fim: 'erro'; motivo: FalhaDaNuance };

export async function polirSessao(o: {
  utterances: ReadonlyArray<FalaParaPolir>;
  pedirBloco: (bloco: number) => Promise<ResultadoDaNuance<PolimentoDoBloco>>;
  /** As polidas de um bloco, para a tela aplicar (a original não muda). */
  aoPolir: (polidas: ReadonlyArray<PolidaDaFala>) => void;
  aoAvancar: (p: ProgressoDoPolimento) => void;
  sinal: AbortSignal;
}): Promise<FimDoPolimento> {
  const { total, completos, pendentes } = contarPolimento(o.utterances);
  let feitos = completos;
  for (const bloco of pendentes) {
    if (o.sinal.aborted) return { fim: 'cancelado' };
    o.aoAvancar({ bloco, feitos, total });
    const r = await o.pedirBloco(bloco);
    if (r.ok) o.aoPolir(r.valor.polidas);
    if (o.sinal.aborted) return { fim: 'cancelado' };
    if (r.ok === false) return { fim: 'erro', motivo: r.motivo };
    feitos++;
  }
  o.aoAvancar({ bloco: null, feitos, total });
  return { fim: 'pronto' };
}
