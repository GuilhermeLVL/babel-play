import { useEffect, useState } from 'react';

import {
  ehRotaDeCheckout,
  ehSubTelaDeCheckout,
  EVENTO_SUBTELA_DE_PLANOS,
  lerPlanosTelaDoBoot,
  urlParaEstado,
} from '../rotas';

/**
 * A PESSOA ESTÁ NO CHECKOUT? (funil de venda, 2026-09-29). O teste de ponta a ponta viu o modal da
 * migração subir por cima do pagamento logo depois do login, e a pergunta da idade tomaria a tela
 * inteira no mesmo lugar. Os dois esperam a pessoa sair daqui.
 *
 * A sub-tela de Planos não é view do App: mora na URL, e muda por `popstate` (voltar, `navegarPara`)
 * ou pelo evento da sub-tela. Os eventos só pedem uma nova renderização — a resposta é lida da barra
 * NA renderização, então qualquer render do App (a view mudou, a proteção chegou) já a vê fresca.
 * No boot a barra passa por `/plano` antes de a tela devolver a sub-tela; a do boot conta também.
 */
export function useEmCheckout(activeView: string): boolean {
  const [, setVersao] = useState(0);
  useEffect(() => {
    const mudou = () => setVersao((n) => n + 1);
    window.addEventListener('popstate', mudou);
    window.addEventListener(EVENTO_SUBTELA_DE_PLANOS, mudou);
    return () => {
      window.removeEventListener('popstate', mudou);
      window.removeEventListener(EVENTO_SUBTELA_DE_PLANOS, mudou);
    };
  }, []);
  if (activeView !== 'planos' || typeof window === 'undefined') return false;
  const caminho = window.location.pathname;
  if (ehRotaDeCheckout(caminho)) return true;
  return !urlParaEstado(caminho).planosTela && ehSubTelaDeCheckout(lerPlanosTelaDoBoot());
}
