/**
 * AJUSTES → CONTA: o cartão do plano — porte de `telas2.js:140-143`.
 *
 * No protótipo a conta é de mentira (`conta.premium`) e o cartão tem dois títulos. Aqui o plano é o
 * que o servidor diz (`getEntitlements`), com a mesma regra do selo do Início (`rotuloDoPlano`,
 * `InicioDoQuest.tsx`) e da linha do Mais (`fraseDoPlano`, `TrilhoDoQuest.tsx`): quem já assina lê
 * "Premium", sem o "em teste".
 */
import { type RefObject, useEffect } from 'react';

import { getEntitlements } from '../entitlements';
import { t } from '../i18n';
import { abaAVista } from './personalizar';
import { planoDeProva } from './planos';

/** O título do cartão: os dois de `telas2.js:142`, e "Premium" para quem já assina. */
export function tituloDoPlanoNaConta(): string {
  const { plan, teste } = getEntitlements();
  const plano = planoDeProva() ?? plan;
  if (plano === 'free' || plano === 'anonimo') return t('Seu plano: Grátis');
  return teste ? t('Seu plano: Premium, em teste') : t('Seu plano: Premium');
}

/** A frase do cartão (`telas2.js:142`). */
export const fraseDoPlanoNaConta = (): string => t('Veja o que cada plano inclui, o seu consumo e a sua assinatura.');

/* ---- A aba escolhida à vista (`sentidos.js:292-305`) ----------------------------------------------- */

/**
 * No celular as abas ficam numa linha que rola de lado (`celular.css:229`). Depois de cada troca de
 * tela ou de aba o protótipo leva a aba escolhida para o meio de TODAS as barras da tela, um quadro
 * depois (`requestAnimationFrame(abaAVista)`). Ajustes tem seis abas e Estatísticas sete: sem isto a
 * escolhida ficava fora da tela.
 */
export function useAbasAVista(tela: RefObject<HTMLElement | null>, aba: unknown): void {
  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      for (const g of tela.current?.querySelectorAll<HTMLElement>('.q-abas') ?? []) abaAVista(g);
    });
    return () => cancelAnimationFrame(quadro);
  }, [tela, aba]);
}
