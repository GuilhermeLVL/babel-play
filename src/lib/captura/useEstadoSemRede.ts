import { useEffect, useState } from 'react';

import { type CapacidadeOffline,capacidadesSemRede } from '../../core/modoOffline';
import { areModelsCached, expectedModelIds } from '../../gateway/modelCache';
import { useLangConfig } from '../langConfig';
import { useSemRede } from './useSemRede';

/**
 * O QUE FUNCIONA SEM REDE, AGORA (change `modo-offline-declarado`): junta `navigator.onLine` (`useSemRede`), o que o
 * app sabe dos modelos baixados (`areModelsCached`, manifesto + Cache Storage) e se o aparelho roda motor local
 * (WebAssembly) e entrega a lista de `core/modoOffline`. Os modelos são os do par de idiomas atual e só são
 * conferidos quando `ativo` (a faixa só precisa disso offline).
 */
export function useEstadoSemRede(ativo = true): { semRede: boolean; capacidades: CapacidadeOffline[] | null } {
  const semRede = useSemRede();
  const { mine, studying } = useLangConfig();
  const [modelos, setModelos] = useState<{ fala: boolean; traducao: boolean } | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const [fala, ...traducao] = expectedModelIds(mine, studying);
    void Promise.all([areModelsCached([fala]), areModelsCached(traducao)])
      .then(([f, t]) => vivo && setModelos({ fala: f, traducao: t }))
      .catch(() => vivo && setModelos({ fala: false, traducao: false }));
    return () => {
      vivo = false;
    };
  }, [ativo, mine, studying, semRede]);

  if (!modelos) return { semRede, capacidades: null };
  return {
    semRede,
    capacidades: capacidadesSemRede({
      online: !semRede,
      modeloDeFalaBaixado: modelos.fala,
      modeloDeTraducaoBaixado: modelos.traducao,
      motorLocalDisponivel: typeof WebAssembly !== 'undefined',
    }),
  };
}
