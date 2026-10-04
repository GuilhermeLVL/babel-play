import { useEffect, useState, useSyncExternalStore } from 'react';

import { lerAbertura } from '../../../data/rotas/idade';
import type { PlanoPago } from '../../../lib/assinatura';
import type { Plan } from '../../../lib/entitlements';
import { useFlag } from '../../../lib/flags';
import { flag } from '../../../lib/flagsCache';
import { aoMudarIdentidade, estadoDeIdentidade } from '../../../lib/identidade';
import { guardarIntencao } from '../../../lib/intencaoDeLogin';

/**
 * O FUNIL DE VENDA — as três perguntas que o cartão de Planos e o checkout fazem antes de oferecer
 * "Assinar" (teste de ponta a ponta com o Asaas sandbox, 2026-09-29).
 */

/**
 * A PESSOA ESTÁ SEM CONTA? No modo público (login exigido) quem não entrou tem identidade
 * `anonimo`, mas o plano que a tela recebe pode ser o Grátis — e `/api/billing/status` falha para
 * ela, o que fazia o checkout dizer "nesta instalação não há cobrança". A identidade é a resposta
 * certa; `plan === 'anonimo'` continua valendo para quem já o recebe assim.
 */
export function useSemConta(plan: Plan): boolean {
  const anonimo = useSyncExternalStore(
    aoMudarIdentidade,
    () => estadoDeIdentidade() === 'anonimo',
    () => false,
  );
  return plan === 'anonimo' || anonimo;
}

/**
 * A VENDA ESTÁ ABERTA? Fecha com a porta de emergência (`CHECKOUT_ENABLED=0`, lida em
 * `/api/abertura`) ou com a flag `vender_planos` DESLIGADA de fato. Flag ausente do cache (rede
 * ainda não respondeu, operador apagou a linha) não fecha a venda: quem recusa de verdade é o
 * servidor (503 `checkout_desligado`), e o checkout mostra a pausa quando ele recusa.
 */
export function useVendaAberta(): boolean {
  useFlag('vender_planos'); // assina as mudanças do cache; o valor lido é o de `flag()` abaixo
  const [porta, setPorta] = useState(true);
  useEffect(() => {
    let vivo = true;
    void lerAbertura().then((a) => {
      if (vivo) setPorta(a.checkout);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return porta && flag('vender_planos')?.ligada !== false;
}

/**
 * O ANUAL ESTÁ À VENDA? `ANUAL_ENABLED=0` no servidor (lida em `/api/abertura`) tira o anual, à vista
 * e em 12x, de Planos, do checkout e de Sua assinatura: o MVP vende só o mensal e o teste. Ausente na
 * resposta, falha de rede e edição estática = à venda, como sempre foi (o servidor recusa de todo
 * jeito: 503 `anual_indisponivel`).
 *
 * A última resposta fica guardada no aparelho: a tela abre já sem o anual, em vez de mostrá-lo por
 * um instante até a rede responder.
 */
const CHAVE_DO_ANUAL_FORA = 'babel.anualForaDeVenda';
function anualConhecido(): boolean {
  try {
    return localStorage.getItem(CHAVE_DO_ANUAL_FORA) !== '1';
  } catch {
    return true;
  }
}
function lembrarAnual(aVenda: boolean): void {
  try {
    if (aVenda) localStorage.removeItem(CHAVE_DO_ANUAL_FORA);
    else localStorage.setItem(CHAVE_DO_ANUAL_FORA, '1');
  } catch {
    /* sem armazenamento: só não lembra entre visitas */
  }
}
export function useAnualAVenda(): boolean {
  const [aVenda, setAVenda] = useState(anualConhecido);
  useEffect(() => {
    let vivo = true;
    void lerAbertura().then((a) => {
      // `!== false`: resposta sem o campo (servidor de antes da chave) é o anual à venda.
      const v = a.anual !== false;
      lembrarAnual(v);
      if (vivo) setAVenda(v);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return aVenda;
}

/**
 * Sem conta: guarda "eu ia assinar o X" (`lib/intencaoDeLogin`) e abre o login. Quem termina o
 * login volta ao checkout com o plano escolhido, mesmo pelo Google ou pela aba da confirmação.
 */
export function entrarParaAssinar(plano: PlanoPago, aoEntrar: (() => void) | undefined): void {
  guardarIntencao({ rota: '/plano/assinar', plano });
  aoEntrar?.();
}
