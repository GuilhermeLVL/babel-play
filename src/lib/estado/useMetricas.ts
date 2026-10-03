import type { EstadoDasMissoes } from '@core';
import { type Dispatch, type SetStateAction,useEffect, useMemo, useState } from 'react';

import { toast } from '../../components/Toast';
import { type AppMetrics, fetchMetrics, fetchRecordes, lerMissoes, type RecordeDoJogo } from '../../data/api';
import { hidratarCromas } from '../galeria/cromas';
import { t } from '../i18n';
import { estadoDeIdentidade } from '../identidade';
import { hidratarPosse } from '../loja';
import { reivindicarMetaDoDia } from '../metaDoDia';
import { registrarPresencaHoje } from '../presenca';
import { type DerivedProgress,deriveProgress } from '../progress';
import { reembolsarUmaVez } from '../recompensasV2';

export interface EstadoDasMetricas {
  metrics: AppMetrics | null;
  recordes: RecordeDoJogo[];
  progress: DerivedProgress;
  /** As missões do dia, do servidor. `null` até chegarem (ou se a rota falhar). */
  missoes: EstadoDasMissoes | null;
  /** `true` até a PRIMEIRA resposta das missões (ou a falha das métricas): a tela reserva o lugar do bloco (CLS). */
  missoesPendentes: boolean;
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
  const [metricasFalharam, setMetricasFalharam] = useState(false);
  const [missoesRespondidas, setMissoesRespondidas] = useState(false);
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
        setMetricasFalharam(false);
        setRecordes(rs);
        /* B4: o servidor é a fonte da posse da Loja. COM CONTA ele SUBSTITUI o espelho local
           (01/09): a união de antes preservava a compra offline e, junto com ela, qualquer id
           injetado à mão no localStorage — que nunca mais saía. Sem conta a união continua,
           porque ali o espelho local é a única fonte que existe. */
        const comConta = estadoDeIdentidade() === 'conta';
        hidratarPosse(m?.itensComprados, comConta);
        hidratarCromas(m?.cromasComprados, comConta);
      })
      .catch(() => { if (alive) { setMetrics(null); setMetricasFalharam(true); } });
    return () => { alive = false; };
  }, [quantidadeDeSessoes, versaoDasMetricas]);

  const progress = useMemo(() => deriveProgress(metrics), [metrics]);

  /* PRESENÇA DO DIA — uma vez por dia, no boot, SÓ COMO ESTATÍSTICA (recompensas v2): abrir o app
     não paga nada e não estende a ofensiva, então não há toast nem recarga das métricas. */
  useEffect(() => {
    void registrarPresencaHoje();
  }, []);

  /* O REEMBOLSO DO CORTE DO CATÁLOGO (recompensas v2): uma vez por sessão, DEPOIS que as métricas
     carregam, com a flag ligada ou não (o corte é regra do servidor). Não corre contra o cache das
     flags: não depende dele. O aviso é por conta (`avisoPendente`). */
  const metricasCarregadas = metrics !== null;
  useEffect(() => {
    if (!metricasCarregadas) return;
    void reembolsarUmaVez().then((n) => {
      if (!n) return;
      toast.info(t('Trocamos os cursores e emojis por recompensas novas. Suas Seeds voltaram: +{n}', { n }));
      setVersaoDasMetricas((v) => v + 1);
    });
  }, [metricasCarregadas]);

  /* AS MISSÕES DO DIA (recompensas v2, onda 5): relidas do servidor a cada métrica nova (uma
     rodada, uma revisão, uma palavra salva). Quando as três fecham e a meta ainda não foi
     creditada, pede o crédito uma vez; o toast só aparece quando o servidor creditou de verdade. */
  const [missoes, setMissoes] = useState<EstadoDasMissoes | null>(null);
  useEffect(() => {
    if (!metrics) return;
    let alive = true;
    void lerMissoes().then(async (estado) => {
      if (!alive) return;
      setMissoes(estado);
      setMissoesRespondidas(true);
      const r = await reivindicarMetaDoDia(estado);
      if (!alive || !r) return;
      toast.ok(t('Meta do dia concluída: +{n} Seeds', { n: r.seeds }));
      setVersaoDasMetricas((v) => v + 1);
    });
    return () => { alive = false; };
  }, [metrics]);

  const missoesPendentes = !missoesRespondidas && !metricasFalharam;
  return { metrics, recordes, progress, missoes, missoesPendentes, setVersaoDasMetricas };
}
