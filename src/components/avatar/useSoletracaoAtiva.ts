import { useCallback, useEffect, useState } from 'react';

import type { DecisaoDeSoletracao, MotivoDaPulada } from '../../core/avatar/sinais/soletracaoDoInterprete';

export type SoletracaoEmCurso = Extract<DecisaoDeSoletracao, { tipo: 'soletrar' }>;

/** Quanto tempo o quadro da soletração fica à vista depois que ela termina (dá tempo de ler o nome). */
const RESPIRO_DEPOIS_DO_FIM_MS = 1_600;
/** Quanto tempo o aviso "soletração pulada" fica depois que a voz para. */
const RESPIRO_DA_PULADA_MS = 3_000;

/**
 * A SOLETRAÇÃO EM CURSO, em sincronia com a fila de voz. `itemId` é a fala em voz agora.
 *
 *  · chegou uma decisão `soletrar`: entra em curso;
 *  · chegou outra fala (sem nome a soletrar, ou pulada): a que estava em curso é ABANDONADA, a fila andou;
 *  · a voz parou (sem fala): a soletração em curso termina sozinha, em `aoFim`.
 *
 * Nada aqui chama a voz nem a legenda: é só o estado de um quadro visual.
 */
export function useSoletracaoAtiva(decisao: DecisaoDeSoletracao, itemId: string | null) {
  const [ativa, setAtiva] = useState<SoletracaoEmCurso | null>(null);
  const [pulada, setPulada] = useState<MotivoDaPulada | null>(null);

  useEffect(() => {
    if (decisao.tipo === 'soletrar') {
      setAtiva(decisao);
      setPulada(null);
    } else if (decisao.tipo === 'pulada') {
      setAtiva(null);
      setPulada(decisao.motivo);
    } else if (decisao.tipo === 'desligada' || itemId !== null) {
      setAtiva(null);
      setPulada(null);
    }
  }, [decisao, itemId]);

  useEffect(() => {
    if (!pulada || itemId !== null) return;
    const id = window.setTimeout(() => setPulada(null), RESPIRO_DA_PULADA_MS);
    return () => window.clearTimeout(id);
  }, [pulada, itemId]);

  const aoFim = useCallback((id: string) => {
    window.setTimeout(() => setAtiva((a) => (a?.id === id ? null : a)), RESPIRO_DEPOIS_DO_FIM_MS);
  }, []);

  return { ativa, pulada, aoFim };
}
