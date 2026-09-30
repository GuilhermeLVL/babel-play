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
 * Sem conta: guarda "eu ia assinar o X" (`lib/intencaoDeLogin`) e abre o login. Quem termina o
 * login volta ao checkout com o plano escolhido, mesmo pelo Google ou pela aba da confirmação.
 */
export function entrarParaAssinar(plano: PlanoPago, aoEntrar: (() => void) | undefined): void {
  guardarIntencao({ rota: '/plano/assinar', plano });
  aoEntrar?.();
}
