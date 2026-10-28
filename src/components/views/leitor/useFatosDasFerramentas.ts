import { useEffect, useState } from 'react';

import type { FatosDasFerramentas } from '../../../core/leitura/ferramentasDeIa';
import { definicaoDoPlano, FLAG_IA_DE_ESTUDO, FLAG_PARCEIRO_DE_LEITURA } from '../../../core/planos';
import { getEntitlements, onPlanChange } from '../../../lib/entitlements';
import { useFlag } from '../../../lib/flags';
import { aoMudarIdentidade, estadoDeIdentidade } from '../../../lib/identidade';
import { aoMudarProtecao, estadoDaProtecao } from '../../../lib/protecaoDoMenor';

/**
 * Os FATOS que `estadoDaFerramenta` pede, lidos do app (flags, plano, conta, idade, conexão) e atualizados quando
 * algum deles muda. A decisão em si é pura (`src/core/leitura/ferramentasDeIa.ts`).
 */
export function useFatosDasFerramentas(cotaEsgotada: FatosDasFerramentas['cotaEsgotada']): FatosDasFerramentas {
  const iaDeEstudoLigada = useFlag(FLAG_IA_DE_ESTUDO);
  const parceiroLigado = useFlag(FLAG_PARCEIRO_DE_LEITURA);
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
    iaDeEstudoLigada,
    parceiroLigado,
    /* Sem login exigido (self-host, dev local) a instância é da própria pessoa: não há conta a pedir. */
    temConta: identidade === 'conta' || identidade === 'selfhost',
    planoGratis: e.plan === 'free',
    explicacoesMes: quotas.explicacoesMes,
    parceiroDia: quotas.parceiroDia,
    nuvemRestritaPelaIdade: estadoDaProtecao()?.restrita === true,
    online,
    cotaEsgotada,
  };
}
