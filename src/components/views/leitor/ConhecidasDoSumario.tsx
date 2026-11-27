import { useEffect, useRef } from 'react';

import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { conhecidasPorItemDoSumario } from '../../../lib/leitor/conhecidasDoSumario';
import type { ItemDoSumario } from '../../../lib/leitor/foliate/view.js';
import type { MotorDoLeitor } from '../../../lib/leitor/motor';

/**
 * Componente sem tela: calcula, no aparelho e em tempo ocioso, a % de palavras conhecidas de cada capítulo do sumário
 * (flag `leitor_destaque_vocab`; tarefa C4). Refaz quando o que a pessoa sabe muda. Só é montado com a flag e o
 * destaque ligados, então desligado nada daqui assina o índice de etiquetas nem lê capítulo.
 */
export default function ConhecidasDoSumario({
  motor,
  sumario,
  idioma,
  aoCalcular,
}: {
  motor: MotorDoLeitor;
  sumario: ItemDoSumario[];
  idioma: string;
  aoCalcular: (m: ReadonlyMap<string, number>) => void;
}) {
  const s = useSnapshotDasEtiquetas();
  const aoCalcularRef = useRef(aoCalcular);
  aoCalcularRef.current = aoCalcular;
  useEffect(() => {
    if (!idioma || s.caderno === null || !sumario.length) return;
    let cancelado = false;
    const fonte = { caderno: s.caderno, forcas: s.forcas, marcadas: s.marcadas };
    /* Pequena folga: várias escritas seguidas no índice (um lote de "Já sei") viram uma conta só. */
    const espera = window.setTimeout(() => {
      void conhecidasPorItemDoSumario({
        livro: motor.livro,
        sumario,
        idioma,
        fonte,
        cancelado: () => cancelado,
        aoProgredir: (m) => {
          if (!cancelado) aoCalcularRef.current(new Map(m));
        },
      }).catch((e: unknown) => console.warn('[sumario] não foi possível contar as conhecidas', e));
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [motor, sumario, idioma, s.caderno, s.forcas, s.marcadas]);
  return null;
}
