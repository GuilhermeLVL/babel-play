import type { EstadoDasMissoes } from '@core';
import { useEffect, useState } from 'react';

import { fetchMetrics, lerMissoes } from '../../data/api';
import { recompensasV2Ligadas } from '../../lib/recompensasV2';

/**
 * O QUE A PRÁTICA MOVEU NO DIA (recompensas v2, spec 10.2): as missões do dia e a ofensiva, no fim
 * da revisão e no fim da rodada — o mesmo bloco nos dois lugares.
 *
 * TUDO DO SERVIDOR, lido DEPOIS de a prática ser gravada (quem chama decide o momento com `pronto`):
 * `GET /api/metrics/missoes` e o perfil (`streakDays`). Sem resposta, o bloco não aparece — número
 * inventado é pior do que número nenhum. Só com a flag `recompensas_v2`.
 *
 * PERFIL PROTEGIDO: as missões aparecem (são o ponto de parada do dia), a ofensiva não — nada que
 * lembre sequência para quem é menor (spec 3).
 */
export function useResumoDaPratica(pronto: boolean): { missoes: EstadoDasMissoes | null; ofensiva: number | null } {
  const [estado, setEstado] = useState<{ missoes: EstadoDasMissoes | null; ofensiva: number | null }>({
    missoes: null,
    ofensiva: null,
  });
  useEffect(() => {
    if (!pronto || !recompensasV2Ligadas()) return;
    let vivo = true;
    void Promise.all([lerMissoes().catch(() => null), fetchMetrics().catch(() => null)]).then(([missoes, m]) => {
      if (!vivo) return;
      setEstado({ missoes, ofensiva: m ? (m.streakDays ?? 0) : null });
    });
    return () => {
      vivo = false;
    };
  }, [pronto]);
  return estado;
}
