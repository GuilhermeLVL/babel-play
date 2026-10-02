/**
 * AS PREFERÊNCIAS QUE SÓ O HEADSET TEM: de onde vem o som, a vibração do controle e o tamanho da legenda
 * ao vivo. Moravam em `telaNovaDoQuest.ts`, que o `App` importa no arranque; aqui só chegam com as telas
 * que as usam (o JS inicial tem orçamento, e o computador e o celular nunca leem nada disto).
 */
import { useSyncExternalStore } from 'react';

/**
 * DE ONDE VEM O SOM NO QUEST. De fábrica, OS DOIS (pedido do dono em 01/10/2026: o som do headset e o
 * microfone juntos); a escolha da pessoa fica guardada neste aparelho.
 */
export type FonteGuardadaDoQuest = 'headset' | 'mic' | 'ambos';
export const CHAVE_DA_FONTE_DO_QUEST = 'babel.quest.fonte';

export function lerFonteDoQuest(): FonteGuardadaDoQuest {
  try {
    const v = localStorage.getItem(CHAVE_DA_FONTE_DO_QUEST);
    return v === 'headset' || v === 'mic' || v === 'ambos' ? v : 'ambos';
  } catch {
    return 'ambos';
  }
}

export function guardarFonteDoQuest(fonte: FonteGuardadaDoQuest): void {
  try {
    localStorage.setItem(CHAVE_DA_FONTE_DO_QUEST, fonte);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/**
 * A VIBRAÇÃO DO CONTROLE ao apontar para algo clicável (`respostaAoApontar.ts`). De fábrica, FORTE: no
 * teste do dono (01/10/2026) o pulso curto mal se sentia. Onde o navegador não entrega o motor do
 * controle, a mesma chave vale para o tique sonoro que o substitui.
 */
export type VibracaoDoQuest = 'desligada' | 'suave' | 'forte';
export const VIBRACOES_DO_QUEST: readonly VibracaoDoQuest[] = ['desligada', 'suave', 'forte'];
export const CHAVE_DA_VIBRACAO_DO_QUEST = 'babel.quest.vibracao';
const EVENTO_DA_VIBRACAO = 'babel:quest-vibracao';

export function lerVibracaoDoQuest(): VibracaoDoQuest {
  try {
    const v = localStorage.getItem(CHAVE_DA_VIBRACAO_DO_QUEST);
    return v === 'desligada' || v === 'suave' || v === 'forte' ? v : 'forte';
  } catch {
    return 'forte';
  }
}

export function guardarVibracaoDoQuest(v: VibracaoDoQuest): void {
  try {
    localStorage.setItem(CHAVE_DA_VIBRACAO_DO_QUEST, v);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_DA_VIBRACAO));
}

const assinarVibracao = (aoMudar: () => void) => {
  window.addEventListener(EVENTO_DA_VIBRACAO, aoMudar);
  return () => window.removeEventListener(EVENTO_DA_VIBRACAO, aoMudar);
};

export function useVibracaoDoQuest(): VibracaoDoQuest {
  return useSyncExternalStore(assinarVibracao, lerVibracaoDoQuest, () => 'forte' as const);
}

/** Os passos do tamanho da legenda ao vivo (diretriz da Meta: três ou mais, de 50% a 200%). */
export const ESCALAS_DA_LEGENDA = [0.75, 1, 1.25, 1.5, 2] as const;
export const CHAVE_DA_ESCALA_DA_LEGENDA = 'babel.quest.legenda';

export function lerEscalaDaLegenda(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_DA_ESCALA_DA_LEGENDA));
    return (ESCALAS_DA_LEGENDA as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** O passo vizinho (`+1` maior, `-1` menor), parando nas pontas; grava a escolha. */
export function mudarEscalaDaLegenda(atual: number, passo: 1 | -1): number {
  const i = (ESCALAS_DA_LEGENDA as readonly number[]).indexOf(atual);
  const proximo = ESCALAS_DA_LEGENDA[Math.max(0, Math.min(ESCALAS_DA_LEGENDA.length - 1, (i < 0 ? 1 : i) + passo))];
  try {
    localStorage.setItem(CHAVE_DA_ESCALA_DA_LEGENDA, String(proximo));
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
  return proximo;
}
