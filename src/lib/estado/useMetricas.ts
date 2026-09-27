import { type Dispatch, type SetStateAction,useEffect, useMemo, useState } from 'react';

import { toast } from '../../components/Toast';
import { type AppMetrics, fetchMetrics, fetchRecordes, type RecordeDoJogo } from '../../data/api';
import { hidratarAprimoramentos } from '../aprimoramentos';
import { hidratarCromas } from '../galeria/cromas';
import { t } from '../i18n';
import { estadoDeIdentidade } from '../identidade';
import { hidratarPosse } from '../loja';
import { reivindicarMetaDoDia } from '../metaDoDia';
import { registrarPresencaHoje } from '../presenca';
import { type DerivedProgress,deriveProgress } from '../progress';

export interface EstadoDasMetricas {
  metrics: AppMetrics | null;
  recordes: RecordeDoJogo[];
  progress: DerivedProgress;
  setVersaoDasMetricas: Dispatch<SetStateAction<number>>;
}

/**
 * MÉTRICAS DO PERFIL — carregadas UMA vez, aqui, e distribuídas por prop.
 * O StudioHeader chamava `fetchMetrics()` por conta própria em paralelo ao Hub: duas
 * requisições para o mesmo endpoint e, quando ela falhava, um número inventado na tela.
 * Recarrega quando a lista de sessões muda, que é quando o dado de fato envelhece.
 *
 * `quantidadeDeSessoes` é o `recordings.length` que o `App` já usava como dependência.
 */
export function useMetricas(quantidadeDeSessoes: number): EstadoDasMetricas {
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [recordes, setRecordes] = useState<RecordeDoJogo[]>([]);
  /* ECONOMIA v2: além da lista de sessões, uma rodada gravada, uma presença ou um crédito de
     conquista também envelhecem as métricas — quem faz isso dispara `babel:metricas-mudaram`. */
  const [versaoDasMetricas, setVersaoDasMetricas] = useState(0);
  useEffect(() => {
    const bump = () => setVersaoDasMetricas((v) => v + 1);
    window.addEventListener('babel:metricas-mudaram', bump);
    window.addEventListener('babel:conquista', bump);
    return () => { window.removeEventListener('babel:metricas-mudaram', bump); window.removeEventListener('babel:conquista', bump); };
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMetrics(), fetchRecordes()])
      .then(([m, rs]) => {
        if (!alive) return;
        setMetrics(m);
        setRecordes(rs);
        /* B4: o servidor é a fonte da posse da Loja. COM CONTA ele SUBSTITUI o espelho local
           (01/09): a união de antes preservava a compra offline e, junto com ela, qualquer id
           injetado à mão no localStorage — que nunca mais saía. Sem conta a união continua,
           porque ali o espelho local é a única fonte que existe. */
        const comConta = estadoDeIdentidade() === 'conta';
        hidratarPosse(m?.itensComprados, comConta);
        hidratarCromas(m?.cromasComprados, comConta);
        hidratarAprimoramentos(m?.aprimoramentos, comConta);
      })
      .catch(() => { if (alive) setMetrics(null); });
    return () => { alive = false; };
  }, [quantidadeDeSessoes, versaoDasMetricas]);

  const progress = useMemo(() => deriveProgress(metrics), [metrics]);

  /* PRESENÇA DO DIA — uma vez por dia, no boot, SÓ COMO ESTATÍSTICA (recompensas v2): abrir o app
     não paga nada e não estende a ofensiva, então não há toast nem recarga das métricas. */
  useEffect(() => {
    void registrarPresencaHoje();
  }, []);

  /* A META DO DIA: quando as métricas novas mostram os acertos de hoje alcançando a meta, pede o
     crédito uma vez. O toast só aparece quando o servidor creditou de verdade. */
  useEffect(() => {
    let alive = true;
    void reivindicarMetaDoDia(metrics).then((r) => {
      if (!alive || !r) return;
      toast.ok(t('+{n} Seeds · meta do dia cumprida', { n: r.seeds }));
      setVersaoDasMetricas((v) => v + 1);
    });
    return () => { alive = false; };
  }, [metrics]);

  return { metrics, recordes, progress, setVersaoDasMetricas };
}
