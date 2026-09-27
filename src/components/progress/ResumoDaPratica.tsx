import type { EstadoDasMissoes } from '@core';
import { Flame } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchMetrics, lerMissoes } from '../../data/api';
import { tp } from '../../lib/i18n';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { recompensasV2Ligadas } from '../../lib/recompensasV2';
import MissoesDoDia from './MissoesDoDia';

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

export default function ResumoDaPratica({ pronto = true }: { pronto?: boolean }) {
  const { missoes, ofensiva } = useResumoDaPratica(pronto);
  const mostraOfensiva = ofensiva !== null && ofensiva > 0 && !perfilProtegido();
  if (!missoes && !mostraOfensiva) return null;
  return (
    <div data-testid="resumo-da-pratica" style={{ marginTop: 18, textAlign: 'left' }}>
      {mostraOfensiva && (
        <p className="linha tn" style={{ gap: 6, fontSize: 13, justifyContent: 'center', marginBottom: 10 }} data-ofensiva={ofensiva}>
          <Flame aria-hidden style={{ width: 15, height: 15, color: 'var(--warn)' }} />
          {tp(ofensiva, 'Ofensiva: {n} dia de prática', 'Ofensiva: {n} dias de prática')}
        </p>
      )}
      <MissoesDoDia estado={missoes} />
    </div>
  );
}
