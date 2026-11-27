import { useEffect, useState } from 'react';

import type { FatosDoAjustarNivel } from '../../../core/leitura/ferramentasDeIa';
import { definicaoDoPlano, FLAG_IA_AJUSTAR_NIVEL } from '../../../core/planos';
import { getEntitlements, onPlanChange } from '../../../lib/entitlements';
import { useFlag } from '../../../lib/flags';
import { aoMudarIdentidade, estadoDeIdentidade } from '../../../lib/identidade';
import { aoMudarProtecao, estadoDaProtecao } from '../../../lib/protecaoDoMenor';

/**
 * Os FATOS do "Ajustar nível" (`estadoDoAjustarNivel`), lidos do app (flag, plano, conta, idade, conexão) e atualizados
 * quando algum deles muda. A decisão em si é pura (`src/core/leitura/ferramentasDeIa.ts`); quem decide de verdade é o servidor.
 */
export function useFatosDoAjustarNivel(cotaEsgotada: FatosDoAjustarNivel['cotaEsgotada']): FatosDoAjustarNivel {
  const flagLigada = useFlag(FLAG_IA_AJUSTAR_NIVEL);
  const [, refazer] = useState(0);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const bump = () => refazer((n) => n + 1);
    const desfazer = [onPlanChange(bump), aoMudarProtecao(bump), aoMudarIdentidade(bump)];
    const sobe = () => setOnline(true);
    const cai = () => setOnline(false);
    window.addEventListener('online', sobe);
    window.addEventListener('offline', cai);
    return () => {
      desfazer.forEach((d) => d());
      window.removeEventListener('online', sobe);
      window.removeEventListener('offline', cai);
    };
  }, []);

  const e = getEntitlements();
  /* O cliente sabe o PLANO; as cotas dele moram na matriz (`planos.ts`). Sem conta (`anonimo`) vale o convidado. */
  const quotas = definicaoDoPlano(e.plan === 'anonimo' ? 'convidado' : e.plan).quotas;
  const identidade = estadoDeIdentidade();
  return {
    flagLigada,
    /* Sem login exigido (self-host, dev local) a instância é da própria pessoa: não há conta a pedir. */
    temConta: identidade === 'conta' || identidade === 'selfhost',
    nuvemRestritaPelaIdade: estadoDaProtecao()?.restrita === true,
    ajustesDeNivelMes: quotas.ajustesDeNivelMes,
    ajustesDeCapituloMes: quotas.ajustesDeCapituloMes,
    online,
    cotaEsgotada,
  };
}
