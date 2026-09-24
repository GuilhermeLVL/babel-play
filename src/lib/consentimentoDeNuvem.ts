import { lerPreferencias, mudarConsentimento, usePreferencias } from './preferencias';

/**
 * O CONSENTIMENTO DE NUVEM, lido de onde ele é guardado — Ajustes → Privacidade, com o registro
 * datado de cada mudança (`src/lib/preferencias.ts`).
 *
 * Seis telas montavam o gateway com `cloudConsent: () => true`: o "sim" do usuário não era
 * perguntado em lugar nenhum e a fala dele saía para servidores de IA mesmo assim. Agora elas
 * passam esta função, que é lida A CADA chamada — autorizar ou retirar vale na hora, sem recriar o
 * gateway (Fase 2 do lançamento).
 */
export const consentiuNuvem = (): boolean => lerPreferencias().consentimentos.nuvem === true;

/** Para telas: o estado reativo e a ação de autorizar (grava com data, como Ajustes). */
export function useConsentimentoDeNuvem(): { consentiu: boolean; autorizar: () => Promise<boolean> } {
  const p = usePreferencias();
  return { consentiu: p.consentimentos.nuvem === true, autorizar: () => mudarConsentimento('nuvem', true) };
}
