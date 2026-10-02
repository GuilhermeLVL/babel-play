/**
 * A CHAVE DAS TELAS NOVAS DO QUEST (maquete de 01/10/2026).
 *
 * Cada tela redesenhada para o headset entra atrás desta chave: ligada de fábrica, e desligável em
 * `/diagnostico` sem novo deploy. Se uma tela nova sair errada no aparelho, o dono desliga e a tela de
 * antes volta na hora. Só vale no perfil `quest`; computador e celular nunca passam por aqui.
 */
import { useSyncExternalStore } from 'react';

import { perfilDoDispositivo } from './perfil';

export const CHAVE_DA_TELA_NOVA_DO_QUEST = 'babel.quest.telaNova';
const EVENTO = 'babel:quest-tela-nova';

export function telaNovaDoQuest(): boolean {
  try {
    return localStorage.getItem(CHAVE_DA_TELA_NOVA_DO_QUEST) !== 'nao';
  } catch {
    return true;
  }
}

export function definirTelaNovaDoQuest(ligada: boolean): void {
  try {
    if (ligada) localStorage.removeItem(CHAVE_DA_TELA_NOVA_DO_QUEST);
    else localStorage.setItem(CHAVE_DA_TELA_NOVA_DO_QUEST, 'nao');
  } catch {
    /* sem armazenamento: vale o padrão */
  }
  marcarQuestNovoNoDocumento();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

/** As telas novas valem AQUI: o aparelho é um Quest e a chave está ligada. */
export function questNovo(): boolean {
  return perfilDoDispositivo().tipo === 'quest' && telaNovaDoQuest();
}

/** `<html data-quest-novo>`: é o que o CSS de `styles/quest.css` lê. Chamado no boot e a cada troca da chave. */
export function marcarQuestNovoNoDocumento(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.questNovo = String(questNovo());
}

const assinar = (aoMudar: () => void) => {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
};

/** `questNovo()` para componentes: desligar a chave em `/diagnostico` devolve a tela de antes na hora. */
export function useQuestNovo(): boolean {
  return useSyncExternalStore(assinar, questNovo, () => false);
}

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
