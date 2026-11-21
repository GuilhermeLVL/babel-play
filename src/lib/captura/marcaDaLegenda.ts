/**
 * O QUADRO QUE PINTA A TRADUÇÃO FINAL (`frasy:legenda:traduzida`, D1 de `lab-medicao-legenda-traduzida`).
 *
 * O fim da medida de latência não é a resposta da tradução, é a tela: o primeiro quadro pintado (`requestAnimationFrame`
 * depois do commit do React) em que o balão `id` já mostra a tradução FINAL. Quem comita a tradução (`traducaoDaFala.ts`)
 * deixa `origemDaTraducao` no balão, e só no final: parcial traduzido, fala sem tradução e falha não a levam, então não
 * há marca para eles. Uma marca por balão, mesmo que ele seja retraduzido. Só instrumentação: nada aqui muda a tela.
 */
import { useEffect, useRef } from 'react';

import { capMetrics } from '../../gateway/capture/captureMetrics';
import { marcar } from '../../gateway/marcasDeDesempenho';
import type { SpeechSegment } from './tiposDaFala';

/** Quantos balões, do mais novo para trás, a varredura de cada commit olha (a tradução final é sempre dos últimos). */
const JANELA_DE_BALOES = 16;
/** Teto dos ids já marcados: o mais antigo sai (o Set guarda a ordem de inserção). */
const TETO_DE_IDS = 400;

export function useMarcaDaLegenda(segmentos: readonly SpeechSegment[]): void {
  const marcados = useRef(new Set<string>());
  useEffect(() => {
    // Sessão nova (lista vazia): os ids `mic-1`, `sys-1`… voltam e têm de poder marcar de novo.
    if (segmentos.length === 0) {
      marcados.current.clear();
      return;
    }
    for (let i = segmentos.length - 1, visto = 0; i >= 0 && visto < JANELA_DE_BALOES; i--, visto++) {
      const { id, isPartial, origemDaTraducao: origem } = segmentos[i];
      if (isPartial || !origem || marcados.current.has(id)) continue;
      marcados.current.add(id);
      if (marcados.current.size > TETO_DE_IDS)
        marcados.current.delete(marcados.current.values().next().value as string);
      requestAnimationFrame(() => {
        const t = performance.now();
        marcar('legenda:traduzida', { id, origem }, t);
        capMetrics.legendaTraduzida(id, origem, t);
      });
    }
  }, [segmentos]);
}
